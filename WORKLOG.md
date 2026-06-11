# WebToe worklog

Append-only build log. Protocol: every work chunk gets an entry — timestamp, what was done, verification evidence, and an updated `## NEXT`. A resuming assistant reads PLAN.md fully, then continues from `## NEXT`.

---

## 2026-06-11 — research phase (pre-repo)

- Deep research + hands-on verification of the `.toe` pipeline completed (see docs/RESEARCH.md): binary container is proprietary; official `toeexpand` round-trips to text; full graph (nodes, wires, params, expressions, code) recoverable; PoC parser + browser viewer proved end-to-end on a 213-node production file.
- Verdict adopted for WebToe: original engine + `toeexpand`-based importer; no Derivative assets ever enter this repo.

## 2026-06-11 — M0 scaffold (plan rev 2)

- PLAN.md authored, then revised per user direction before any code: WebGPU as first-class second backend (backend-agnostic pass contract in `core/passes.ts`, WGSL pilot ops in v1, parity = M7, compute path reserved for v2 particles), WASM seams (`Kernels` interface, typed-array layouts, benchmark-gated adoption), and long-term modular monorepo (npm workspaces: core/ops/gpu/io/editor/cli + apps/web; downward-only dependency rule; plugin op API; versioned format with migrations; embeddable editor).
- Workspace scaffold + CI (typecheck + tests + build + Pages deploy), zero runtime deps.
- Repo created at github.com/frank890417/WebToe and pushed.

## 2026-06-11 — M1 core + CHOP family

- `packages/core`: types, NodeInst, Graph (TD-style unique naming `noise1/noise2`, hierarchy, path resolution incl. `../` and absolute), Engine (pull cook, per-frame memo, cycle guard, bypass), expression system (`new Function` against fixed scope: time/me/op()/math whitelist + TD-Python translation with dry-run validation), backend-agnostic pass contract (`passes.ts`, GpuFacade), versioned serialize with migrations + family-aware stub fallback for unknown types.
- `packages/ops`: CHOP family (constant, lfo w/ integrated phase, noise fBm, math, lag, merge, select w/ wildcards, mousein) on the wasm-ready `Kernels` seam; comp:container, dat:text, per-family stubs. Registry keys namespaced `family:name`.
- Evidence: `npm run check` green — 23/23 tests (graph structure/wiring/paths, expr eval + TD translation accept/refuse cases, engine cooking incl. expr-driven params, cycle guard, lag convergence, serialize round-trip + stub fallback + version guard).
- Fix found by tests: cycle-guard error was wiped by post-input `error=null` reset — moved reset to cook start.

## 2026-06-11 — M2 GPU backends + TOP family

- `packages/gpu`: WebGL2 backend complete (program/uniform caches, per-(node,slot) ping-pong texture pools, previousFrame for feedback, media upload, letterboxed blit, readPixels thumbnails, release/dispose). WebGPU backend working skeleton: explicit shared bind-group layout (uniform UBO at 0 globals/1 ops with 256-aligned offsets, sampler+4 textures), pilot pipelines, media upload, blit; readPixels deferred to M7 (async readback), blit aspect-fit deferred to M7.
- `packages/ops` TOP family (17 ops, original GLSL): constant, noise (3D value-noise fBm), ramp, rectangle (sdf), transform (inverse-map + extend modes), level, monochrome, hsvadjust, blur (separable multi-pass via slots), composite (4-input, 6 blend ops), displace, edge (sobel), feedback (lazyInputs + previousFrame), null/out, imagein/videoin/camerain (media upload, placeholder + error states). WGSL pilots: constant, ramp, level.
- Core contract additions: `lazyInputs` (feedback cycle-break), runPass `slot` param, `setTime` on facade.
- Evidence: 26/26 tests incl. backend-contract checks (shader sources per declared backend, WGSL packing-rule lint, full WebGL2 coverage). Visual: hello-noise renders animated at 60 fps on webgl2 with lfo→level.brightness expression visibly modulating; `?backend=webgpu` renders animated circular ramp via pilot WGSL at 60 fps. Zero console errors on both.

## 2026-06-11 — M3 editor + M4 examples

- M3 `packages/editor` (embeddable, framework-free): NetworkView (DOM nodes over SVG wires; pan/zoom; node drag; wire drag incl. input-disconnect-redrag; palette via Tab/double-click with search + keyboard nav; COMP enter/exit + breadcrumb; display flag; delete; error badges), ParamPanel (float/int slider+number, toggle, menu, string, color+swatch, xy; per-param ƒ expression toggle, disabled-expr display for imports), Viewer (TOP blit follows selection, CHOP scope with per-channel sparklines + values, DAT text, feeds engine.io.mouse), thumbnails via readPixels at ~6 Hz with row-flip. `packages/io` save/load (.webtoe.json download/picker + URL fetch for examples). apps/web boots the editor with a starter patch; `window.__webtoe` debug handle.
- M4: five examples authored and browser-verified: 01 hello-noise (load pipeline + expr binding), 02 feedback-trails (full feedback loop verified — mouse orbit leaves fading trails; required fix: feedback now seeds transparent black on first frame instead of null), 03 lfo-garden (3 chains, add composite, hue drift — renders rich), 04 webcam-displace (graceful placeholder path verified headless; live with camera), 05 chop-playground (scope shows raw vs lagged channels; lag drives ramp rotation).
- Interaction smoke (real pointer events in browser): select ✓ params ✓ palette-create ✓ wire-drag rewire ✓ (thumbnails visibly switch source) COMP enter/exit + breadcrumb + `u` ✓ CHOP scope ✓. Zero console errors. 26/26 tests green.

## NEXT

M5 — `packages/io` toedir importer (ProjectLoader adapter; parse expanded .toe.dir File[] → GraphJSON with op/param translation tables + TD-expression translation + per-family stubs + ImportReport dialog) and `packages/cli` toe-convert.mjs. Editor: "import .toe.dir" toolbar button (webkitdirectory) + raw-.toe drop explainer. Verify against a self-made TD project (not committed). Then M6 polish: README, ARCHITECTURE.md, Pages live.
