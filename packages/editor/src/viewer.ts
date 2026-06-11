import type { Engine, NodeInst } from '@webtoe/core';

/** Output viewer panel. TOP output is composited onto the shared overlay
 *  canvas by the app loop (this panel just reserves the rect); CHOP scope and
 *  DAT text render here directly. Also feeds engine.io.mouse. */
export class Viewer {
  private readonly scope: HTMLCanvasElement;
  private readonly datPre: HTMLPreElement;
  private readonly nameTag: HTMLDivElement;
  private history = new Map<string, number[]>();
  target: NodeInst | null = null;

  constructor(readonly el: HTMLElement, private readonly engine: Engine) {
    el.className = 'wt-viewer';
    this.scope = document.createElement('canvas');
    this.scope.className = 'wt-scope';
    this.datPre = document.createElement('pre');
    this.datPre.className = 'wt-dattext';
    this.nameTag = document.createElement('div');
    this.nameTag.className = 'wt-viewname';
    el.append(this.scope, this.datPre, this.nameTag);

    const updateMouse = (e: PointerEvent, down?: boolean) => {
      const r = el.getBoundingClientRect();
      this.engine.io.mouse.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      this.engine.io.mouse.y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
      if (down !== undefined) this.engine.io.mouse.down = down;
    };
    el.addEventListener('pointermove', (e) => updateMouse(e));
    el.addEventListener('pointerdown', (e) => updateMouse(e, true));
    el.addEventListener('pointerup', (e) => updateMouse(e, false));
    el.addEventListener('pointerleave', () => { this.engine.io.mouse.down = false; });
  }

  fit(): void {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(this.el.clientWidth * dpr));
    const h = Math.max(2, Math.round(this.el.clientHeight * dpr));
    if (this.scope.width !== w || this.scope.height !== h) {
      this.scope.width = w;
      this.scope.height = h;
    }
  }

  /** Non-GL portion of the viewer (scope/DAT/name tag). Returns true when the
   *  app should composite the target's TOP texture into this panel's rect. */
  draw(): boolean {
    const t = this.target;
    this.nameTag.textContent = t ? `${this.engine.graph.pathOf(t)}${t.error ? ' — ' + t.error : ''}` : '';
    const sctx = this.scope.getContext('2d')!;
    sctx.clearRect(0, 0, this.scope.width, this.scope.height);
    this.datPre.style.display = 'none';

    const out = t?.output;
    if (!t || !out) return false;
    if (out.kind === 'top') return true;

    if (out.kind === 'chop') {
      const w = this.scope.width, h = this.scope.height;
      sctx.fillStyle = '#101013';
      sctx.fillRect(0, 0, w, h);
      const colors = ['#4fb286', '#7c6cff', '#d2699e', '#e2b34a', '#5aa7d2', '#d25a5a'];
      const pad = 10 * (devicePixelRatio || 1);
      out.channels.forEach((ch, i) => {
        const key = `${t.id}:${ch.name}`;
        const hist = this.history.get(key) ?? [];
        hist.push(ch.data[ch.data.length - 1] ?? 0);
        if (hist.length > 240) hist.shift();
        this.history.set(key, hist);
        const min = Math.min(-1, ...hist), max = Math.max(1, ...hist);
        sctx.strokeStyle = colors[i % colors.length];
        sctx.lineWidth = 1.5 * (devicePixelRatio || 1);
        sctx.beginPath();
        hist.forEach((v, k) => {
          const x = pad + (k / 239) * (w - pad * 2);
          const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
          if (k === 0) sctx.moveTo(x, y);
          else sctx.lineTo(x, y);
        });
        sctx.stroke();
        sctx.fillStyle = colors[i % colors.length];
        sctx.font = `${11 * (devicePixelRatio || 1)}px ui-monospace, monospace`;
        const v = ch.data[ch.data.length - 1] ?? 0;
        sctx.fillText(`${ch.name} ${v.toFixed(3)}`, pad, pad + 14 * (devicePixelRatio || 1) * (i + 0.5));
      });
      return false;
    }

    if (out.kind === 'dat') {
      this.datPre.style.display = 'block';
      this.datPre.textContent = out.text.slice(0, 20000);
    }
    return false;
  }
}
