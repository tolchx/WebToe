import { Engine, graphFromJSON, type Graph, type NodeInst, VERSION } from '@webtoe/core';
import { createBackend } from '@webtoe/gpu';
import { loadProjectFile, loadProjectUrl, saveProjectFile } from '@webtoe/io';
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

  constructor(private readonly host: HTMLElement, private readonly opts: EditorOptions = {}) {}

  async start(): Promise<void> {
    injectStyles();
    this.host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'wt-root';
    this.host.appendChild(root);

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
    bar.append(title, this.projName, newBtn, saveBtn, loadLabel, examples, spacer, this.hud);

    // ---- panels
    const net = document.createElement('div');
    const side = document.createElement('div');
    side.className = 'wt-side';
    const viewerEl = document.createElement('div');
    const paramsEl = document.createElement('div');
    side.append(viewerEl, paramsEl);
    root.append(bar, net, side);

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
    this.engine.gpu = await createBackend(this.viewer.glCanvas, prefer);

    if (this.opts.starterPatch !== false) this.buildStarter();
    this.network.rebuild();
    this.refreshViewerTarget();

    new ResizeObserver(() => this.viewer.fit()).observe(viewerEl);
    this.viewer.fit();
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

  private toast(msg: string): void {
    const t = document.createElement('div');
    t.className = 'wt-toast';
    t.textContent = msg;
    this.host.querySelector('.wt-root')!.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  private loop = (): void => {
    this.engine.frame(performance.now() / 1000);
    this.viewer.draw();
    const f = this.engine.time.frame;
    if (f % 10 === 0) this.network.updateThumbs();
    if (f % 15 === 0) {
      this.network.updateBadges();
      this.params.tick();
      const gpu = this.engine.gpu;
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

function fileButton(label: string, accept: string, onFile: (f: File) => void): HTMLLabelElement {
  const l = document.createElement('label');
  l.className = 'wt-filebtn';
  l.textContent = label;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    if (input.files?.[0]) onFile(input.files[0]);
    input.value = '';
  });
  l.appendChild(input);
  return l;
}
