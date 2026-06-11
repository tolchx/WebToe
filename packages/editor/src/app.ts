import { Engine, graphFromJSON, type Graph, type ImportReport, type NodeInst, VERSION } from '@webtoe/core';
import { createBackend } from '@webtoe/gpu';
import {
  importFilesFromFileList, loadProjectFile, loadProjectUrl, saveProjectFile, toedirLoader,
} from '@webtoe/io';
import { injectStyles } from './style';
import { NetworkView } from './network';
import { ParamPanel } from './params';
import { Viewer } from './viewer';
import { previewSpec } from './preview3d';
import { AiChatPanel } from './aiChat';

export interface EditorOptions {
  /** examples shown in the toolbar menu */
  examples?: { name: string; url: string }[];
  /** preferred GPU backend (default webgl2; `?backend=` query overrides) */
  backend?: 'webgl2' | 'webgpu';
  /** build a small default patch when starting empty (default true) */
  starterPatch?: boolean;
  /** repository link for the toolbar icon */
  repoUrl?: string;
  /** WebToe MCP Bridge URL for AI chat (e.g. http://localhost:3001) */
  bridgeUrl?: string;
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
  private importLabel!: HTMLLabelElement;

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
    const loadLabel = fileButton('load', '.json,.webtoe.json,.toe,.tox', async (file) => {
      if (/\.(toe|tox)$/i.test(file.name)) {
        this.showToeGuide(file.name);
        return;
      }
      try {
        this.adoptGraph(await loadProjectFile(file), file.name.replace(/\.webtoe\.json$|\.json$/, ''));
      } catch (e) {
        this.toast(`load failed: ${(e as Error).message}`);
      }
    });

    const importLabel = fileButton('import .toe.dir', '', async (files) => {
      try {
        const imports = importFilesFromFileList(files);
        await this.importExpansion(imports, files[0]?.webkitRelativePath?.split('/')[0] ?? 'imported');
      } catch (e) {
        this.toast(`import failed: ${(e as Error).message}`);
      }
    }, true);
    this.importLabel = importLabel;

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
    const repo = document.createElement('a');
    repo.className = 'wt-repo';
    repo.href = this.opts.repoUrl ?? 'https://github.com/frank890417/WebToe';
    repo.target = '_blank';
    repo.rel = 'noopener';
    repo.title = 'WebToe on GitHub';
    repo.innerHTML = '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.55 7.55 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';
    bar.append(title, this.projName, newBtn, saveBtn, loadLabel, importLabel, examples, spacer, this.hud, repo);

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
    this.bindDropIntake(root);
    // AI Chat Panel (Ctrl+Shift+A) — conecta al WebToe MCP Bridge
    if (this.opts.bridgeUrl) {
      new AiChatPanel(this, { bridgeUrl: this.opts.bridgeUrl });
    }
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

  private async importExpansion(files: { path: string; text(): Promise<string> }[], name: string): Promise<void> {
    if (!toedirLoader.canLoad(files)) {
      this.toast('that does not look like a toeexpand .toe.dir folder');
      return;
    }
    const { json, report } = await toedirLoader.load(files);
    this.adoptGraph(graphFromJSON(json), name);
    this.showReport(report);
  }

