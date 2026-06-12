import { getOp, type Engine, type NodeInst } from '@webtoe/core';
import { FAMILY_COLORS } from './style';
import { Palette } from './palette';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface ViewTransform { x: number; y: number; k: number }

/** Snapshot of a single node inside the current network container. */
interface NodeSnapshot {
  type: string;
  name: string;
  pos: { x: number; y: number };
  flags: { display: boolean };
  /** Index → source node name (null = no connection). */
  inputs: (string | null)[];
}

/** Snapshot of the current network container's child graph. */
interface GraphSnapshot {
  nodes: NodeSnapshot[];
}

const MAX_UNDO = 20;

/** Network editor: DOM node boxes over an SVG wire layer, pan/zoom world. */
export class NetworkView {
  current: NodeInst;
  selected: NodeInst | null = null;
  listMode = false;
  gridSnap = true;

  private readonly world: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly crumb: HTMLDivElement;
  palette: Palette;
  private readonly nodeEls = new Map<number, HTMLDivElement>();
  private readonly thumbs = new Map<number, HTMLDivElement>();
  private tf: ViewTransform = { x: 60, y: 60, k: 1 };
  private preview: SVGPathElement | null = null;
  private dragWireSrc: NodeInst | null = null;
  private lastPointer = { x: 200, y: 200 };
  // Pinch zoom state
  private pinchDist = 0;
  private pinchTf = { x: 0, y: 0, k: 1 };
  /** Pending wire-insert: when set, the next created node will be inserted between these two */
  private _pendingWireInsert: { srcNode: NodeInst; dstNode: NodeInst; dstIdx: number } | null = null;

