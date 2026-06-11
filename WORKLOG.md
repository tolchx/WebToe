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

## 2026-06-11 — M5 TouchDesigner importer + CLI

- `packages/io/toedir.ts`: ProjectLoader adapter parsing toeexpand output (.n node grammar incl. inputs blocks, .parm modes 0/16/17 with BOM tolerance, .text DAT payloads, nested networks). Conservative TYPE_MAP (~30 TD types) + per-op PARAM_MAP (incl. menu token translation, color component gathering, level/transform/lfo/math tables), TD-Python expressions translated or kept inert as tdExpr, per-family stubs for everything else, honest ImportReport (mapped/stubbed counts, stub-type histogram, skipped cross-network wires, unmapped parm count).
- Editor: "import .toe.dir" toolbar button (webkitdirectory) + import report dialog.
- `packages/cli/toe-convert.mjs`: locates the USER'S OWN toeexpand (mac bundle / win bin globs or --toeexpand), runs in tmpdir (tolerating toeexpand's nonzero-on-success exit), emits .webtoe.json structure. Never bundles Derivative binaries.
- Evidence: 30/30 tests (synthetic-fixture importer suite: mapping, stubs+foreignType, wires, hierarchy, color gather, expression translate/inert, menus, report). REAL-WORLD test (local only, not committed): a 213-node production .toe imported 213/213 nodes (56 runnable after adding TD's `TOP:comp` token discovered in the report histogram; 157 stubs — POP/SOP-heavy project), then loaded in the browser: noise TOPs live-animating, ramp running, switch stub passing video through, layout/wires preserved, viewer rendering the imported network. CLI verified end-to-end on the same .toe.

## 2026-06-11 — M6 ship

- README (features, quickstart, op table, architecture summary, roadmap, trademark disclaimer), docs/ARCHITECTURE.md (layers, load-bearing contracts, backend matrix, decisions log incl. lessons: toeexpand exits nonzero on success; TD type tokens ≠ UI names e.g. Composite TOP = `comp`).
- Production verified at **https://frank890417.github.io/WebToe/** — app serves (200), examples fetch, lfo-garden loads and renders end-to-end, all five thumbnails paint, viewer blits final output. Note for future debugging: headless/hidden tabs pause RAF — drive `__webtoe.loop()` manually when verifying via automation.
- Bundle: 90 KB JS / 27.6 KB gzip, zero runtime dependencies. 30/30 tests, CI green per milestone.

**v1 (M0–M6) COMPLETE.**

## 2026-06-11 — v1.1: automated .toe tests, tunneling, M7 WebGPU parity

- **Automated ".toe reading works" suite** (the goal's core ask): original fixture network authored as expanded text, round-tripped through the real `toecollapse`/`toeexpand` (2025.32460) and committed as both binary `.toe` and canonical expansion (provenance in tests/fixtures/README.md). Layer 1 (CI, always-on): importer → graph assertions covering types, COMP-boundary + tunnel wires, parm modes 0/16/17, expression translation (`math.sin(absTime.seconds)*0.5+1` → engine-evaluated), stub honesty (`TOP:mirror` → `top:stub`), report numbers. Layer 2 (auto-skips without TD): real `toeexpand` on the committed binary → identical import to the committed expansion; `toe-convert` CLI end-to-end. Both layers ran locally (binary layer ~300 ms/test).
- **COMP in/out tunneling**: top:in/chop:in (index param, TD name-digit import), chop:out, container-output-via-out-child, COMP-boundary wiring + capacity from in-children, editor stubs. Real-project effect: CLI import improved 56 → 71 runnable nodes (TOP:in×7, TOP:comp×6, CHOP in/out now live).
- **M7 WebGPU parity**: WGSL for all shader-driven TOPs (noise/rectangle/transform/monochrome/hsv/blur/composite/displace/edge + placeholder/feedback-seed), letterboxed blit via setViewport, async copyTextureToBuffer thumbnail cache. Browser-verified on `?backend=webgpu`: lfo garden renders, thumbnails paint, feedback trails accumulate (lit-pixel check 69.6% vs ~1% single-rect), zero node errors; WebGL2 regression-checked clean.
- 42 tests green; @types/node added for the node-API test layers.

## 2026-06-11 — v1.2: portfolio-driven roadmap, README/repo completion

- **Corpus analysis** (private tooling in the lab repo): 199 unique production .toe projects found (2022–2026 daily practice), 60 expanded and aggregated — 28,698 nodes. Findings: 32.3% node coverage today; 3D pipeline (geo 48/60, render 46/60, SOP/MAT) is the dominant blocker; then routing TOPs (switch/math/reorder/select), `parent().par` expression family, TOP:glsl (32/60), POPs (2025–26 era), replicator+table (60/60). Published as docs/ROADMAP.md (aggregate numbers only, nothing project-identifying) with phases R1–R7 and measured targets.
- **Importer upgrade from the data**: parameter mode is a bitfield — bit 0 = expression (decoded from samples: 17, 49, 273…), bit 4 = string-with-default-expr. Importer now catches flagged expression modes (~7k more live expressions in the corpus); regression test added (mode 49).
- **Engine**: fps delta floor 4 ms (250 fps ceiling) so abnormal frame drivers can't skew the estimate.
- **README completed**: real screenshots (docs/media/, 6 shots incl. webgpu + import report with real measured numbers) captured via committed tools/capture-screens.mjs (playwright-core + system Chrome, drives `__webtoe.loop()` because headless tabs pause RAF); badges, gallery, import guide, architecture/roadmap links. Repo metadata set: description, homepage, 9 topics. Pages already on workflow builds.

## 2026-06-11 — evolution cycle 1 (R1 + R2 + DAT-lite): 32.3% → 47.1% measured

- **Expression engine v2**: live `.par` access on node proxies (`parent(n)`, `op('x').par.y`, `me.par.x`) with a parameter-evaluation cycle guard; Python ternary → conditional, `and/or/not`, `int()→trunc()`, `mod.math.*`, `None`; f-strings/`.menuIndex`/`panel.*` stay inert. Corpus says `.par` patterns are 38% of all 38.5k live expressions — this was the multiplier.
- **R1 ops**: top:switch/select/math/reorder/flip (GLSL+WGSL, parity tests enforce), chop:switch/speed/par, DAT-lite (table w/ .table sidecar, select/null/in/out), COMP:null→container. Container out-children now include dat:out.
- **Importer**: ~20 new TYPE_MAP entries + param maps; .table sidecar text attach (NUL-guarded).
- **Measured (the self-evolution metric)**: corpus 32.3% → **47.1%** of 28,698 nodes runnable; reference production project 56 → 71 → **88** runnable. Live browser verification: switch/flip/math chain renders; `op('lfo1').par.frequency*10` evaluates 4.0; zero errors. 48/48 tests.
- **Deep research landed** (104 agents, 23 claims verified 3-0): TD GLSL TOP injected contract fully documented → ROADMAP R4 shim table (headerless GLSL 4.60, sTD2DInputs arrays, vUV, uTD*Infos res packing, TDOutputSwizzle, pixel/compute modes). WebGPU-particle + minimal-renderer findings inform R3/R5 specs. JSON-format status: no newer-than-2025-10 statements found.
- Engine: fps delta floor refined earlier today holds; param cycle guard added (`.par` chains can recurse).

## 2026-06-11 — experience completion: compositor previews, create dialog, real sketches as examples

- **Real-time previews**: one transparent GPU compositor canvas overlays the editor; each frame it scissor-blits the viewer rect plus every visible TOP node's thumb rect on both backends (contain-fit, clipped to the network panel). The 6 Hz readPixels thumbnail path is gone — previews run at full frame rate with zero CPU readbacks. `blitToCanvas(tex, rect?)` + `clearCanvas()` joined the pass contract.
- **OP Create dialog**: palette redesigned (family tabs TOP/CHOP/COMP/DAT, searchable 3-column grid, arrow/Tab/Enter keyboard flow, search spans families). Original styling.
- **Three real 2022 sketches imported as bundled examples** (06 pseudo-voronoi, 07 fractals, 08 chop study): converted via the full importer from the original .toe files, TD scaffolding (local/perform) stripped, lightly adapted (dead movie source → noise; circle TOP stub → soft rectangle; `click` channel idiom → `lmb` with idle offsets). All three verified rendering + interacting, zero node errors.
- **Two engine fixes found by the real sketches** (the point of dogfooding): (1) composite/over layer order now TD-compatible — input 0 is the TOP layer (the imported patch's opaque background had covered everything; bundled trails example rewired accordingly); (2) importer unquotes quoted string constants (`channames 0 "tx ty"` had kept literal quotes, breaking select patterns) — regression tests added for both. 49 tests.

## 2026-06-11 — polish round: .toe intake, tooltips, full math CHOP, GitHub link

- **Drop-anywhere .toe intake**: drag a `.webtoe.json` (loads), a `.toe.dir` folder (recursive FileSystemEntry walk → importer), or a raw `.toe`/`.tox` (guide modal: proprietary-binary explanation, copyable per-OS toeexpand commands pre-filled with the filename, CLI alternative, "pick the expanded folder…" button). The load button also accepts `.toe` and routes to the guide. Re-verified: no zlib streams anywhere in .toe binaries (full-file scan) — in-browser binary parsing remains impossible, the guide is the honest path.
- **Inlet/outlet tooltips**: hover shows `input N · FAMILY — description (required)` / `output 0 · FAMILY (texture/channels/text)`; per-input descriptions via new `OpSpec.inputLabels` (displace, composite, math ops); containers explain tunnel routing.
- **Math CHOP completed** to the TD pipeline: channel pre op → combine channels → combine CHOPs → channel post op → mult-add → range remap, organized in parameter pages (op / mult-add / range) via new `ParamSpec.page`; the panel renders page section headers; TOP common page groups resolution params. Importer maps preop/chanop/postop/fromrange/torange tokens. Pipeline unit test (49 total).
- **GitHub link** (octocat icon) in the toolbar → repo (configurable via `EditorOptions.repoUrl`).
- Browser-verified: modal renders + copies, drop-load of a synthetic project works, param pages render, tooltips correct, zero errors.

## 2026-06-11 — TD parity charter + flagship showcase example

- **docs/TD-PARITY.md**: crawled the official docs.derivative.ca operator categories (TOP ~147, CHOP 172, SOP 115, DAT 77, MAT 13, COMP 45, POP 106 ≈ 675 ops) and wrote the full "evolve toward TD" charter — portable/web-equivalent/native-only classification, per-family tier targets cross-referenced with corpus usage, engine-concept gap table (multi-sample+time-sliced CHOPs as the audio prerequisite, WebAudio bundle, 3D R3, GLSL R4, POP compute R5, parameter-system depth incl. pulse/bind/custom COMP pars, panels R7, perform-mode-as-route, timeline/keyframes, JS-callback-DAT as the Python-boundary answer), and the standing measure→pick→implement→verify→record loop.
- **09 showcase example**: 27 nodes / 25 distinct op types across all four families — camera→flip→edge (graceful placeholder headless), circular-ramp kaleidoscope COMP (in/out tunnels, ± speed-integrator rotation, difference mix), color-noise + hue drift, mouse-thirds source switch, reorder-remixed noise displacement, hue-drifting feedback trails, math-TOP pulse, CHOP rig (mousein→select→lag, lfo×2, speed, par reader, full-pipeline math, merge scope), DAT notes. Verified: switch follows mouse thirds (index 0/1/2), speed integrates, output non-black, zero node errors.

## NEXT

Backlog (v2 — full detail and measured targets in docs/ROADMAP.md, full parity map in docs/TD-PARITY.md):
1. M8 compute particle family (POPs spirit) + audio-rate CHOPs (wasm decision per PLAN §5 benchmark gate).
2. Importer round 3: cross-network wire resolution, raw-.toe drop explainer modal, more TYPE_MAP/PARAM_MAP entries driven by real import-report histograms, media relink-by-drop flow.
3. Editor round 2: marquee select, undo/redo, node rename UI, COMP display-child preview thumbs, mobile/touch pan-zoom.
4. Watch derivative.ca for the official JSON text format → add the second ProjectLoader (PLAN §3 adapter).
