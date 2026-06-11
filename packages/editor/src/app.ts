import { Engine, graphFromJSON, type Graph, type ImportReport, type NodeInst, VERSION } from '@webtoe/core';
import { createBackend } from '@webtoe/gpu';
import {
  importFilesFromFileList, loadProjectFile, loadProjectUrl, saveProjectFile, toedirLoader,
} from '@webtoe/io';
import { injectStyles } from './style';
import { NetworkView } from './network';
import { ParamPanel } from './params';
import { Viewer } from './viewer';

export interface EditorOptions {
  /** examples shown in the toolbar menu */
  examples?: { name: string; url: string }[];
  /** preferred GPU backend (default webgl2; `?backend=` query overrides) */
  backend?: 'webgl2' | 'webgpu';
  /** build a small default patch when starting empty (default true) */
  starterPatch?: boolean;
}

export class EditorApp {
  readonly engine = new Engine();
  private network!: NetworkView;
  private params!: ParamPanel;
  private viewer!: Viewer;
  private hud!: HTMLElement;
  private projName!: HTMLInputElement;
  private rafId = 0;
  private rootEl!: HTMLDivElement;
  private netEl!: HTMLDivElement;
  private compositor!: HTMLCanvasElement;

  constructor(private readonly host: HTMLElement, private readonly opts: EditorOptions = {}) {}