  /** Drop targets: .webtoe.json loads, a .toe.dir folder imports, a raw .toe
   *  opens the conversion guide (its binary container is proprietary). */
  private bindDropIntake(root: HTMLElement): void {
    root.addEventListener('dragover', (e) => e.preventDefault());
    root.addEventListener('drop', async (e) => {
      e.preventDefault();
      const items = [...(e.dataTransfer?.items ?? [])];
      const entries = items
        .map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.())
        .filter((x): x is FileSystemEntry => !!x);
      const dir = entries.find((en) => en.isDirectory);
      try {
        if (dir) {
          const files = await readEntryTree(dir as FileSystemDirectoryEntry);
          await this.importExpansion(files, dir.name.replace(/\.toe\.dir$/, ''));
          return;
        }
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        if (/\.(toe|tox)$/i.test(file.name)) this.showToeGuide(file.name);
        else if (/\.json$/i.test(file.name)) {
          this.adoptGraph(await loadProjectFile(file), file.name.replace(/\.webtoe\.json$|\.json$/, ''));
        } else this.toast(`unsupported drop: ${file.name}`);
      } catch (err) {
        this.toast(`drop failed: ${(err as Error).message}`);
      }
    });
  }

  /** Honest raw-.toe story: the binary is a proprietary compressed container
   *  (verified — see docs/RESEARCH.md), so the one-time expansion runs with the
   *  user's own TouchDesigner install; the expanded folder drops right in. */
  private showToeGuide(fileName: string): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.55);z-index:70;display:grid;place-items:center;';
    const macCmd = `"/Applications/TouchDesigner.app/Contents/MacOS/toeexpand" "${fileName}"`;
    const winCmd = `"C:\\Program Files\\Derivative\\TouchDesigner\\bin\\toeexpand.exe" "${fileName}"`;
    const box = document.createElement('div');
    box.style.cssText = 'background:#202027;border:1px solid #3a3a44;border-radius:10px;padding:18px 22px;max-width:600px;color:#d6d6dc;font-size:13px;line-height:1.65;';
    box.innerHTML = `
      <div style="font-weight:700;color:#fff;margin-bottom:8px;">read ${escapeHtml(fileName)}</div>
      <div><code>.toe</code> is a proprietary compressed binary, so browsers can't open it directly.
      Your own TouchDesigner install converts it to text in one step — then drop the resulting
      <b>${escapeHtml(fileName)}.dir</b> folder anywhere on this page (or pick it below).</div>
      <div style="margin:10px 0 4px;color:#9a9aa3;">macOS</div>
      <pre data-cmd style="background:#101013;padding:8px 10px;border-radius:6px;overflow:auto;cursor:pointer;" title="click to copy">${escapeHtml(macCmd)}</pre>
      <div style="margin:6px 0 4px;color:#9a9aa3;">Windows</div>
      <pre data-cmd style="background:#101013;padding:8px 10px;border-radius:6px;overflow:auto;cursor:pointer;" title="click to copy">${escapeHtml(winCmd)}</pre>
      <div style="color:#9a9aa3;">or, with this repo checked out: <code>node packages/cli/toe-convert.mjs ${escapeHtml(fileName)}</code></div>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">
        <button data-pick style="background:#7c6cff22;color:#cfc8ff;border:1px solid #7c6cff;border-radius:5px;padding:5px 14px;cursor:pointer;">pick the expanded folder…</button>
        <button data-close style="background:#2a2a31;color:#cfcfd6;border:1px solid #3a3a44;border-radius:5px;padding:5px 14px;cursor:pointer;">close</button>
      </div>`;
    box.querySelectorAll('pre[data-cmd]').forEach((pre) => {
      pre.addEventListener('click', () => {
        void navigator.clipboard?.writeText(pre.textContent ?? '');
        this.toast('command copied');
      });
    });
    box.querySelector('[data-close]')!.addEventListener('click', () => overlay.remove());
    box.querySelector('[data-pick]')!.addEventListener('click', () => {
      overlay.remove();
      this.importLabel.querySelector('input')?.click();
    });
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.appendChild(box);
    this.host.querySelector('.wt-root')!.appendChild(overlay);
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

  /** Texture for any previewable output: TOPs directly, SOP/geo through the
   *  auto-orbit preview scene (rendered once per node per frame). */
  private texFor(node: NodeInst, out: import('@webtoe/core').OpOutput): import('@webtoe/core').TextureHandle | null {
    const gpu = this.engine.gpu;
    if (!gpu || !out) return null;
    if (out.kind === 'top') return out.tex;
    const geo = out.kind === 'sop' ? out.geo : out.kind === 'obj' && out.obj.geo ? out.obj.geo : null;
    if (!geo || !geo.P.length) return null;
    try {
      return gpu.renderScene(node, previewSpec(geo, this.engine.time.seconds));
    } catch {
      return null; // backend without 3D support (webgpu v1)
    }
  }

  private loop = (): void => {
    this.engine.frame(performance.now() / 1000);
    const gpu = this.engine.gpu;
    gpu?.clearCanvas();

    const rootRect = this.rootEl.getBoundingClientRect();
    const rel = (r: DOMRect) => ({ x: r.x - rootRect.x, y: r.y - rootRect.y, w: r.width, h: r.height });

    // per-frame preview texture cache (a node may feed both viewer and thumb)
    const texCache = new Map<number, import('@webtoe/core').TextureHandle | null>();
    const cachedTexFor = (node: NodeInst, out: import('@webtoe/core').OpOutput) => {
      if (!texCache.has(node.id)) texCache.set(node.id, this.texFor(node, out));
      return texCache.get(node.id) ?? null;
    };

    // viewer
    this.viewer.draw();
    const vTarget = this.viewer.target;
    if (gpu && vTarget?.output && ['top', 'sop', 'obj'].includes(vTarget.output.kind)) {
      const tex = cachedTexFor(vTarget, vTarget.output);
      if (tex) gpu.blitToCanvas(tex, rel(this.viewer.el.getBoundingClientRect()));
    }

    // live node previews at full frame rate, clipped to the network panel
    if (gpu) {
      const netClip = rel(this.netEl.getBoundingClientRect());
      for (const { node, el } of this.network.thumbTargets()) {
        const out = this.engine.cook(node);
        const tex = out ? cachedTexFor(node, out) : null;
        if (!tex) continue;
        const r = rel(el.getBoundingClientRect());
        if (r.x + r.w < netClip.x || r.x > netClip.x + netClip.w
          || r.y + r.h < netClip.y || r.y > netClip.y + netClip.h) continue;
        if (r.w < 4 || r.h < 4) continue;
        gpu.blitToCanvas(tex, { ...r, clip: netClip });
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

/** Recursively read a dropped directory entry into importer files (paths
 *  relative to the dropped root). */
async function readEntryTree(root: FileSystemDirectoryEntry): Promise<{ path: string; text(): Promise<string> }[]> {
  const out: { path: string; text(): Promise<string> }[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ path: prefix + entry.name, text: () => file.text() });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns batches; loop until empty
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) {
          await walk(child, entry === root ? '' : `${prefix}${entry.name}/`);
        }
      }
    }
  };
  await walk(root, '');
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
