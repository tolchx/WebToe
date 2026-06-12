import { getOp, type Engine, type NodeInst } from '@webtoe/core';
import { FAMILY_COLORS } from './style';
import { Palette } from './palette';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface ViewTransform { x: number; y: number; k: number }

/** Network editor: DOM node boxes over an SVG wire layer, pan/zoom world. */
export class NetworkView {
  current: NodeInst;
  selected: NodeInst | null = null;

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

  constructor(
    private readonly el: HTMLElement,
    private readonly engine: Engine,
    private readonly callbacks: {
      onSelect(node: NodeInst | null): void;
      onStructureChange(): void;
      onEnterNetwork(comp: NodeInst): void;
      toast(msg: string): void;
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
    hint.textContent = 'tab/double-click: add op · drag dot→dot: wire · double-click comp: enter · u: up · d: display · ⌫: delete';
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
    el.appendChild(fam);

    if (spec.family === 'TOP' || spec.family === 'SOP' || n.type === 'comp:geo') {
      el.classList.add('wt-has-thumb');
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'wt-thumb';
      el.appendChild(thumbWrap);
      this.thumbs.set(n.id, thumbWrap); // composited live by the app loop
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
          this.engine.graph.disconnect(n, i);
          this.callbacks.onStructureChange();
          this.updateWires();
          this.startWireDrag(src, e);
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

    // node interactions
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).classList.contains('wt-stub')) return;
      e.stopPropagation();
      this.select(n);
      this.el.focus();
      const start = { x: e.clientX, y: e.clientY, nx: n.pos.x, ny: n.pos.y };
      const move = (ev: PointerEvent) => {
        n.pos.x = start.nx + (ev.clientX - start.x) / this.tf.k;
        n.pos.y = start.ny + (ev.clientY - start.y) / this.tf.k;
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
    return el;
  }

  private toggleDisplay(n: NodeInst): void {
    const on = !n.flags.display;
    for (const sib of this.engine.graph.childrenOf(this.current)) sib.flags.display = false;
    n.flags.display = on;
    this.updateBadges();
    this.callbacks.onStructureChange();
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
      const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const stub = target?.closest?.('.wt-stub.wt-in') as HTMLElement | null;
      if (!src2 || !stub) return;
      const nodeEl = stub.closest('.wt-node') as HTMLElement;
      const dst = this.engine.graph.childrenOf(this.current).find((c) => String(c.id) === nodeEl.dataset.id);
      if (!dst) return;
      try {
        this.engine.graph.connect(src2, dst, Number(stub.dataset.idx));
        this.callbacks.onStructureChange();
        this.updateWires();
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

  private createAt(type: string): void {
    const w = this.toWorld(this.lastPointer.x, this.lastPointer.y);
    try {
      const n = this.engine.graph.create(type, this.current);
      n.pos = { x: w.x, y: w.y };
      this.rebuild();
      this.select(n);
      this.callbacks.onStructureChange();
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
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });

    el.addEventListener('dblclick', (e) => {
      if (e.target !== el && e.target !== this.world && e.target !== this.svg) return;
      const r = el.getBoundingClientRect();
      this.palette.open(e.clientX - r.left, e.clientY - r.top);
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.clientX, e.clientY, Math.pow(1.0015, -e.deltaY));
    }, { passive: false });

    // Mobile: pinch-to-zoom + prevent double-tap zoom
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.pinchDist = Math.hypot(dx, dy);
        this.pinchTf = { ...this.tf };
      }
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
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
      if (e.key === 'Tab') {
        e.preventDefault();
        this.palette.open(this.lastPointer.x, this.lastPointer.y);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (this.selected) {
          this.engine.gpu?.releaseNode(this.selected);
          this.engine.graph.delete(this.selected);
          this.select(null);
          this.rebuild();
          this.callbacks.onStructureChange();
        }
      } else if (e.key === 'u') {
        this.goUp();
      } else if (e.key === 'd' && this.selected) {
        this.toggleDisplay(this.selected);
      } else if (e.key === 'Escape') {
        this.palette.close();
      }
    });
  }
}
