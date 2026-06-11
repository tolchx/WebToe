# WebToe roadmap — driven by a real production corpus

*To decide what "complete" means, we analyzed a private corpus of **60 real TouchDesigner projects** (daily-practice generative sketches spanning 2022–2026, 199 unique projects available, 60 sampled across eras) — **28,698 nodes** expanded with the official `toeexpand` and aggregated with [no project content published]. This document turns that data into the build order for making real projects run, not a guess.*

## Where WebToe stands against real work

- **Coverage today: 32.3% of corpus nodes** map to runnable WebToe ops (the rest import as faithful stubs — structure, wires, layout, code always survive).
- Corpus family distribution: TOP 7,536 · DAT 6,332 · COMP 5,417 · POP 3,148 · SOP 2,942 · CHOP 2,663 · MAT 660.
- 13,708 parameters carry live Python expressions (plus ~7,000 more in flagged expression modes that the importer now also detects — the mode field is a bitfield, bit 0 = expression, decoded empirically).
- A large share of DAT/COMP counts is TD's own scaffolding (annotation tools, stock UI components, per-project `local/` system networks) — high node counts but low visual impact. The phases below weight by *visual* impact and *projects-affected*, not raw counts.

## What actually blocks real projects (by projects affected, out of 60)

| Blocker | Evidence | Phase |
|---|---|---|
| **3D pipeline**: `COMP:geo` (48), `TOP:render` (46), `SOP:filein` (46), SOP core (circle 35, transform 30, merge 26, line 24, switch 25), `MAT:pbr/constant` | the single biggest gap — half the corpus renders 3D | R3 |
| **Routing/math TOPs**: `TOP:math` (39), `TOP:switch` (35), `TOP:reorder` (36), `TOP:select` (28) | cheap ops, huge reach | R1 |
| **Expression power**: `parent().par.X` family dominates (top pattern ≈1.3k uses); `CHOP:par` (37) | unlocks thousands of live params | R2 |
| **Custom shaders**: `TOP:glsl` (32) | per-project custom looks | R4 |
| **POP family** (2025–26 era): in/null/out/primitive/noise/merge… 3,148 nodes | the modern GPU-particle work | R5 |
| **Replicator + tables**: `COMP:replicator` (60/60), `DAT:table` (60/60), `DAT:select` (60/60) | template cloning + data plumbing in every project | R6 |
| Panel UI comps (button/slider/text) | control surfaces; visual output unaffected | R7 |
| Python DATs (parexec/panelexec/script) | **permanent boundary**: WebToe never executes imported Python; a JS-callback equivalent may come later | — |

## Phases

### R1 — routing & pixel-math TOPs ✅ *(shipped in evolution cycle 1)*
`top:switch` (expression-drivable index), `top:select` (pull any TOP by path), `top:math` (7 combine modes), `top:reorder` (channel swizzle), `top:flip`; `chop:switch`, `chop:speed` (integrator), `chop:par` (read parameters as channels); DAT-lite layer: `dat:table` (.table sidecar import), `dat:select/null/in/out`; `COMP:null → container`. Remaining (deferred, no new ops for now): `fit`, `crop`, `mirror`, `lookup`, `chop:trail`.

### R2 — expression engine v2 ✅ *(shipped in evolution cycle 1)*
`parent(n)` and `.par.name` reads on live node proxies (with parameter-cycle guard), `op('x').par.y`, `me.par.x`, Python ternary `a if c else b` → conditional, `and/or/not`, `int()→trunc()`, `mod.math.*`, `True/False/None`. Untranslatable still inert (`tdExpr`).

**Measured result of cycle 1 (R1+R2+DAT-lite + mode-bitfield decode): corpus coverage 32.3% → 47.1% of 28,698 nodes; the 213-node reference project went 56 → 88 runnable.**

### R3 — the 3D pipeline ✅ *(shipped — full plan in [R3-3D-PLAN.md](R3-3D-PLAN.md))*

Shipped: 19 SOPs (line/circle/grid/sphere/box/tube/torus/merge/transform/noise/copy/skin/add/point/facet/switch/null/in/out), 5 MAT shadings (constant/lit≈phong+pbr/line/points/wireframe + switch/null routing), geo/cam/light/ambient COMPs (TD xform tokens, look-at, SOP-point instancing per the crawled `instanceop` contract), Render TOP with TD pattern matching (`geo* ^geo7`), WebGL2 scene renderer (depth, VAO cache keyed by geometry version, instanced draws, 4 original shaders), auto-orbit 3D previews on every SOP/geo node, importer + committed-fixture coverage, example 10.

