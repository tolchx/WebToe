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

### R1 — routing & pixel-math TOPs *(small, immediate)*
`switch`, `select`, `math` (per-pixel add/mult/power…), `reorder` (channel swizzle), `fit`, `flip`, `crop`, `mirror`, `lookup`; CHOP: `switch`, `trail`, `speed`, `trigger`-lite. All are single-pass shaders or trivial kernels on existing contracts. *Est. corpus coverage after R1: ~40%.*

### R2 — expression engine v2 *(the multiplier)*
- `parent()` / `parent(n)` and `.par.Name` reads on node proxies (engine already resolves params live — expose them in the expression scope).
- `op('x').par.y`, `me.par.x`, channel-value coercion, `absTime.frame` aliases, safe Python ternary `a if c else b` → conditional translation.
- `CHOP:par` op (read any param as channels).
- Keeps the hard boundary: no statements, no imports, no side effects; untranslatable stays inert (`tdExpr`).

### R3 — the 3D pipeline *(the headline)*
Minimal-but-real forward renderer on the existing backend contract (no three.js — zero-dep stays):
- `COMP:geo/camera/light/null(3D)`, transform hierarchy;
- SOP core as typed-array geometry (CPU first, behind the wasm-ready kernel seam): `circle`, `line`, `rectangle`, `sphere`, `grid`, `merge`, `transform`, `noise`, `copy`, `switch`;
- `MAT:constant`, `MAT:pbr` (lite: base color/metal/rough, image maps), wireframe/point render modes (their sketches lean on lines/points heavily);
- `TOP:render` = scene pass into the same texture pool (depth target added to the pass contract; WebGPU render pipelines already support it naturally).
*This phase roughly doubles real-project fidelity (~65% est.).*

### R4 — `TOP:glsl`
User fragment shaders: TD GLSL 3.30 → GLSL ES 3.00 compatibility shim (uniform/sampler renames `sTD2DInputs[i]` → `u_texN`, `uTDOutputInfo` → `u_res`, version/precision header), plus a WGSL path marked per-shader. Unsupported constructs report cleanly on the node. Unlocks custom looks in half the 2022–24 sketches.

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