  async start(): Promise<void> {
    injectStyles();
    this.host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'wt-root';
    this.host.appendChild(root);
    this.rootEl = root;

    // ---- toolbar
    const bar = document.createElement('div');
    bar.className = 'wt-bar';
    const title = document.createElement('span');
    title.className = 'wt-title';
    title.textContent = 'WebToe';
    this.projName = document.createElement('input');
    this.projName.className = 'wt-projname';
    this.projName.value = 'untitled';
    this.projName.spellcheck = false;

    const newBtn = button('new', () => this.newProject());
    const saveBtn = button('save', () => saveProjectFile(this.engine.graph, this.projName.value));
    const loadLabel = fileButton('load', '.json,.webtoe.json', async (file) => {
      try {
        this.adoptGraph(await loadProjectFile(file), file.name.replace(/\.webtoe\.json$|\.json$/, ''));
      } catch (e) {
        this.toast(`load failed: ${(e as Error).message}`);
      }
    });

    const importLabel = fileButton('import .toe.dir', '', async (files) => {
      try {
        const imports = importFilesFromFileList(files);
        if (!toedirLoader.canLoad(imports)) {
          this.toast('that does not look like a toeexpand .toe.dir folder');
          return;
        }
        const { json, report } = await toedirLoader.load(imports);
        this.adoptGraph(graphFromJSON(json), files[0]?.webkitRelativePath?.split('/')[0] ?? 'imported');
        this.showReport(report);
      } catch (e) {
        this.toast(`import failed: ${(e as Error).message}`);
      }
    }, true);

    const examples = document.createElement('select');
    examples.innerHTML = '<option value="">examples…</option>'
      + (this.opts.examples ?? []).map((e) => `<option value="${e.url}">${e.name}</option>`).join('');
    examples.addEventListener('change', async () => {
      if (!examples.value) return;
      const name = examples.options[examples.selectedIndex].text;
      try {
        this.adoptGraph(await loadProjectUrl(examples.value), name);
      } catch (e) {
        this.toast(`example failed: ${(e as Error).message}`);
      }
      examples.value = '';
    });

    const spacer = document.createElement('div');
    spacer.className = 'wt-spacer';
    this.hud = document.createElement('span');
    this.hud.className = 'wt-hud';
    bar.append(title, this.projName, newBtn, saveBtn, loadLabel, importLabel, examples, spacer, this.hud);

    // ---- panels
    const net = document.createElement('div');
    this.netEl = net;
    const side = document.createElement('div');
    side.className = 'wt-side';
    const viewerEl = document.createElement('div');
    const paramsEl = document.createElement('div');
    side.append(viewerEl, paramsEl);
    root.append(bar, net, side);

    // ---- GPU compositor overlay: one canvas paints the viewer and every
    // visible node preview at full frame rate (no CPU readbacks)
    this.compositor = document.createElement('canvas');
    this.compositor.className = 'wt-compositor';
    root.appendChild(this.compositor);

    this.viewer = new Viewer(viewerEl, this.engine);
    this.params = new ParamPanel(paramsEl, this.engine, () => { /* params are read live */ });
    this.network = new NetworkView(net, this.engine, {
      onSelect: (n) => {
        this.params.show(n);
        this.refreshViewerTarget();
      },
      onStructureChange: () => this.refreshViewerTarget(),
      onEnterNetwork: () => this.refreshViewerTarget(),
      toast: (m) => this.toast(m),
    });

    // ---- gpu
    const queryBackend = new URLSearchParams(location.search).get('backend');
    const prefer = (queryBackend ?? this.opts.backend ?? 'webgl2') as 'webgl2' | 'webgpu';
    this.engine.gpu = await createBackend(this.compositor, prefer);

    if (this.opts.starterPatch !== false) this.buildStarter();
    this.network.rebuild();
    this.refreshViewerTarget();

    const fitCompositor = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(root.clientWidth * dpr));
      const h = Math.max(2, Math.round(root.clientHeight * dpr));
      if (this.compositor.width !== w || this.compositor.height !== h) {
        this.compositor.width = w;
        this.compositor.height = h;
      }
    };
    new ResizeObserver(() => { this.viewer.fit(); fitCompositor(); }).observe(root);
    new ResizeObserver(() => this.viewer.fit()).observe(viewerEl);
    this.viewer.fit();
    fitCompositor();
    this.loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.engine.gpu?.dispose();
  }

  // ------------------------------------------------------------ internals

  private buildStarter(): void {
    const g = this.engine.graph;
    const noise = g.create('top:noise');
    noise.pos = { x: 40, y: 40 };
    const level = g.create('top:level');
    level.pos = { x: 230, y: 40 };
    const out = g.create('top:out');
    out.pos = { x: 420, y: 40 };
    g.connect(noise, level, 0);
    g.connect(level, out, 0);
    const lfo = g.create('chop:lfo');
    lfo.pos = { x: 40, y: 200 };
    lfo.params.get('frequency')!.value = 0.4;
    lfo.params.get('amplitude')!.value = 0.5;
    lfo.params.get('offset')!.value = 0.9;
    level.params.set('brightness', { mode: 'expr', value: 1, expr: "op('lfo1')['chan1']" });
    out.flags.display = true;
  }

  private newProject(): void {
    this.adoptGraph(graphFromJSON({ app: 'webtoe', version: 1, root: { nodes: [], wires: [] } }), 'untitled');
  }

  private adoptGraph(graph: Graph, name: string): void {
    // swap engine graph wholesale: release GPU resources of old nodes
    for (const n of this.engine.graph.byId.values()) this.engine.gpu?.releaseNode(n);
    (this.engine as { graph: Graph }).graph = graph;
    this.engine.liveRoots.clear();
    this.projName.value = name || 'untitled';
    this.network.setNetwork(graph.root);
    this.refreshViewerTarget();
    this.toast(`loaded: ${name}`);
  }

  private refreshViewerTarget(): void {
    const inNet = this.engine.graph.childrenOf(this.network.current);
    const display = inNet.find((n) => n.flags.display);
    this.viewer.target = this.network.selected ?? display ?? null;

    // live roots: every display-flagged node in the whole graph + viewer target
    this.engine.liveRoots.clear();
    const walk = (c: NodeInst) => {
      for (const k of this.engine.graph.childrenOf(c)) {
        if (k.flags.display) this.engine.liveRoots.add(k);
        if (k.children) walk(k);
      }
    };
    walk(this.engine.graph.root);
    if (this.viewer.target) this.engine.liveRoots.add(this.viewer.target);
  }

  private showReport(r: ImportReport): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.55);z-index:70;display:grid;place-items:center;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#202027;border:1px solid #3a3a44;border-radius:10px;padding:18px 22px;max-width:520px;color:#d6d6dc;font-size:13px;line-height:1.6;';
    const pct = r.nodesTotal ? Math.round((r.nodesMapped / r.nodesTotal) * 100) : 0;
    box.innerHTML = `
      <div style="font-weight:700;color:#fff;margin-bottom:8px;">TouchDesigner import report</div>
      <div>${r.nodesTotal} nodes — <b style="color:#4fb286">${r.nodesMapped} runnable (${pct}%)</b>,
        ${r.nodesStubbed} kept as stubs (structure, wires and layout preserved)</div>
      <div>${r.exprTranslated} expressions translated · ${r.exprDisabled} kept inert (shown on the ƒ field)</div>
      ${r.notes.length ? `<div style="margin-top:8px;color:#9a9aa3;">${r.notes.map((n) => `· ${n}`).join('<br>')}</div>` : ''}
      <div style="margin-top:14px;text-align:right;"><button style="background:#2a2a31;color:#cfcfd6;border:1px solid #3a3a44;border-radius:5px;padding:5px 14px;cursor:pointer;">ok</button></div>`;
    box.querySelector('button')!.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.appendChild(box);
    this.host.querySelector('.wt-root')!.appendChild(overlay);
  }

  private toast(msg: string): void {
    const t = document.createElement('div');
    t.className = 'wt-toast';
    t.textContent = msg;
    this.host.querySelector('.wt-root')!.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  private loop = (): void => {
    this.engine.frame(performance.now() / 1000);
    const gpu = this.engine.gpu;
    gpu?.clearCanvas();

    const rootRect = this.rootEl.getBoundingClientRect();
    const rel = (r: DOMRect) => ({ x: r.x - rootRect.x, y: r.y - rootRect.y, w: r.width, h: r.height });

    // viewer
    const wantsTop = this.viewer.draw();
    const vt = this.viewer.target?.output;
    if (gpu && wantsTop && vt && vt.kind === 'top') {
      gpu.blitToCanvas(vt.tex, rel(this.viewer.el.getBoundingClientRect()));
    }

    // live node previews at full frame rate, clipped to the network panel
    if (gpu) {
      const netClip = rel(this.netEl.getBoundingClientRect());
      for (const { node, el } of this.network.thumbTargets()) {
        const out = this.engine.cook(node);
        if (!out || out.kind !== 'top') continue;
        const r = rel(el.getBoundingClientRect());
        if (r.x + r.w < netClip.x || r.x > netClip.x + netClip.w
          || r.y + r.h < netClip.y || r.y > netClip.y + netClip.h) continue;
        if (r.w < 4 || r.h < 4) continue;
        gpu.blitToCanvas(out.tex, { ...r, clip: netClip });
      }
    }

    const f = this.engine.time.frame;
    if (f % 15 === 0) {
      this.network.updateBadges();
      this.params.tick();
      this.hud.textContent = `v${VERSION} · ${gpu?.name ?? 'no gpu'} · ${this.engine.time.fps.toFixed(0)} fps`;
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function fileButton(label: string, accept: string, onFile: (f: File) => void): HTMLLabelElement;
function fileButton(label: string, accept: string, onFiles: (f: FileList) => void, directory: true): HTMLLabelElement;
function fileButton(
  label: string,
  accept: string,
  onPick: ((f: File) => void) | ((f: FileList) => void),
  directory = false,
): HTMLLabelElement {
  const l = document.createElement('label');
  l.className = 'wt-filebtn';
  l.textContent = label;
  const input = document.createElement('input');
  input.type = 'file';
  if (accept) input.accept = accept;
  if (directory) (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    if (input.files?.length) {
      if (directory) (onPick as (f: FileList) => void)(input.files);
      else (onPick as (f: File) => void)(input.files[0]);
    }
    input.value = '';
  });
  l.appendChild(input);
  return l;
}