**Measured: corpus coverage 47.1% → 62.3%** (prediction was ~65). The 2022 3D sketches: DNA 55%→71%, Fire Dance 65%→74% runnable. Declared v1 limits (each with follow-up): WebGL2-only scene pass, 1px lines, SOP-source instancing, no parent-transform inheritance, filein/GLSL-MAT stubs.

*(original phase spec below, kept for reference)*
Minimal-but-real forward renderer on the existing backend contract (no three.js — zero-dep stays):
- `COMP:geo/camera/light/null(3D)`, transform hierarchy;
- SOP core as typed-array geometry (CPU first, behind the wasm-ready kernel seam): `circle`, `line`, `rectangle`, `sphere`, `grid`, `merge`, `transform`, `noise`, `copy`, `switch`;
- `MAT:constant`, `MAT:pbr` (lite: base color/metal/rough, image maps), wireframe/point render modes (their sketches lean on lines/points heavily);
- `TOP:render` = scene pass into the same texture pool (depth target added to the pass contract; WebGPU render pipelines already support it naturally).
*This phase roughly doubles real-project fidelity (~65% est.).*

### R4 — `TOP:glsl` *(contract verified by adversarial web research, 3-0 votes per claim)*
User fragment shaders, source-compatible via a shim. The injected TD contract, confirmed against [official docs](https://docs.derivative.ca/Write_a_GLSL_TOP) and the [td-shadertoy](https://github.com/matthewwachter/td-shadertoy) precedent:

| TD construct | Behavior in TD | WebToe shim |
|---|---|---|
| `#version` | TD targets desktop GLSL 4.60 and injects the directive itself — user source is headerless (matches our corpus: 0/546 shader texts carry `#version`) | prepend `#version 300 es` + precision |
| `sTD2DInputs[TD_NUM_2D_INPUTS]` (+`sTD3DInputs`, `sTDCubeInputs`, `sTDNoiseMap`, `sTDSineLookup`) | auto-declared sampler arrays | rewrite constant-indexed `sTD2DInputs[i]` → `u_texI` (ES 3.00 forbids dynamic sampler-array indexing — dynamic use reports unsupported); provide a noise-map helper texture |
| `vUV` | auto-declared varying with the pixel's texcoord | alias of our `v_uv` |
| `uTD2DInfos[i].res` / `uTDOutputInfo.res` | `(1/w, 1/h, w, h)` texture info uniforms | synthesize from our `u_res` + input handle sizes |
| `TDOutputSwizzle(vec4)` | mandatory output wrapper normalizing platform channel layouts | identity function |
| Mode parameter | `vertexpixel` or `compute` (dispatch size params) | pixel mode → fragment pass on both backends; compute mode → WebGPU compute path only (R5 infrastructure), reported on WebGL2 |

Unlocks custom looks in 32/60 corpus projects (avg shader ≈50 lines).

### R5 — POP family on WebGPU compute
The pass contract grows a compute variant (`ComputePassSpec`, storage buffers); POP core: `primitive`, `noise`, `math`, `merge`, `in/out`, `null`, render-as-points/lines. WebGPU-only (the reason the dual-backend architecture exists); WebGL2 shows stubs.

### R6 — replicator + table data layer
`DAT:table` (real rows/cols + `op('t')[row, col]` expression access), `DAT:select/null/in/out` passthroughs, `COMP:replicator` (template × table → clones — used by literally every corpus project), `DAT:info`-lite (readonly props).

### R7 — panel components
`button`, `slider`, `container`-panel rendering for control surfaces; panel-value expressions (`panel.rollover` patterns appear in stock UI styling throughout the corpus).

## Already done because of this analysis

- Parameter-mode **bitfield decoding** (bit 0 = expression) — importer now catches flagged expression modes (49, 273, …), ~7k additional live expressions in this corpus alone.
- `TOP:comp` token mapping (TD's Composite TOP), in/out tunneling (`TOP:in` appeared across COMP-structured projects), CHOP in/out — measured +15 runnable nodes on a 213-node production file.

## Method note

The corpus analyzer lives outside this repo (it reads private files); it expands each `.toe` with the user's own TouchDesigner, counts `FAMILY:type` per `.n` file, parameter modes per `.parm`, and expression strings — nothing project-identifying is published. Re-run it after each phase to track the coverage curve.
