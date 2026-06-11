/** M2 boot: programmatic hello-noise — replaced by the full editor in M3. */
import { Engine, VERSION, type BackendName } from '@webtoe/core';
import { registerAllOps } from '@webtoe/ops';
import { createBackend } from '@webtoe/gpu';

registerAllOps();

const app = document.getElementById('app')!;
document.body.style.margin = '0';
app.innerHTML = `
  <div style="position:fixed;inset:0;background:#17171b;">
    <canvas id="gl" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
    <div id="hud" style="position:absolute;left:12px;top:10px;font:12px ui-monospace,monospace;color:#9a9aa3;"></div>
  </div>`;

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;

function fitCanvas(): void {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
}
addEventListener('resize', fitCanvas);

async function boot(): Promise<void> {
  fitCanvas();
  const prefer = (new URLSearchParams(location.search).get('backend') ?? 'webgl2') as BackendName;
  const gpu = await createBackend(canvas, prefer);

  const engine = new Engine();
  engine.gpu = gpu;
  const g = engine.graph;

  // webgpu backend: pilot-op graph (ramp/level have WGSL); webgl2: full noise
  const noise = g.create(gpu.name === 'webgpu' ? 'top:ramp' : 'top:noise');
  if (gpu.name === 'webgpu') {
    noise.params.get('type')!.value = 'circular';
    noise.params.set('phase', { mode: 'expr', value: 0, expr: 'time.seconds * 0.1' });
  }
  const level = g.create('top:level');
  const out = g.create('top:out');
  g.connect(noise, level, 0);
  g.connect(level, out, 0);

  const lfo = g.create('chop:lfo');
  lfo.params.get('frequency')!.value = 0.4;
  lfo.params.get('amplitude')!.value = 0.6;
  lfo.params.get('offset')!.value = 1.0;
  level.params.set('brightness', { mode: 'expr', value: 1, expr: "op('lfo1')['chan1']" });

  out.flags.display = true;
  engine.liveRoots.add(out);

  const loop = (): void => {
    engine.frame(performance.now() / 1000);
    const o = out.output;
    if (o && o.kind === 'top') gpu.blitToCanvas(o.tex);
    hud.textContent = `WebToe v${VERSION} · M2 hello-noise · ${gpu.name} · ${engine.time.fps.toFixed(0)} fps`
      + (noise.error || level.error ? ` · ERROR: ${noise.error ?? level.error}` : '');
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void boot();
