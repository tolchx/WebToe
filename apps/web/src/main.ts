import { registerAllOps } from '@webtoe/ops';
import { mountEditor } from '@webtoe/editor';

registerAllOps();

document.body.style.margin = '0';
const app = document.getElementById('app')!;
app.style.cssText = 'position:fixed;inset:0;';

const base = import.meta.env.BASE_URL;

const editorPromise = mountEditor(app, {
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
  ],
});

// debug/testing handle
void editorPromise.then((editor) => {
  (window as unknown as { __webtoe: unknown }).__webtoe = editor;
});