  // Undo/redo stacks
  private undoStack: GraphSnapshot[] = [];
  private redoStack: GraphSnapshot[] = [];
  /** True while restoring undo/redo — suppresses further snapshotting. */
  private restoring = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly engine: Engine,
    private readonly callbacks: {
      onSelect(node: NodeInst | null): void;
      onStructureChange(): void;
      onEnterNetwork(comp: NodeInst): void;
      toast(msg: string): void;
      /** Emitted when a new node is created (→ auto-zoom in EditorApp) */
      onNodeCreated?(node: NodeInst): void;
    },
  ) {
    this.current = engine.graph.root;
    el.className = 'wt-net';
    el.tabIndex = 0;

    this.world = document.createElement('div');
    this.world.className = 'wt-world';
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.classList.add('wt-wires');
    this.svg.style.width = '1px';
    this.svg.style.height = '1px';
    this.world.appendChild(this.svg);
    el.appendChild(this.world);

    this.crumb = document.createElement('div');
    this.crumb.className = 'wt-crumb';
    el.appendChild(this.crumb);

    const hint = document.createElement('div');
    hint.className = 'wt-hint';
    hint.textContent = 'tab/double-click: add op · drag dot→dot: wire · double-click comp: enter · f: frame · o: overview · u: up · d: display · ⌫: delete';
    el.appendChild(hint);

    this.palette = new Palette(el, (type) => this.createAt(type));
    this.bindEvents();
    this.applyTransform();
  }

  // ------------------------------------------------------------ public

  setNetwork(container: NodeInst): void {
    this.current = container;
    this.select(null);
    this.rebuild();
  }

  rebuild(): void {
    for (const elN of this.nodeEls.values()) elN.remove();
    this.nodeEls.clear();
    this.thumbs.clear();
    const kids = this.engine.graph.childrenOf(this.current);
    for (const n of kids) this.world.appendChild(this.nodeEl(n));
    this.renderCrumb();
    this.updateWires();
  }

  /** redraw wire paths from current node positions */
  updateWires(): void {
    this.svg.querySelectorAll('path:not(.wt-preview)').forEach((p) => p.remove());
    for (const n of this.engine.graph.childrenOf(this.current)) {
      n.inputs.forEach((src, idx) => {
        if (!src || src.parent !== this.current) return;
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', this.wirePath(src, n, idx));
        // Color wire by source node's family
        const srcSpec = getOp(src.type);
        const wireColor = srcSpec ? (FAMILY_COLORS[srcSpec.family] ?? '#666') : '#666';
        p.style.stroke = wireColor;
        // Store wire metadata for double-click insertion
        p.dataset.srcId = String(src.id);
        p.dataset.dstId = String(n.id);
        p.dataset.dstIdx = String(idx);
        p.dataset.family = srcSpec?.family ?? '';
        p.style.cursor = 'pointer';
        // Context menu: right-click / long-press on wire
        p.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.showWireMenu(e.clientX, e.clientY, p);
        });
        this.svg.insertBefore(p, this.preview);
      });
    }
  }

  /** live preview targets for the compositor: visible TOP nodes of the current
   *  network and their reserved thumb elements */
  thumbTargets(): { node: NodeInst; el: HTMLDivElement }[] {
    const out: { node: NodeInst; el: HTMLDivElement }[] = [];
    for (const n of this.engine.graph.childrenOf(this.current)) {
      const el = this.thumbs.get(n.id);
      if (el) out.push({ node: n, el });
    }
    return out;
  }

  /** error badge refresh — cheap, called at low rate */
  updateBadges(): void {
    for (const n of this.engine.graph.childrenOf(this.current)) {
      const el = this.nodeEls.get(n.id);
      if (el) {
        el.classList.toggle('wt-haserr', !!n.error);
        el.classList.toggle('wt-display', n.flags.display);
        el.title = n.error ?? '';
      }
    }
  }

  select(node: NodeInst | null): void {
    this.selected = node;
    for (const [id, el] of this.nodeEls) el.classList.toggle('wt-selected', node?.id === id);
    this.callbacks.onSelect(node);
  }

  goUp(): void {
    if (this.current.parent) {
      this.setNetwork(this.current.parent);
      this.callbacks.onEnterNetwork(this.current);
    }
  }

  // ------------------------------------------------------------ internals

  private renderCrumb(): void {
    this.crumb.innerHTML = '';
    const chain: NodeInst[] = [];
    let cur: NodeInst | null = this.current;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parent;
    }
    chain.forEach((c, i) => {
      const s = document.createElement('span');
      s.textContent = c.parent ? c.name : '/';
      s.addEventListener('click', () => {
        this.setNetwork(c);
        this.callbacks.onEnterNetwork(c);
      });
      this.crumb.appendChild(s);
      if (i < chain.length - 1) this.crumb.appendChild(document.createTextNode(' › '));
    });
  }

  private nodeEl(n: NodeInst): HTMLDivElement {
    const spec = getOp(n.type);
    const el = document.createElement('div');
    el.className = 'wt-node';
    el.dataset.id = String(n.id);
    el.style.transform = `translate(${n.pos.x}px, ${n.pos.y}px)`;

    const fam = document.createElement('div');
    fam.className = 'wt-fam';
    fam.style.background = FAMILY_COLORS[spec.family] ?? '#888';
    if (spec.inputs.min === 0) fam.classList.add('wt-fam-gen');
    el.appendChild(fam);

    if (spec.family === 'TOP' || spec.family === 'SOP' || n.type === 'comp:geo') {
      el.classList.add('wt-has-thumb');
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'wt-thumb';
      el.appendChild(thumbWrap);
      this.thumbs.set(n.id, thumbWrap); // composited live by the app loop
      // Initials label overlay (shown when preview is toggled off, like TD desktop)
      const initLabel = document.createElement('div');
      initLabel.className = 'wt-thumb-init';
      const labelText = (spec.label ?? n.type).replace(/^[a-z]+:/, '').slice(0, 2);
      initLabel.textContent = labelText.toUpperCase();
      initLabel.title = spec.label ?? n.type;
      initLabel.style.display = 'none'; // hidden by default
      thumbWrap.appendChild(initLabel);
    }

    const label = document.createElement('div');
    label.className = 'wt-label';
    label.textContent = n.name;
    const typ = document.createElement('div');
    typ.className = 'wt-typ';
    typ.textContent = n.foreignType ? `⚠ ${n.foreignType}` : (spec.label ?? n.type);
    const err = document.createElement('div');
    err.className = 'wt-err';
    const flag = document.createElement('div');
    flag.className = 'wt-flag';
    flag.title = 'display flag (d)';
    el.append(label, typ, err, flag);

    // stubs (containers expose one input per in-tunnel child)
    const inCount = Math.min(spec.isContainer ? this.engine.graph.inputCapacity(n) : spec.inputs.max, 4);
    for (let i = 0; i < inCount; i++) {
      const stub = document.createElement('div');
      stub.className = 'wt-stub wt-in';
      stub.dataset.idx = String(i);
      stub.style.top = `${14 + i * 16}px`;
      const desc = spec.isContainer ? 'routed to the matching in-tunnel child' : spec.inputLabels?.[i];
      stub.title = `input ${i} · ${spec.family}${desc ? ` — ${desc}` : ''}`
        + (i >= spec.inputs.min || spec.isContainer ? '' : ' (required)');
      stub.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (n.inputs[i]) {
          const src = n.inputs[i]!;
          this.undoable(() => {
            this.engine.graph.disconnect(n, i);
            this.callbacks.onStructureChange();
            this.updateWires();
          });
          this.startWireDrag(src, e);
        } else {
          // Open palette to add a compatible node wired to this input
          this._pendingInputInsert = { dstNode: n, dstIdx: i };
          const r = this.el.getBoundingClientRect();
          this.palette.open(e.clientX - r.left, e.clientY - r.top, spec.family);
        }
      });
      el.appendChild(stub);
    }
    if (spec.family !== 'COMP' || true) {
      const out = document.createElement('div');
      out.className = 'wt-stub wt-out';
      const outDesc = spec.family === 'TOP' ? 'texture'
        : spec.family === 'CHOP' ? 'channels'
        : spec.family === 'DAT' ? 'text'
        : 'out-tunnel child output';
      out.title = `output 0 · ${spec.family} (${outDesc}) — drag onto an input`;
      out.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.startWireDrag(n, e);
      });
      el.appendChild(out);
    }

    // Gear icon to open parameters (visible when selected)
    const gear = document.createElement('div');
    gear.className = 'wt-gear';
    gear.textContent = '⚙';
    gear.title = 'Open parameters';
    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onSelect(n);
      const ev = new CustomEvent('wt-open-params', { detail: n });
      this.el.dispatchEvent(ev);
    });
    el.appendChild(gear);

    // Bypass toggle button (visible when selected)
    const bypassBtn = document.createElement('div');
    bypassBtn.className = 'wt-bypass';
    bypassBtn.textContent = 'B';
    bypassBtn.title = 'Bypass node';
    bypassBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.undoable(() => {
        n.flags.bypass = !n.flags.bypass;
        bypassBtn.classList.toggle('wt-bypass-on', n.flags.bypass);
        bypassBtn.textContent = n.flags.bypass ? '⏭' : 'B';
        el.classList.toggle('wt-bypassed', n.flags.bypass);
        this.callbacks.onStructureChange();
      });
    });
    if (n.flags.bypass) { bypassBtn.classList.add('wt-bypass-on'); bypassBtn.textContent = '⏭'; el.classList.add('wt-bypassed'); }
    el.appendChild(bypassBtn);

    // Resize handle — drag bottom-right corner
    const resize = document.createElement('div');
    resize.className = 'wt-resize';
    resize.title = 'Resize node';
    resize.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      const startW = el.offsetWidth, startH = el.offsetHeight;
      const move = (ev: PointerEvent) => {
        const dw = (ev.clientX - startX) / this.tf.k;
        const dh = (ev.clientY - startY) / this.tf.k;
        el.style.width = `${Math.max(80, startW + dw)}px`;
        el.style.height = `${Math.max(40, startH + dh)}px`;
        this.updateWires();
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });
    el.appendChild(resize);

    // Preview hide toggle (only for nodes with thumbnails)
    if (el.classList.contains('wt-has-thumb')) {
      const prevBtn = document.createElement('div');
      prevBtn.className = 'wt-prevtoggle';
      prevBtn.textContent = '👁';
      prevBtn.title = 'Hide preview';
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const thumb = el.querySelector('.wt-thumb') as HTMLElement;
        const initLabel = el.querySelector('.wt-thumb-init') as HTMLElement;
        if (thumb) {
          const showingPreview = initLabel?.style.display === 'none';
          // Toggle: preview vs initials label (maintains node height)
          if (initLabel) initLabel.style.display = showingPreview ? '' : 'none';
          if (showingPreview) {
            thumb.style.background = '#0e0e12'; // dark bg for initials
            prevBtn.textContent = '👁‍🗨';
            prevBtn.title = 'Show preview';
          } else {
            thumb.style.background = '';
            prevBtn.textContent = '👁';
            prevBtn.title = 'Hide preview';
          }
        }
      });
      el.appendChild(prevBtn);
    }

    // node interactions
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).classList.contains('wt-stub') ||
          (e.target as HTMLElement).classList.contains('wt-gear') ||
          (e.target as HTMLElement).classList.contains('wt-bypass') ||
          (e.target as HTMLElement).classList.contains('wt-prevtoggle') ||
          (e.target as HTMLElement).classList.contains('wt-resize')) return;
      // Middle-click → show info popup
      if (e.button === 1) {
        e.preventDefault();
        this.showNodeInfo(e.clientX, e.clientY, n, spec);
        return;
      }
      e.stopPropagation();
      this.select(n);
      this.el.focus();
      const start = { x: e.clientX, y: e.clientY, nx: n.pos.x, ny: n.pos.y };
      let dragged = false;
      const THRESH = 8; // px threshold before drag starts
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
        if (!dragged && Math.hypot(dx, dy) < THRESH) return;
        dragged = true;
        let nx = start.nx + dx / this.tf.k;
        let ny = start.ny + dy / this.tf.k;
        if (this.gridSnap) {
          nx = Math.round(nx / 10) * 10;
          ny = Math.round(ny / 10) * 10;
        }
        n.pos.x = nx;
        n.pos.y = ny;
        el.style.transform = `translate(${n.pos.x}px, ${n.pos.y}px)`;
        this.updateWires();
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (n.children) {
        this.setNetwork(n);
        this.callbacks.onEnterNetwork(n);
      }
    });
    flag.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleDisplay(n);
    });

    this.nodeEls.set(n.id, el);

    // Drag-and-drop file import for file-based operators
    const hasFileParam = spec.params?.some((p: any) => p.key === 'file');
    if (hasFileParam) {
      el.classList.add('wt-dropzone');
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('wt-dragover'); });
      el.addEventListener('dragleave', () => el.classList.remove('wt-dragover'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('wt-dragover');
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          n.params.set('file', { mode: 'const', value: reader.result as string });
          n.cookedFrame = -1;
          this.callbacks.onStructureChange();
          this.callbacks.toast(`dropped: ${file.name}`);
        };
        reader.readAsDataURL(file);
      });
    }

    // Right-click context menu on node → also long-press on mobile
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.select(n);
      this.showActionBar(e.clientX, e.clientY, n, spec);
    });

    return el;
  }

  private toggleDisplay(n: NodeInst): void {
    this.undoable(() => {
      const on = !n.flags.display;
      for (const sib of this.engine.graph.childrenOf(this.current)) sib.flags.display = false;
      n.flags.display = on;
      this.updateBadges();
      this.callbacks.onStructureChange();
    });
  }

  private startWireDrag(src: NodeInst, e: PointerEvent): void {
    this.dragWireSrc = src;
    if (!this.preview) {
      this.preview = document.createElementNS(SVG_NS, 'path');
      this.preview.classList.add('wt-preview');
      this.svg.appendChild(this.preview);
    }
    const move = (ev: PointerEvent) => {
      const w = this.toWorld(ev.clientX, ev.clientY);
      const a = this.outPos(src);
      this.preview!.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + 60} ${a.y}, ${w.x - 60} ${w.y}, ${w.x} ${w.y}`);
    };
    const up = (ev: PointerEvent) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      this.preview?.removeAttribute('d');
      const src2 = this.dragWireSrc;
      this.dragWireSrc = null;
      if (!src2) return;
      // Find the nearest input stub (more reliable than elementFromPoint)
      const allStubs = [...this.el.querySelectorAll('.wt-stub.wt-in')] as HTMLElement[];
      let bestStub: HTMLElement | undefined;
      let bestDist = 30; // snap threshold in CSS pixels
      for (const s of allStubs) {
        const r = s.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        if (d < bestDist) { bestDist = d; bestStub = s; }
      }
      if (!bestStub) return;
      const nodeEl = bestStub.closest('.wt-node') as HTMLElement;
      const dst = this.engine.graph.childrenOf(this.current).find((c) => String(c.id) === nodeEl.dataset.id);
      if (!dst) return;
      try {
        this.undoable(() => {
          this.engine.graph.connect(src2, dst, Number(bestStub!.dataset.idx));
          this.callbacks.onStructureChange();
          this.updateWires();
        });
      } catch (err) {
        this.callbacks.toast((err as Error).message);
      }
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    move(e);
  }

  private outPos(n: NodeInst): { x: number; y: number } {
    const el = this.nodeEls.get(n.id);
    const h = el?.offsetHeight ?? 44;
    return { x: n.pos.x + 132, y: n.pos.y + h / 2 };
  }

  private inPos(n: NodeInst, idx: number): { x: number; y: number } {
    return { x: n.pos.x, y: n.pos.y + 20 + idx * 16 };
  }

  private wirePath(src: NodeInst, dst: NodeInst, idx: number): string {
    const a = this.outPos(src);
    const b = this.inPos(dst, idx);
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return {
      x: (clientX - r.left - this.tf.x) / this.tf.k,
      y: (clientY - r.top - this.tf.y) / this.tf.k,
    };
  }

  private applyTransform(): void {
    this.world.style.transform = `translate(${this.tf.x}px, ${this.tf.y}px) scale(${this.tf.k})`;
  }

  /** Zoom by factor `f` centered on screen point (cx,cy client coords) */
  private zoomAt(cx: number, cy: number, factor: number): void {
    const r = this.el.getBoundingClientRect();
    const lx = cx - r.left, ly = cy - r.top;
    const k = Math.min(4, Math.max(0.08, this.tf.k * factor));
    this.tf.x = lx - ((lx - this.tf.x) / this.tf.k) * k;
    this.tf.y = ly - ((ly - this.tf.y) / this.tf.k) * k;
    this.tf.k = k;
    this.applyTransform();
  }

  /** Zoom in/out by a step (call from buttons) */
  zoomStep(dir: number): void {
    this.zoomAt(this.el.clientWidth / 2, this.el.clientHeight / 2, dir > 0 ? 1.3 : 1 / 1.3);
  }

  /** Reset view to center */
  resetView(): void {
    this.tf.x = 60;
    this.tf.y = 60;
    this.tf.k = 1;
    this.applyTransform();
  }

  /** Frame all nodes to fit the viewport with tight padding */
  frameAll(): void {
    const kids = this.engine.graph.childrenOf(this.current);
    if (!kids.length) return;
    const r = this.el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const pad = 60;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of kids) {
      const el = this.nodeEls.get(n.id);
      const w = el?.offsetWidth ?? 124;
      const h = el?.offsetHeight ?? 44;
      if (n.pos.x < minX) minX = n.pos.x;
      if (n.pos.y < minY) minY = n.pos.y;
      if (n.pos.x + w > maxX) maxX = n.pos.x + w;
      if (n.pos.y + h > maxY) maxY = n.pos.y + h;
    }
    if (minX === Infinity) return;
    const nw = maxX - minX + pad * 2;
    const nh = maxY - minY + pad * 2;
    const k = Math.min(r.width / nw, r.height / nh);
    this.tf.k = Math.min(4, Math.max(0.08, k));
    this.tf.x = (r.width - (minX + maxX) * this.tf.k) / 2;
    this.tf.y = (r.height - (minY + maxY) * this.tf.k) / 2;
    this.applyTransform();
  }

  /** Overview: frame all with generous padding for context */
  overview(): void {
    const kids = this.engine.graph.childrenOf(this.current);
    if (!kids.length) return;
    const r = this.el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const pad = 150;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of kids) {
      const el = this.nodeEls.get(n.id);
      const w = el?.offsetWidth ?? 124;
      const h = el?.offsetHeight ?? 44;
      if (n.pos.x < minX) minX = n.pos.x;
      if (n.pos.y < minY) minY = n.pos.y;
      if (n.pos.x + w > maxX) maxX = n.pos.x + w;
      if (n.pos.y + h > maxY) maxY = n.pos.y + h;
    }
    if (minX === Infinity) return;
    const nw = maxX - minX + pad * 2;
    const nh = maxY - minY + pad * 2;
    const k = Math.min(r.width / nw, r.height / nh);
    this.tf.k = Math.min(4, Math.max(0.08, k));
    this.tf.x = (r.width - (minX + maxX) * this.tf.k) / 2;
    this.tf.y = (r.height - (minY + maxY) * this.tf.k) / 2;
    this.applyTransform();
  }

  // ------------------------------------------------------------ undo / redo

  /** Snapshot current child state and push onto undo stack (clears redo). */
  snapshot(): void {
    if (this.restoring) return;
    const kids = this.engine.graph.childrenOf(this.current);
    const nodes: NodeSnapshot[] = kids.map((n) => ({
      type: n.type,
      name: n.name,
      pos: { ...n.pos },
      flags: { display: n.flags.display },
      inputs: n.inputs.map((src) => (src && src.parent === this.current ? src.name : null)),
    }));
    this.undoStack.push({ nodes });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Restore the most recent snapshot. */
  undo(): void {
    if (!this.undoStack.length) return;
    const snap = this.undoStack.pop()!;
    // Snapshot current state onto redo stack before restoring
    const kids = this.engine.graph.childrenOf(this.current);
    const redoNodes: NodeSnapshot[] = kids.map((n) => ({
      type: n.type,
      name: n.name,
      pos: { ...n.pos },
      flags: { display: n.flags.display },
      inputs: n.inputs.map((src) => (src && src.parent === this.current ? src.name : null)),
    }));
    this.redoStack.push({ nodes: redoNodes });
    this.restoreSnapshot(snap);
    this.callbacks.onStructureChange();
    this.callbacks.toast('undo');
  }

  /** Restore the most recent redo snapshot. */
  redo(): void {
    if (!this.redoStack.length) return;
    const snap = this.redoStack.pop()!;
    // Snapshot current state onto undo stack
    const kids = this.engine.graph.childrenOf(this.current);
    const undNodes: NodeSnapshot[] = kids.map((n) => ({
      type: n.type,
      name: n.name,
      pos: { ...n.pos },
      flags: { display: n.flags.display },
      inputs: n.inputs.map((src) => (src && src.parent === this.current ? src.name : null)),
    }));
    this.undoStack.push({ nodes: undNodes });
    this.restoreSnapshot(snap);
    this.callbacks.onStructureChange();
    this.callbacks.toast('redo');
  }

  private restoreSnapshot(snap: GraphSnapshot): void {
    this.restoring = true;
    const g = this.engine.graph;
    // Delete all current children
    for (const n of g.childrenOf(this.current)) {
      this.engine.gpu?.releaseNode(n);
      g.delete(n);
    }
    // Recreate nodes from snapshot
    const nameToNode = new Map<string, NodeInst>();
    for (const ns of snap.nodes) {
      const node = g.create(ns.type, this.current, ns.name);
      node.pos = { ...ns.pos };
      node.flags.display = ns.flags.display;
      nameToNode.set(ns.name, node);
    }
    // Restore wiring
    for (const ns of snap.nodes) {
      const dst = nameToNode.get(ns.name);
      if (!dst) continue;
      for (let i = 0; i < ns.inputs.length; i++) {
        const srcName = ns.inputs[i];
        if (srcName) {
          const src = nameToNode.get(srcName);
          if (src) {
            try { g.connect(src, dst, i); } catch { /* skip bad wires */ }
          }
        }
      }
    }
    this.select(null);
    this.rebuild();
    this.restoring = false;
  }

  /** Wrap a mutation so the current state is snapped before the change. */
  undoable(fn: () => void): void {
    this.snapshot();
    fn();
  }

  /** Context menu for a wire: insert series, parallel, or delete */
  private showWireMenu(x: number, y: number, path: SVGPathElement): void {
    // Close any existing menu
    document.querySelector('.wt-wiremenu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'wt-wiremenu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.dataset.dismiss = '1';
    const items = [
      { label: '➕ Insert node (series)', action: () => {
        const family = path.dataset.family || 'TOP';
        const r = this.el.getBoundingClientRect();
        this._pendingWireInsert = {
          srcNode: this.engine.graph.childrenOf(this.current).find(c => String(c.id) === path.dataset.srcId)!,
          dstNode: this.engine.graph.childrenOf(this.current).find(c => String(c.id) === path.dataset.dstId)!,
          dstIdx: Number(path.dataset.dstIdx),
        };
        this.palette.open(x - r.left, y - r.top, family);
      }},
      { label: '🔀 Add node (parallel)', action: () => {
        const dst = this.engine.graph.childrenOf(this.current).find(c => String(c.id) === path.dataset.dstId);
        if (!dst) return;
        const r = this.el.getBoundingClientRect();
        // For parallel: keep the original connection and add another input to the same dest
        this._pendingWireInsert = null; // not used for parallel
        this._pendingParallelInsert = { dstNode: dst, dstIdx: Number(path.dataset.dstIdx) };
        this.palette.open(x - r.left, y - r.top, path.dataset.family || 'TOP');
      }},
      { label: '🗑️ Delete wire', action: () => {
        const dst = this.engine.graph.childrenOf(this.current).find(c => String(c.id) === path.dataset.dstId);
        if (!dst) return;
        this.undoable(() => {
          this.engine.graph.disconnect(dst, Number(path.dataset.dstIdx));
          this.callbacks.onStructureChange();
          this.updateWires();
        });
      }},
    ];
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.textContent = item.label;
      btn.addEventListener('click', () => { menu.remove(); item.action(); });
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    // Dismiss on click outside
    const dismiss = (ev: MouseEvent | TouchEvent) => {
      if (!menu.contains(ev.target as Node)) { menu.remove(); cleanup(); }
    };
    const dismissKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { menu.remove(); cleanup(); } };
    const cleanup = () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('touchstart', dismiss);
      document.removeEventListener('keydown', dismissKey);
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('touchstart', dismiss);
    document.addEventListener('keydown', dismissKey);
  }

  /** Floating info popup on middle-click: shows type/family/id/inputs */
  private showNodeInfo(x: number, y: number, n: NodeInst, spec: import('@webtoe/core').OpSpec): void {
    document.querySelector('.wt-nodeinfo')?.remove();
    const popup = document.createElement('div');
    popup.className = 'wt-nodeinfo';
    popup.style.left = `${x + 12}px`;
    popup.style.top = `${y}px`;
    const inputs = n.inputs.map((src, i) => {
      const name = src ? src.name : '(none)';
      return `  [${i}] → ${name}`;
    }).join('\n');
    popup.textContent = [
      `Type: ${spec.label ?? n.type}`,
      `Family: ${spec.family}`,
      `ID: ${n.id}`,
      `Name: ${n.name}`,
      `Display: ${n.flags.display}`,
      `Inputs:\n${inputs}`,
    ].join('\n');
    document.body.appendChild(popup);
    // Auto-dismiss after 3s or on any click
    const dismiss = () => { popup.remove(); cleanup(); };
    const cleanup = () => {
      document.removeEventListener('pointerdown', dismiss);
    };
    setTimeout(dismiss, 3000);
    document.addEventListener('pointerdown', dismiss);
  }

  /** Floating action bar above a node (appears on long-press) */
  private showActionBar(x: number, y: number, n: NodeInst, spec: import('@webtoe/core').OpSpec): void {
    // Remove existing bar
    document.querySelector('.wt-actbar')?.remove();
    if (this._actTimer) { clearTimeout(this._actTimer); this._actTimer = null; }

    const bar = document.createElement('div');
    bar.className = 'wt-actbar';
    // Position above the node
    const nodeEl = this.nodeEls.get(n.id);
    let bx = x, by = y;
    if (nodeEl) {
      const r = nodeEl.getBoundingClientRect();
      bx = r.left + r.width / 2;
      by = r.top - 8;
    }
    bar.style.left = `${bx}px`;
    bar.style.top = `${by}px`;
    // Margin-top negative to account for transform translate offset
    bar.style.marginTop = '-8px';

    const buttons: { icon: string; title: string; action: () => void }[] = [
      { icon: '⚙', title: 'Parameters', action: () => {
        const ev = new CustomEvent('wt-open-params', { detail: n });
        this.el.dispatchEvent(ev);
      }},
      { icon: n.flags.display ? '🔆' : '🟡', title: 'Display flag', action: () => {
        this.toggleDisplay(n);
        nodeEl?.classList.toggle('wt-selected', false);
        this.select(n);
      }},
      { icon: n.flags.bypass ? '⏭' : 'B', title: n.flags.bypass ? 'Unbypass' : 'Bypass', action: () => {
        this.undoable(() => {
          n.flags.bypass = !n.flags.bypass;
          nodeEl?.classList.toggle('wt-bypassed', n.flags.bypass);
          this.callbacks.onStructureChange();
        });
        bar.querySelectorAll('button')[2].textContent = n.flags.bypass ? '⏭' : 'B';
      }},
      { icon: '👁', title: 'Toggle preview', action: () => {
        const thumb = nodeEl?.querySelector('.wt-thumb') as HTMLElement;
        const initLabel = nodeEl?.querySelector('.wt-thumb-init') as HTMLElement;
        if (thumb && initLabel) {
          const show = initLabel.style.display !== 'none';
          initLabel.style.display = show ? 'none' : '';
          thumb.style.background = show ? '' : '#0e0e12';
          bar.querySelectorAll('button')[3].textContent = show ? '👁' : '👁‍🗨';
        }
      }},
      { icon: '🗑', title: 'Delete', action: () => {
        this.undoable(() => {
          this.engine.gpu?.releaseNode(n);
          this.engine.graph.delete(n);
          this.select(null);
          this.rebuild();
          this.callbacks.onStructureChange();
        });
      }},
    ];
    // Remove 👁 if node has no thumb
    if (!nodeEl?.classList.contains('wt-has-thumb')) buttons.splice(3, 1);

    // Add 📁 Load file button for file-based operators (imagein, videoin, audiofilein, etc.)
    const hasFileParam = spec.params?.some((p: any) => p.key === 'file');
    if (hasFileParam) {
      buttons.splice(3, 0, { icon: '📁', title: 'Load file from device', action: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = spec.type.includes('image') ? 'image/*'
          : spec.type.includes('video') ? 'video/*'
          : spec.type.includes('audio') ? 'audio/*'
          : '*/*';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            // Set the node's 'file' param
            const fileParam = spec.params?.find((p: any) => p.key === 'file');
            if (fileParam) {
              n.params.set('file', { mode: 'const', value: dataUrl });
              // Force recook
              n.cookedFrame = -1;
              this.callbacks.onStructureChange();
              this.callbacks.toast(`loaded: ${file.name}`);
            }
          };
          reader.readAsDataURL(file);
        });
        input.click();
      }});
    }

    const btns: HTMLButtonElement[] = [];
    buttons.forEach((btnDef) => {
      const btn = document.createElement('button');
      btn.textContent = btnDef.icon;
      btn.title = btnDef.title;
      bar.appendChild(btn);
      btns.push(btn);
    });
    document.body.appendChild(bar);

    // Track pointer for sliding selection
    let activeIdx = -1;
    const updateHover = (cx: number, cy: number) => {
      let idx = -1;
      btns.forEach((b, i) => {
        const r = b.getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
          idx = i;
          b.classList.add('wt-act-hover');
        } else {
          b.classList.remove('wt-act-hover');
        }
      });
      activeIdx = idx;
    };
    const finish = () => {
      bar.remove();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onFinish);
      document.removeEventListener('keydown', onKey);
      // Execute selected action (or first action as default)
      if (activeIdx >= 0 && activeIdx < buttons.length) {
        buttons[activeIdx].action();
      }
      // Start 10s auto-dismiss for buttons (if bar was visible without selection)
      this._actTimer = setTimeout(() => {
        document.querySelector('.wt-actbar')?.remove();
      }, 10000);
    };
    const onMove = (ev: PointerEvent) => updateHover(ev.clientX, ev.clientY);
    const onFinish = () => finish();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { bar.remove(); cleanup(); } };
    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onFinish);
      document.removeEventListener('keydown', onKey);
    };
    // Delay adding global listeners so click on the bar doesn't immediately fire
    requestAnimationFrame(() => {
      addEventListener('pointermove', onMove);
      addEventListener('pointerup', onFinish);
      addEventListener('keydown', onKey);
    });
  }

  /** Pending parallel insert: when set, the next created node connects in parallel */
  private _pendingParallelInsert: { dstNode: NodeInst; dstIdx: number } | null = null;
  /** Pending input insert: when set, the next created node connects TO this input */
  private _pendingInputInsert: { dstNode: NodeInst; dstIdx: number } | null = null;
  /** Pending output insert: when set, the next created node is wired FROM this output */
  private _pendingOutputInsert: { srcNode: NodeInst } | null = null;
  /** Action bar auto-dismiss timer */
  private _actTimer: ReturnType<typeof setTimeout> | null = null;
  /** Long-press active flag for mobile box-select */
  private _longPressActive = false;
  private _longPressTimer: ReturnType<typeof setTimeout> | null = null;

  private createAt(type: string): void {
    const w = this.toWorld(this.lastPointer.x, this.lastPointer.y);
    const pending = this._pendingWireInsert;
    this._pendingWireInsert = null;
    const parallel = this._pendingParallelInsert;
    this._pendingParallelInsert = null;
    const inputInsert = this._pendingInputInsert;
    this._pendingInputInsert = null;
    const outputInsert = this._pendingOutputInsert;
    this._pendingOutputInsert = null;
    try {
      let created: NodeInst | undefined;
      this.undoable(() => {
        const n = this.engine.graph.create(type, this.current);
        // If inserting into a wire, place the new node mid-way between source and dest
        if (pending) {
          const midX = (pending.srcNode.pos.x + pending.dstNode.pos.x) / 2;
          const midY = (pending.srcNode.pos.y + pending.dstNode.pos.y) / 2;
          n.pos = { x: midX, y: midY };
          // Disconnect old wire and reconnect through new node
          this.engine.graph.disconnect(pending.dstNode, pending.dstIdx);
          this.engine.graph.connect(pending.srcNode, n, 0);
          this.engine.graph.connect(n, pending.dstNode, 0);
        } else if (parallel) {
          // Place parallel node slightly below the original connection point
          const dstNode = parallel.dstNode;
          n.pos = { x: dstNode.pos.x - 160, y: dstNode.pos.y + 80 };
          this.engine.graph.connect(n, dstNode, 0);
        } else if (inputInsert) {
          // New node placed to the left of the destination, wired into its input
          n.pos = { x: inputInsert.dstNode.pos.x - 200, y: inputInsert.dstNode.pos.y };
          this.engine.graph.connect(n, inputInsert.dstNode, inputInsert.dstIdx);
        } else if (outputInsert) {
          // New node placed to the right of the source, wired from its output
          n.pos = { x: outputInsert.srcNode.pos.x + 160, y: outputInsert.srcNode.pos.y };
          this.engine.graph.connect(outputInsert.srcNode, n, 0);
        } else {
          n.pos = { x: w.x, y: w.y };
        }
        created = n;
        this.rebuild();
        this.select(n);
        this.callbacks.onStructureChange();
      });
      if (created) this.callbacks.onNodeCreated?.(created);
    } catch (err) {
      this.callbacks.toast((err as Error).message);
    }
  }

  private bindEvents(): void {
    const el = this.el;

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    });

    el.addEventListener('pointerdown', (e) => {
      // Box-select: Shift+LMB, RMB, or long-press on empty area
      const isLongPress = this._longPressActive;
      this._longPressActive = false;
      if (e.shiftKey || e.button === 2 || isLongPress) {
        e.preventDefault();
        this.palette.close();
        el.focus();
        // Create selection rect
        const selEl = document.createElement('div');
        selEl.className = 'wt-selrect';
        selEl.style.left = `${e.clientX - el.getBoundingClientRect().left}px`;
        selEl.style.top = `${e.clientY - el.getBoundingClientRect().top}px`;
        selEl.style.width = '0px';
        selEl.style.height = '0px';
        el.appendChild(selEl);
        const startX = e.clientX;
        const startY = e.clientY;
        const move = (ev: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const x1 = Math.min(startX, ev.clientX) - r.left;
          const y1 = Math.min(startY, ev.clientY) - r.top;
          const x2 = Math.max(startX, ev.clientX) - r.left;
          const y2 = Math.max(startY, ev.clientY) - r.top;
          selEl.style.left = `${x1}px`;
          selEl.style.top = `${y1}px`;
          selEl.style.width = `${x2 - x1}px`;
          selEl.style.height = `${y2 - y1}px`;
        };
        const up = () => {
          removeEventListener('pointermove', move);
          removeEventListener('pointerup', up);
          const selRect = selEl.getBoundingClientRect();
          selEl.remove();
          // Find first node overlapping with selection rect
          for (const [id, nodeEl] of this.nodeEls) {
            const nr = nodeEl.getBoundingClientRect();
            if (nr.left < selRect.right && nr.right > selRect.left &&
                nr.top < selRect.bottom && nr.bottom > selRect.top) {
              const n = this.engine.graph.childrenOf(this.current).find(c => c.id === id);
              if (n) { this.select(n); break; }
            }
          }
        };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up);
        return;
      }

      if (e.target !== el && e.target !== this.world && e.target !== this.svg) return;
      this.palette.close();
      this.select(null);
      el.focus();
      const start = { x: e.clientX, y: e.clientY, tx: this.tf.x, ty: this.tf.y };
      const move = (ev: PointerEvent) => {
        this.tf.x = start.tx + (ev.clientX - start.x);
        this.tf.y = start.ty + (ev.clientY - start.y);
        this.applyTransform();
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        if (this._longPressTimer) { clearTimeout(this._longPressTimer); this._longPressTimer = null; }
        // Snap after pan
        this.snapshot();
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });

    // Prevent default context menu on network element (right-click → box-select)
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('dblclick', (e) => {
      // Check if double-clicking on a wire
      const t = e.target;
      const pathTarget = t instanceof Element ? t.closest('path') : null;
      if (pathTarget && pathTarget.dataset.family) {
        const srcId = Number(pathTarget.dataset.srcId);
        const dstId = Number(pathTarget.dataset.dstId);
        const dstIdx = Number(pathTarget.dataset.dstIdx);
        const family = pathTarget.dataset.family;
        const kids = this.engine.graph.childrenOf(this.current);
        const srcNode = kids.find(c => c.id === srcId);
        const dstNode = kids.find(c => c.id === dstId);
        if (srcNode && dstNode) {
          // Store pending wire insertion data, will be picked up by createAt override
          this._pendingWireInsert = { srcNode, dstNode, dstIdx };
          const r = el.getBoundingClientRect();
          this.palette.open(e.clientX - r.left, e.clientY - r.top, family);
          return;
        }
      }
      if (e.target !== el && e.target !== this.world && e.target !== this.svg) return;
      const r = el.getBoundingClientRect();
      this.palette.open(e.clientX - r.left, e.clientY - r.top);
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.clientX, e.clientY, Math.pow(1.0015, -e.deltaY));
    }, { passive: false });

    // Mobile: pinch-to-zoom
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.pinchDist = Math.hypot(dx, dy);
        this.pinchTf = { ...this.tf };
      } else if (e.touches.length === 3) {
        this.undo();
      } else if (e.touches.length === 4) {
        this.select(null);
      }
    });

    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (dist < 5) return;
        const r = el.getBoundingClientRect();
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
        const k = this.pinchTf.k * (dist / this.pinchDist);
        this.tf.k = Math.min(4, Math.max(0.08, k));
        this.tf.x = cx - ((cx - this.pinchTf.x) / this.pinchTf.k) * this.tf.k;
        this.tf.y = cy - ((cy - this.pinchTf.y) / this.pinchTf.k) * this.tf.k;
        this.applyTransform();
      }
    }, { passive: false });

    el.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.palette.open(this.lastPointer.x, this.lastPointer.y);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (this.selected) {
          this.undoable(() => {
            this.engine.gpu?.releaseNode(this.selected!);
            this.engine.graph.delete(this.selected!);
            this.select(null);
            this.rebuild();
            this.callbacks.onStructureChange();
          });
        }
      } else if (e.key === 'u') {
        this.goUp();
      } else if (e.key === 'f') {
        e.preventDefault();
        this.frameAll();
      } else if (e.key === 'o') {
        e.preventDefault();
        this.overview();
      } else if (e.key === 'd' && this.selected) {
        this.toggleDisplay(this.selected);
      } else if (e.key === 'p') {
        // Open parameters panel for selected node
        if (this.selected) {
          const ev = new CustomEvent('wt-open-params', { detail: this.selected });
          this.el.dispatchEvent(ev);
        }
      } else if (e.key === 'Escape') {
        this.palette.close();
      } else if (e.key === 'T' && e.shiftKey) {
        this.listMode = !this.listMode;
        this.el.classList.toggle('wt-list-mode', this.listMode);
        this.callbacks.toast(`List mode: ${this.listMode ? 'ON' : 'OFF'}`);
      } else if (e.key === 'G' && e.shiftKey) {
        this.gridSnap = !this.gridSnap;
        this.callbacks.toast(`Grid snap: ${this.gridSnap ? 'ON' : 'OFF'}`);
      }
    });

    // devicemotion — violent shake triggers undo
    window.addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt(
        (a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2,
      );
      if (mag > 20) {
        this.callbacks.toast('shake detected — undo');
        this.undo();
      }
    });
  }
}
