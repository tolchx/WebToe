# WebToe

**A web-native, node-based dataflow engine for real-time visuals — patch operators together in the browser, TouchDesigner-style, and import your existing TouchDesigner projects.**

[![ci](https://github.com/frank890417/WebToe/actions/workflows/ci.yml/badge.svg)](https://github.com/frank890417/WebToe/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![live demo](https://img.shields.io/badge/live-frank890417.github.io%2FWebToe-7c6cff)](https://frank890417.github.io/WebToe/)

**▶ Try it now: [frank890417.github.io/WebToe](https://frank890417.github.io/WebToe/)** — no install, runs entirely in your browser.

![WebToe editor running the lfo-garden example](docs/media/hero-lfo-garden.png)

WebToe is an original engine and editor built from scratch for the web. It is not a TouchDesigner clone or port — it implements the workflow (operator families, wired networks, expression-driven parameters, a live cook loop) natively on **WebGL2 and WebGPU**, with **zero runtime dependencies** (the whole app is ~90 KB of JS), and it reads the structure of real TouchDesigner projects through the text expansion produced by your own TD installation.

## Highlights

- **Patch live in the browser** — network editor with a create-operator dialog (`Tab` / double-click: family tabs, searchable grid), wire dragging, container hierarchy with in/out tunneling, **real-time previews on every node** (one GPU compositor paints the viewer and all visible thumbnails at full frame rate — no CPU readbacks), and a parameter panel with sliders, menus, and per-parameter **expressions** (`op('lfo1')['chan1']`, `parent().par.speed`, `time.seconds * 0.2`, …).
- **Real-time GPU engine** — pull-based cook loop; TOPs run as GPU passes, CHOPs drive parameters; feedback loops, separable blur, 6-mode compositing, displacement, edge detection, webcam/video/image input.
- **Two GPU backends at parity** — WebGL2 (default, universal) and WebGPU (`?backend=webgpu`), both speaking one backend-agnostic pass contract; WebGPU's compute path is reserved for the upcoming particle family.
- **TouchDesigner import** — supported operators run live, everything else becomes a faithful stub preserving names, wires, layout, parameters, and Python code, with an honest report. Verified on real production projects.
- **Own versioned format** — lossless `.webtoe.json` save/load with migration hooks.

| Feedback trails (mouse-driven) | CHOP scope & channels |
|---|---|
| ![Feedback trails example](docs/media/feedback-trails.png) | ![CHOP playground with live scope](docs/media/chop-scope.png) |

| Operator palette | WebGPU backend |
|---|---|
| ![Searchable operator palette](docs/media/palette.png) | ![Same project on the WebGPU backend](docs/media/webgpu.png) |

## Importing your TouchDesigner projects

![Import report dialog after importing a 213-node production project](docs/media/import-report.png)

Every TouchDesigner install ships `toeexpand`, the official CLI that converts a binary `.toe` into readable text. WebToe consumes that expansion — your project files never leave your machine, and WebToe bundles nothing of Derivative's.

**Drop files anywhere on the page**: a `.webtoe.json` loads, a `.toe.dir` folder imports, and a raw `.toe` opens a guide with the exact copy-paste `toeexpand` command for your file (the binary container is proprietary, so the one-time expansion runs with your own TD install) plus a folder picker for the result.

```bash
# option A — one-step CLI (finds toeexpand in your local TD install):
node packages/cli/toe-convert.mjs myproject.toe        # → myproject.webtoe.json

# option B — expand manually, then drop the .toe.dir folder onto the page:
"/Applications/TouchDesigner.app/Contents/MacOS/toeexpand" myproject.toe
```

What the importer recovers: node types and hierarchy, wires (including wires across COMP boundaries and in/out tunnels), parameter values, **live Python expressions** (translated to WebToe expressions where faithful — `absTime.seconds*0.2` → `time.seconds*0.2` — and kept inert otherwise), DAT text and Python source, and network layout. The parameter mode field is a bitfield decoded from production files (bit 0 = expression), so flagged expression modes import too.

### Tested, automatically

`.toe` reading is covered by a two-layer automated suite built on an **original committed fixture** — a real binary `.toe` plus its canonical `toeexpand` expansion, authored for this repo and round-tripped through the official tools ([provenance](tests/fixtures/README.md)):

1. a CI-safe layer asserts the full reconstructed graph — types, COMP-boundary and tunnel wires, parameter modes, translated expressions evaluated in the engine, honest stubs, report numbers;
2. an integration layer (auto-skipped where TD isn't installed) expands the committed binary with the real `toeexpand` and runs the CLI end-to-end.

## Operator set (v1)

| Family | Operators |
|---|---|
| TOP | constant, noise, ramp, rectangle, transform, level, monochrome, hsv adjust, blur, composite, displace, edge, feedback, null, in, out, image in, video in, camera in |
| CHOP | constant, lfo, noise, math, lag, merge, select, mouse in, in, out |
| COMP / DAT | container (double-click to enter; in/out tunneling across its boundary), text |

Plus per-family stub operators used by the importer. Expressions ship with `time`, `me`, `op()` channel access, and a math library (`sin`, `clamp`, `fract`, `lerp`, `rand(seed)`, …).

## Examples

Eight bundled projects load from the toolbar and run out of the box — five authored for WebToe: **hello noise** (expression-driven brightness), **feedback trails** (move your mouse over the viewer), **lfo garden** (additive ramp chains with hue drift), **webcam displace** (allow camera access; degrades gracefully without one), **chop playground** (select `merge1` to scope raw vs lagged channels) — and three **real 2022 TouchDesigner daily sketches imported through the `.toe` pipeline** (pseudo-voronoi, fractal feedback, and a mouse-interactive CHOP study; lightly adapted for the web, e.g. movie sources swapped for noise).

## Quick start (development)

```bash
npm install
npm run dev        # editor at http://localhost:8643/WebToe/
npm run check      # typecheck + 42-test suite
npm run build      # production build (apps/web/dist)
node tools/capture-screens.mjs   # regenerate README screenshots (needs dev server + Chrome)
```

## Architecture

npm workspaces with a strict downward dependency rule — `apps/web → editor → {ops, gpu, io} → core`, where `core` imports nothing:

| Package | Role |
|---|---|
| `@webtoe/core` | graph model, pull-based cook engine, expression system, backend-agnostic GPU pass contract, versioned serialization, public `registerOp` plugin API |
| `@webtoe/ops` | operator definitions; CHOP kernels behind a WASM-ready interface; TOP shaders authored per backend (GLSL **and** WGSL, hand-written) |
| `@webtoe/gpu` | WebGL2 backend + WebGPU backend (parity), texture pools, ping-pong feedback, async readback thumbnails |
| `@webtoe/io` | `.webtoe.json` + the `toeexpand`-output importer behind a `ProjectLoader` adapter (Derivative's announced official JSON format slots in beside it) |
| `@webtoe/editor` | embeddable, framework-free editor — `mountEditor(el, opts)` |
| `@webtoe/cli` | `toe-convert.mjs` |

Deep dives: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · execution contract & milestones: [PLAN.md](PLAN.md) · build log: [WORKLOG.md](WORKLOG.md) · research foundation (file-format findings, feasibility, sources): [docs/RESEARCH.md](docs/RESEARCH.md)

## Roadmap — measured against real work

To define "complete", we analyzed **60 real TouchDesigner projects (28,698 nodes, 2022–2026)** from a daily-practice generative art portfolio and ranked what actually blocks them: the 3D pipeline (geo/render/SOP/MAT — in ~46 of 60 projects), routing TOPs, `parent().par` expressions, GLSL TOPs, the POP particle family, and replicator/table data. The phased plan with all the numbers: **[docs/ROADMAP.md](docs/ROADMAP.md)**. Current corpus coverage is 32.3% of nodes runnable; each phase has a measured target.

## Disclaimer

WebToe is an independent open-source project, **not affiliated with or endorsed by Derivative Inc.** TouchDesigner is a trademark of Derivative Inc. WebToe contains no Derivative code, binaries, or assets; it reads the text expansion of project files that users generate locally with their own licensed TouchDesigner installation, for interoperability. All engine code, shaders, and UI design in this repository are original work.

## License

[MIT](LICENSE)
