# WebToe

**A web-native, node-based dataflow engine for real-time visuals — patch operators together in the browser, TouchDesigner-style, and import your existing TouchDesigner projects.**

**Live: [frank890417.github.io/WebToe](https://frank890417.github.io/WebToe/)**

WebToe is an original engine and editor, built from scratch for the web. It is not a TouchDesigner clone or port — it implements the workflow (operator families, wired networks, expression-driven parameters, a live cook loop) natively on WebGL2/WebGPU, and it can read the structure of real TouchDesigner projects through the text expansion produced by your own TD installation.

## What it does

- **Patch in the browser** — network editor with op palette (`Tab` / double-click), wire dragging, container hierarchy, live per-node preview thumbnails, parameter panel with sliders/menus/toggles and per-parameter **expressions** (`op('lfo1')['chan1']`, `time.seconds * 0.2`, …).
- **Real-time GPU engine** — pull-based cook loop at 60 fps; TOP (texture) operators run as GPU passes; CHOP (channel) operators drive parameters; feedback loops, separable blur, compositing, displacement, webcam/video/image input.
- **Import TouchDesigner projects** — expand a `.toe` with the official `toeexpand` tool from your own TD install (or use [`packages/cli/toe-convert.mjs`](packages/cli/toe-convert.mjs)), then drop the `.toe.dir` folder into WebToe. Supported operators run live; everything else becomes a faithful **stub** that preserves names, wires, layout, parameters and Python code, with an honest import report. Verified on a real 213-node production project.
- **Own format** — versioned `.webtoe.json` with lossless save/load and migration hooks.
- **Examples** — five bundled projects (feedback trails, LFO garden, webcam displace, …) load from the toolbar and run out of the box.

## Operator set (v1)

| Family | Operators |
|---|---|
| TOP | constant, noise, ramp, rectangle, transform, level, monochrome, hsv adjust, blur, composite, displace, edge, feedback, null, out, image in, video in, camera in |
| CHOP | constant, lfo, noise, math, lag, merge, select, mouse in |
| COMP / DAT | container (enter with double-click), text |

Plus per-family stub operators used by the importer.

## Quick start

```bash
npm install
npm run dev        # editor at http://localhost:8643/WebToe/
npm run check      # typecheck + test suite
```

Import one of your TouchDesigner projects:

```bash
# 1) expand with YOUR TD install (or let the CLI find toeexpand):
node packages/cli/toe-convert.mjs myproject.toe        # → myproject.webtoe.json
# 2) or expand manually and use the "import .toe.dir" toolbar button:
"/Applications/TouchDesigner.app/Contents/MacOS/toeexpand" myproject.toe
```

## Architecture

npm workspaces with a strict downward dependency rule — `apps/web → editor → {ops, gpu, io} → core`, where `core` imports nothing:

- `@webtoe/core` — graph model, pull-based cook engine, expression system, backend-agnostic GPU pass contract, versioned serialization, public `registerOp` plugin API
- `@webtoe/ops` — operator definitions; CHOP kernels behind a WASM-ready interface; TOP shaders authored per backend (GLSL + WGSL)
- `@webtoe/gpu` — WebGL2 backend (complete) and WebGPU backend (pilot ops; parity on the roadmap, compute reserved for a future particle family)
- `@webtoe/io` — `.webtoe.json` + the `toeexpand`-output importer behind a `ProjectLoader` adapter (Derivative's announced official JSON format will slot in beside it)
- `@webtoe/editor` — embeddable, framework-free editor (`mountEditor(el, opts)`)

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · plan & milestones: [PLAN.md](PLAN.md) · build log: [WORKLOG.md](WORKLOG.md) · research foundation (file-format findings, feasibility, sources): [docs/RESEARCH.md](docs/RESEARCH.md)

## Roadmap

WebGPU parity for the full TOP set (M7) · compute-based particle family in the spirit of POPs + audio-rate CHOPs with a benchmark-gated WASM path (M8) · cross-network wire resolution and In/Out tunneling · official-JSON importer when Derivative ships the new text format.

## Disclaimer

WebToe is an independent open-source project, **not affiliated with or endorsed by Derivative Inc.** TouchDesigner is a trademark of Derivative Inc. WebToe contains no Derivative code, binaries, or assets; it reads the text expansion of project files that users generate locally with their own licensed TouchDesigner installation, for interoperability. All engine code, shaders, and UI design in this repository are original work.

## License

[MIT](LICENSE)
