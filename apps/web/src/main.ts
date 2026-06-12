import { initVideoKernelsWasm, registerAllOps } from '@webtoe/ops';
import { mountEditor } from '@webtoe/editor';

// Suppress harmless Chrome extension "message port closed" warnings
window.addEventListener('unhandledrejection', (e) => {
  if ((e.reason?.message || '').includes('message port closed')) e.preventDefault();
});
// Also suppress runtime.lastError in console output
const _origError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('runtime.lastError')) return;
  return _origError.apply(console, args);
};

registerAllOps();

const base = import.meta.env.BASE_URL;
void initVideoKernelsWasm(`${base}wasm/video-kernels.wasm`).then((mode) => {
  console.log(`[webtoe] video kernels: ${mode}`);
});

document.body.style.margin = '0';
const app = document.getElementById('app')!;
app.style.cssText = 'position:fixed;inset:0;';


const editorPromise = mountEditor(app, {
  bridgeUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:3001' : '',
  examples: [
    { name: '01 hello noise', url: `${base}examples/01-hello-noise.webtoe.json` },
    { name: '02 feedback trails', url: `${base}examples/02-feedback-trails.webtoe.json` },
    { name: '03 lfo garden', url: `${base}examples/03-lfo-garden.webtoe.json` },
    { name: '04 webcam displace', url: `${base}examples/04-webcam-displace.webtoe.json` },
    { name: '05 chop playground', url: `${base}examples/05-chop-playground.webtoe.json` },
    { name: '06 sketch: voronoi (2022, imported)', url: `${base}examples/06-sketch-voronoi.webtoe.json` },
    { name: '07 sketch: fractals (2022, imported)', url: `${base}examples/07-sketch-fractals.webtoe.json` },
    { name: '08 sketch: chop study (2022, imported)', url: `${base}examples/08-sketch-chop-study.webtoe.json` },
    { name: '09 showcase (camera + everything)', url: `${base}examples/09-showcase.webtoe.json` },
    { name: '10 3d lines (SOPs + render)', url: `${base}examples/10-3d-lines.webtoe.json` },
    { name: '11 particle showcase (AI)', url: `${base}examples/11-particle-showcase.webtoe.json` },
    { name: '12 GLSL deformation (AI)', url: `${base}examples/12-glsl-deformation.webtoe.json` },
    { name: '13 feedback + LFO (AI)', url: `${base}examples/13-feedback-lfo.webtoe.json` },
    { name: '14 boids flocking (AI)', url: `${base}examples/14-boids-flocking.webtoe.json` },
    { name: '15 3D instanced (AI)', url: `${base}examples/15-3d-instanced.webtoe.json` },
  ],
});

// debug/testing handle
void editorPromise.then((editor) => {
  (window as unknown as { __webtoe: unknown }).__webtoe = editor;
});
