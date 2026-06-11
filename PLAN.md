# WebToe — implementation plan

*The execution contract for building WebToe. Written 2026-06-11 (rev 2: WebGPU/WASM strategy + long-term modular architecture), before any code. If you are an AI assistant (Opus or otherwise) resuming this build: read this file fully, then read `WORKLOG.md` and continue from its `## NEXT` section. Every rule in here is binding unless the user says otherwise.*

---

## 1. What WebToe is

WebToe is an original, browser-native, node-based real-time visual engine in the spirit of TouchDesigner's workflow:

- a network editor where you create operators, wire them, and edit parameters live;
- a real-time GPU engine (WebGL2 today, WebGPU as a first-class second backend) that cooks the graph every frame;
- an importer that reads ordinary TouchDesigner projects (via the official `toeexpand` text expansion) and reconstructs them — running the operators WebToe supports and showing faithful stubs for the rest;
- bundled example projects that run out of the box;
- its own versioned JSON project format (`.webtoe.json`), lossless save/load.

Target: public repo `https://github.com/frank890417/WebToe`, deployed live on GitHub Pages. Long-term: an engine/editor other projects can embed (education platforms, portfolio sites), with publishable packages and a plugin operator API.

### Not goals (v1)
3D (SOP/MAT/render pipeline), Python scripting, audio DSP graph, DAT execution, multi-user, `.toe` binary parsing (proprietary compression — see `docs/RESEARCH.md`), panel/UI COMPs. *(A POP-style GPU-particle family is an explicit v2 target on the WebGPU-compute backend — design seams for it, don't build it.)*

## 2. IP-safety rules (binding)

Background: the `.toe` binary is proprietary; the official `toeexpand` CLI (ships with every TD install) converts it to undocumented but readable text. Reading a file format for interoperability is standard practice; the constraints below keep us clean. Full research with sources: `docs/RESEARCH.md`.

1. **Never commit or bundle anything owned by Derivative**: no `toeexpand`/`toecollapse` binaries, no TD sample/template files, no text from their docs, no TD icons/fonts/UI artwork, no palette components. The importer consumes output the *user* produces with *their own* TD install.
2. **All code, GLSL/WGSL, icons, styling are written fresh for this repo.** Node-editor layout concepts (network + parameter panel + viewer + create-dialog) are common to cables.gl/Blender/Houdini/TD and fine to share; do not pixel-copy TD's visual design. Use our own palette, not TD's exact family colors.
3. **Trademark**: the name "TouchDesigner" appears only in factual interop statements. README carries: "WebToe is an independent open-source project, not affiliated with or endorsed by Derivative Inc. TouchDesigner is a trademark of Derivative Inc."
4. **Operator names** stay generic/descriptive (`noise`, `blur`, `math`) — fine. Don't clone TD's exact parameter-page layouts wholesale; map only what we implement.
5. **No user-private content in the repo**: no personal file paths, no unpublished artwork names or files from the research machine. Examples are authored from scratch.
6. License: MIT.

## 3. Architecture — modular monorepo (npm workspaces)

Built for long-term maintenance: strict layer boundaries, each package independently testable and later publishable (`@webtoe/core` etc.), the editor embeddable in other sites, operators installable as plugin packs.

```
webtoe/
├── PLAN.md  WORKLOG.md  README.md  LICENSE  docs/RESEARCH.md  docs/ARCHITECTURE.md
├── package.json              npm workspaces root; scripts fan out
├── tsconfig.json             strict; path aliases @webtoe/* → packages/*/src
├── packages/
│   ├── core/                 ZERO-dependency TS (no DOM, no GPU imports) — the contract layer
│   │   └── src/
│   │       ├── types.ts      Family, OpSpec, ParamSpec, ParamValue, NodeJSON, WireJSON
│   │       ├── node.ts       NodeInst: params, inputs, children, flags, cook cache
│   │       ├── graph.ts      create/delete/rename/wire/unwire, COMP hierarchy, name uniquing
│   │       ├── engine.ts     frame loop driver, pull-based cook scheduler, time context
│   │       ├── expr.ts       expression compile/eval + TD-Python → expr translation
│   │       ├── registry.ts   op registry + PUBLIC plugin API: registerOp(spec)
│   │       ├── passes.ts     backend-agnostic GPU contract: TexturePassSpec, ResourceHandle,
│   │       │                 uniform/texture binding descriptions (NO WebGL/WebGPU types here)
│   │       └── serialize.ts  .webtoe.json read/write, format version + migration hooks
│   ├── ops/                  operator definitions; depends on core ONLY
│   │   └── src/
│   │       ├── chop/         data.ts (ChannelSet) + kernels.ts (pure TS, wasm-replaceable seam)
│   │       │                 + ops (constant, lfo, noise, math, lag, merge, select, mousein)
│   │       ├── top/          op specs: params + per-backend shader sources
│   │       │   ├── glsl/     *.frag.ts — WebGL2 GLSL 300 es (v1: complete set)
│   │       │   └── wgsl/     *.wgsl.ts — WebGPU WGSL (v1: pilot ops; parity is M7)
│   │       ├── comp/         container + in/out tunneling
│   │       └── dat/          text (display only, never executed)
│   ├── gpu/                  backend interface + implementations; depends on core only
│   │   └── src/
│   │       ├── backend.ts    interface GpuBackend { init, createTexture, runPass(TexturePassSpec),
│   │       │                 readPixels, blitToCanvas, dispose… } + selectBackend(prefs)
│   │       ├── webgl2/       full v1 implementation (ubiquitous incl. older Safari)
│   │       └── webgpu/       capability detect + working skeleton + pilot ops; compute-ready
│   ├── io/                   webtoeFile.ts, toedir.ts (importer + translation tables + report),
│   │                         adapter interface ProjectLoader (official-JSON loader slots in later)
│   ├── editor/               embeddable UI library (network view, params, viewer, palette);
│   │                         depends on core/ops/gpu via interfaces; exports mountEditor(el, opts)
│   └── cli/                  toe-convert.mjs (wraps the USER'S OWN toeexpand; never bundled)
├── apps/
│   └── web/                  Vite app shell: index.html, main.ts → mountEditor, examples menu
│       └── public/examples/*.webtoe.json
├── tests/                    cross-package integration tests (vitest); unit tests live per-package
└── .github/workflows/ci.yml  typecheck + tests + build + Pages deploy
```

**Dependency rule (enforced by review, documented in ARCHITECTURE.md): imports flow downward only — `apps/web → editor → {ops, gpu, io} → core`. `core` imports nothing. No package imports DOM except `editor`, `apps/web`, and the media/webcam parts of `ops/top` behind a capability interface.**

Stack: **Vite + TypeScript (strict) + vitest; zero runtime dependencies.** UI is hand-rolled DOM/SVG (no framework) — keeps the editor embeddable anywhere and trivially auditable. Path aliases over project references for simplicity; package extraction to npm is a mechanical later step.

### Extensibility contracts (design these first, they are the product)
- **Plugin ops**: `registerOp(spec)` is public API; an op pack is any module calling it. Spec carries `schemaVersion`, family, params, cook fn, per-backend shader sources, and optional `migrate(oldParams, fromVersion)`.
- **Project format**: `{"app":"webtoe","version":N}` with `migrations[]` chain in `serialize.ts`; loading any older version always works.
- **Importer adapters**: `ProjectLoader` interface (`canLoad(files) / load(files) → GraphJSON + ImportReport`); `toedir` is the first adapter, Derivative's announced official JSON format becomes the second (research §7).
- **Backend negotiation**: `selectBackend({prefer})` → WebGPU when available *and* all ops in the project declare WGSL support, else WebGL2; URL override `?backend=webgl2|webgpu`; per-op `backends: ['webgl2','webgpu']` declaration lets coverage grow incrementally.

## 4. GPU strategy — WebGL2 + WebGPU, one pass contract

The engine never talks to WebGL or WebGPU directly; it emits **backend-agnostic `TexturePassSpec`s** (defined in `core/passes.ts`): `{ shaderId, uniforms: {name: value}, inputs: TextureHandle[], target: TextureHandle, resolution }`. Each backend owns: resource pools (textures/FBOs vs GPUTexture), pipeline/program caches keyed by `shaderId`, uniform upload (locations vs bind groups + UBO), ping-pong for feedback, blit-to-canvas, readPixels for thumbnails.

- **WebGL2 backend (v1, complete)**: fullscreen-triangle fragment passes, RGBA8 (float16 where `EXT_color_buffer_float`, behind a capability flag), separable blur via multi-pass.
- **WebGPU backend (v1: real skeleton + pilot ops; M7: parity)**: same pass contract via render pipelines; **compute shader path reserved** for the v2 particle/POP-style family and for CHOP buffer math at audio rates — this is the long-term performance ceiling and the reason the abstraction exists. Pilot ops in v1 (constant, ramp, level) prove the contract is truly backend-neutral before the op set grows.
- **Shader authoring**: every op's GLSL and WGSL are hand-written originals sharing a naming convention (`uniform float u_brightness` ↔ struct field `brightness`); no transpilers in the build. A `shadertools` test asserts every registered op has sources for each backend it declares.
- **Performance budget**: 60 fps at 1080p for a 30-TOP graph with thumbnails on (M-series / modern dGPU); thumbnails throttled (~6 Hz, viewport-only); zero per-frame allocations in the cook hot path (reuse uniform objects, Float32Arrays).

## 5. WASM strategy — seams now, adoption when measured

Rule: **WASM is adopted only when a profiled hotspot shows ≥2× gain**; until then TS reference implementations keep the build simple and auditable. What we do NOW so that's cheap later:

- All CPU-heavy kernels live in `ops/chop/kernels.ts` behind a `Kernels` interface (`lagFilter(buf, …)`, `fbmNoise1D(…)`, future resample/FFT). A Rust→wasm or AssemblyScript build can implement the same interface and be swapped via one provider call (`setKernels(wasmKernels)`), feature-detected, with the TS path as permanent fallback.
- Typed-array-first data layout everywhere (ChannelSet = `Float32Array`s; no per-sample objects) — this is what makes both WASM and WebGPU-compute adoption a drop-in.
- Candidate workloads ranked: audio-rate CHOP DSP (FFT/filters) → most likely first wasm win; geometry (v2 SOP) → wasm or WebGPU compute; expression eval stays JS (JIT is fine for per-frame scalar work).
- Note: for data-parallel image/particle work, WebGPU compute usually beats wasm — decide per workload, record decisions in `docs/ARCHITECTURE.md`.

## 6. Core semantics

### 6.1 Families & data
- `TOP` — output: GPU texture handle. `CHOP` — output: ChannelSet (`{channels:[{name,data:Float32Array}], rate}`; v1 length-1 control values). `COMP` — container hierarchy. `DAT` — static text (display only).
- Wires connect same-family ops. CHOP→parameter binding via expressions (`op('lfo1')['chan1']`), TD-style export simplified.

### 6.2 Cook model
- `engine.frame(t)`: time context `{seconds, frame, delta, fps}`; pull-cook the live roots (viewer node, display-flagged nodes, visible thumbnails).
- `cook(node, frame)` memoized per frame; cooks inputs first; expressions referencing `op('x')` cook `x` first (cycle guard set; a cycle yields previous output + warning badge).
- **Feedback** TOP reads its input chain's *previous-frame* texture — never recurses; ping-pong handled by the backend.
- v1 recooks live chains every frame; static-chain caching is a listed optimization with the memo field already in place.

### 6.3 Expressions
- JS expression grammar, compiled once per param: `new Function` wrapper exposing exactly `time`, `me`, `op(name)`, whitelisted math (`sin cos tan abs floor ceil min max pow sqrt clamp PI`…), `rand(seed)`. Runtime error → param error badge + default value. User-authored patch code; same trust model as cables.gl/hydra. Imported TD Python is never executed.
- **TD-Python translation table** (import-time, in `expr.ts`): `absTime.seconds|me.time.seconds → time.seconds`; `absTime.frame → time.frame`; `op('X')['c']` unchanged; `op('X')[0]` → by-index; `math.* → *`; `math.pi → PI`; safe `//` → `floor(a/b)`. Anything else (`.par.`, comprehensions, lambdas, conditionals, unknown calls) → keep original as `tdExpr`, mode `disabled-expr`, fall back to default, count in import report.

### 6.4 Parameters
`ParamValue = { mode: 'const'|'expr'|'disabled-expr', value, expr?, tdExpr? }`; specs declare type (`float int toggle menu string color xy`), default, soft range. Panel renders widget + per-param expression toggle.

## 7. Operator set (v1 — the "important components")

### TOPs (per-backend shaders; WebGL2 complete in v1, WGSL pilots marked ●)
| op | params (key ones) | notes |
|---|---|---|
| `constant` ● | color | flat color |
| `noise` | type(simplex/fbm), period, harmonics, offset xy, animate, mono | original simplex/fBm implementation |
| `ramp` ● | type(linear/radial/circular), phase, color A/B | |
| `rectangle` | size, center, color, bg, softness | parametric shape |
| `imagein` | file (picker/drop), fit | user images; examples don't require bundled media |
| `videoin` | file | looping HTMLVideoElement |
| `camerain` | device | getUserMedia (https/localhost), graceful fallback |
| `transform` | translate xy, rotate, scale xy, pivot, extend(hold/cycle/mirror/zero) | 2D UV transform |
| `level` ● | brightness, contrast, gamma, opacity, invert | |
| `monochrome` | weights | luma |
| `hsvadjust` | hue offset, sat mult, value mult | |
| `blur` | size, passes(1–4), direction(both/h/v) | separable gaussian, ping-pong |
| `composite` | operation(over/add/multiply/screen/subtract/difference) | 2+ inputs |
| `displace` | source weight, displace weight, offset | in0 image, in1 map |
| `edge` | strength, color | sobel |
| `feedback` | — | previous-frame texture of input |
| `null` / `out` | — | passthrough; `out` = COMP output |

Common TOP page: resolution (`input`/`custom` w·h; root default 1280×720).

### CHOPs (pure TS kernels behind the wasm-ready `Kernels` interface)
`constant` (4 named slots) · `lfo` (sin/tri/square/saw/pulse; freq, amp, offset, phase) · `noise` (time-driven fBm; period, harmonics, amp, seed) · `math` (add/sub/mult/div/avg; gain, offsets) · `lag` (lag up/down seconds) · `merge` · `select` (name pattern) · `mousein` (`tx ty` 0–1 over viewer + `lmb`).

### COMP / DAT / stub
`container` (enter/exit; In/Out tunneling via `inTOP|outTOP|inCHOP|outCHOP` children mapped to external wires in name order) · `text` DAT (read-only; imported Python lands here) · `stub` — import fallback keeping original family color + TD type label + original parm dump in an inspector tab; passes through input 0 if same family, else labeled placeholder.

## 8. File I/O

### 8.1 Native `.webtoe.json` (versioned)
```json
{ "app": "webtoe", "version": 1,
  "root": { "nodes": [ { "name", "type", "pos": [x,y], "flags": {"display": true},
                          "params": { "key": {"mode","value","expr"} },
                          "children": [ … ] } ],
             "wires": [ {"from": "noise1:0", "to": "level1:0"} ] } }
```
Save = Blob download; load = picker/drag-drop; examples fetched from app. Round-trip lossless (unit-tested); `migrations[]` from version 1 onward.

### 8.2 TouchDesigner import (expanded `.toe.dir`) — first `ProjectLoader` adapter
Format knowledge (empirically verified; grammar in `docs/RESEARCH.md` §2.1): `X.n` = `FAMILY:type`, `tile x y w h`, `flags`, `color`, `inputs {index sourcePath}`; `X.parm` = `name modeFlag rest` between `?` lines (17 = expression, 16 = string + default expr, 0 = const); `X.text` = DAT text; subdir `X/` = COMP children; `.build` = build info.

Entry paths: (a) drag a `.toe.dir` folder (webkitdirectory/FileSystemHandle), (b) multi-select its files, (c) drop a raw `.toe` → modal explaining the one-time local `toeexpand` step + `packages/cli` instructions. Mapping:
- type table: `TOP:noise|level|blur|transform|ramp|constant|feedback→same`, `TOP:comp|composite|over|add→composite(+operation)`, `TOP:moviefilein→imagein(placeholder+relink)`, `TOP:null|out→null|out`, `CHOP:lfo|noise|math|lag|constant|mousein|merge|select→same`, `COMP:container|base→container`, `DAT:text→text`, **else → `stub`**.
- per-op param tables (TD name → ours, with unit conversions documented inline); unmapped params ignored + counted.
- tile coords → pos (y-flip); expressions → §6.3 table.
- **Import report** dialog: N nodes (M runnable, K stubs), L expressions translated, J disabled — honesty is the feature.

### 8.3 `packages/cli` — `toe-convert.mjs`
`node toe-convert.mjs project.toe [-o out.webtoe.json]`: locates the user's TD install (`/Applications/TouchDesigner*.app/Contents/MacOS/toeexpand` | `%PROGRAMFILES%\Derivative\*\bin\toeexpand.exe` | `--toeexpand path`), runs it in a temp dir, applies the shared translation tables, writes `.webtoe.json`. Never bundles the binary.

## 9. UI design (`packages/editor`, embeddable via `mountEditor(el, opts)`)

CSS-grid layout: network editor (dominant) · right column = viewer + parameter panel · top toolbar (project name, save/load/import, examples, backend badge, fps) · breadcrumb. Original dark theme; our family colors: TOP `#7c6cff`, CHOP `#4fb286`, COMP `#8a8a93`, DAT `#d2699e`.

Network editor: DOM node boxes (name, type, preview thumb, in/out stubs) over an SVG wire layer; container CSS-transform pan (drag empty space) / zoom (wheel). `Tab` or double-click → searchable palette grouped by family (arrow keys + enter). Drag stubs to wire (family-validated). Double-click COMP enters; `u` up; `Delete` removes; `d` sets display flag. Viewer follows selection; display flag pins.

Viewer hosts the engine's single canvas (backend blits selected TOP at 60 fps); CHOP selected → 2D scope (value + sparkline); DAT → text. Thumbnails ~6 Hz, viewport-only, 96×54 readbacks.

## 10. Examples (`apps/web/public/examples/`, all within v1 op set, each verified)

1. **01-hello-noise** — noise → level → out; lfo drives brightness via expression. *(cook loop, expr binding, viewer)*
2. **02-feedback-trails** — rectangle (mouse-driven transform) → composite ← feedback → blur → level → out. *(feedback, mousein, multi-input)*
3. **03-lfo-garden** — 3 phase-offset LFOs driving ramp/transform chains → composite(add) → hsvadjust. *(many bindings, multiple chains)*
4. **04-webcam-displace** — camerain → displace ← noise → edge → composite. *(webcam, displace; graceful no-camera fallback)*
5. **05-chop-playground** — lfo/noise/math/lag chains + scope views driving a transform. *(CHOP semantics made visible)*

## 11. Verification protocol (every milestone; evidence into WORKLOG.md)

- `npm run check` (typecheck all packages + vitest) green before any push.
- Visual: dev server + screenshots per example; animated = two captures ≥1 s apart differ; console error-free.
- Interaction smoke: palette-create, wire, param edit, expression toggle, COMP enter/exit, save → reload → load, `.toe.dir` import on a self-made TD file (never committed).
- Backend matrix: examples on WebGL2 (required) + pilot ops on WebGPU where available (record browser/OS in log).
- Performance: examples ≥ 50 fps on the dev machine with thumbnails on.

## 12. Milestones (commit + push + WORKLOG entry each)

| # | Deliverable | Acceptance |
|---|---|---|
| M0 | Plan rev 2 + workspace scaffold + CI + repo public | repo visible; CI green; Pages workflow present |
| M1 | `core` + `ops/chop` + expr + serialize, with tests | `npm run check` green; round-trip + translation tests pass |
| M2 | `gpu` (backend iface + WebGL2) + `ops/top` — hello-noise renders | animated screenshot; no GL errors; pass contract has ≥1 WGSL pilot proving neutrality |
| M3 | `editor` complete | interaction smoke passes (screenshots) |
| M4 | `io` + all 5 examples | every example loads + animates; save/load round-trips |
| M5 | toedir importer + `cli` | structure-correct import of a self-made TD project; report dialog correct |
| M6 | polish, README, ARCHITECTURE.md, Pages live | public URL renders examples; final WORKLOG + report |
| M7 *(post-v1)* | WebGPU parity for full TOP set | backend matrix green both ways |
| M8 *(post-v1)* | compute-based particle family (POP-spirit) + audio-rate CHOPs (wasm decision point) | per §5 benchmark gate |

## 13. Risks & decisions log

- **WebGL2 first, WebGPU first-class second**: WebGL2 is still the universal floor; WebGPU (broadly shipped across Chrome/Edge/Safari/Firefox by 2025–26) is the performance ceiling and the only path to compute (particles, big CHOP buffers). The pass contract in `core/passes.ts` is the load-bearing design — review it hardest.
- **Dual shader sources are hand-written** — no GLSL↔WGSL transpiler in the build (auditability, IP cleanliness, debuggability). Cost: each op authored twice at parity time; mitigated by small per-op shader surface and the naming convention test.
- **DOM+SVG editor over canvas-drawn**: hit-testing/text/a11y for free; fine ≤ a few hundred visible nodes; canvas renderer is a swappable optimization inside `editor` later.
- **Expressions are real JS** — not a security boundary (same model as every patch tool); imported TD Python never executes.
- **Imported media can't resolve** (browser sandbox) — placeholder + relink-by-drop flow.
- **Session interruption**: PLAN + WORKLOG `## NEXT` + per-milestone pushes are the recovery mechanism.
- **2026 watch item**: Derivative's official JSON format (research §7) → second `ProjectLoader`, zero engine changes.

## 14. Handoff instructions (for Opus or any successor)

1. `cd webtoe && npm install && npm run dev` — confirm boot before changing anything.
2. Read `WORKLOG.md` → `## NEXT`; do exactly that. Don't re-plan unless the user asks.
3. §2 IP rules are absolute — when in doubt, leave it out of the repo.
4. Respect the dependency rule (§3) and the pass contract (§4); new ops register via the public API, never via editor special-cases.
5. After each chunk: `npm run check` → visual verify (§11) → WORKLOG entry (timestamp, what, evidence, NEXT) → commit (`feat:`/`fix:`) → push.
6. Never commit: Derivative binaries/assets, personal paths/artwork, `node_modules`, `*.toe`/`*.toe.dir` test files (gitignored).
7. Report to the user at milestone boundaries; WORKLOG.md is the canonical progress record.
