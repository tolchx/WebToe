# R3 — the 3D pipeline: thorough plan

*Written before implementation (2026-06-11). Grounded in (a) the production corpus — the 3D blocker appears in ~46–48 of 60 projects and is dominated by line-art geometry: `SOP:line` 414, `SOP:circle` 364, `SOP:merge` 423, `SOP:skin` 69, `MAT:line` 92, instancing enabled on 115 of 870 geo COMPs — and (b) official parameter semantics crawled from docs.derivative.ca (Render TOP, Geometry/Camera/Light COMPs, Line MAT). Builds on the renderer research already verified in [ROADMAP.md](ROADMAP.md) §R3.*

## Goals & non-goals

**Goal**: real TD-style 3D dataflow — SOP geometry networks inside Geometry COMPs, materials, cameras, lights, and a Render TOP that produces a texture on the existing pass contract — sufficient to run the corpus's line-art 3D sketches and author new ones.

**Declared v1 limitations** (each honest, each with a follow-up path):
1. **WebGL2 first.** Scene rendering ships on the WebGL2 backend; WebGPU scene parity is its own later milestone (the contract is backend-neutral; render ops declare `backends: ['webgl2']` and report cleanly on WebGPU). Same growth pattern the TOP family used.
2. **Line width ≈ 1px.** TD's Line MAT width unit is 1/1000 of image width (screen-relative); WebGL2 native lines are 1px on most platforms. v1 renders native lines and clamps width; screen-space quad expansion (with joins/caps) is the follow-up. Points DO get sizes (`gl_PointSize`).
3. **Instancing source = SOP points first.** TD's `instanceop` accepts CHOP/SOP/DAT with channel-name mapping (`instancetx` names a channel). Our CHOPs are single-sample until the multi-sample milestone, so v1 instances from a SOP's point attributes (P → translate, Cd → color) — which covers the visual corpus cases. CHOP sources arrive with multi-sample CHOPs.
4. **No parent-transform inheritance.** TD object COMPs inherit transforms through COMP nesting; corpus sketches mostly keep geos flat with their own transforms. v1 computes each object's matrix from its own xform page only; hierarchy composition is a follow-up (the matrix walk is designed for it).
5. **`SOP:filein` stays a stub** (external geometry files); `MAT:glsl` stays a stub until R4 infrastructure.

## 1. Data model (`@webtoe/core`)

```ts
// new Family members: 'SOP' | 'MAT' (Family union, stubs, editor colors, palette tabs)

interface GeometryData {
  // point attributes — typed-array-first (PLAN §5), positions required
  P: Float32Array;            // xyz interleaved
  N?: Float32Array;           // xyz normals
  uv?: Float32Array;          // xy
  Cd?: Float32Array;          // rgba point colors
  // topology
  triangles?: Uint32Array;    // index triplets
  lineStrips?: Uint32Array[]; // each array = point indices of one polyline (closed handled by repeat)
  renderPoints?: boolean;     // render as point cloud when no prims
  version: number;            // bumped on change → backend VAO cache key
}

// OpOutput gains:
type SopOut   = { kind: 'sop'; geo: GeometryData };
type MatOut   = { kind: 'mat'; mat: MaterialSpec };
type ObjOut   = { kind: 'obj'; obj: SceneObject };       // geo/cam/light COMP cooks

interface MaterialSpec {
  shading: 'constant' | 'lit' | 'line' | 'points' | 'wireframe';
  color: [number, number, number, number];
  map?: TextureHandle | null;       // constant/lit: TOP path resolved at cook
  pointSize?: number;               // points
  lineWidth?: number;               // accepted, clamped (limitation 2)
  metallic?: number; roughness?: number; emit?: [number, number, number];
}

interface SceneObject {
  role: 'geo' | 'camera' | 'light';
  model: Float32Array;              // 4×4 world matrix (TRS, pivot honored)
  geo?: GeometryData;               // role geo
  material?: MaterialSpec;
  instances?: { count: number; translate: Float32Array; color?: Float32Array };
  camera?: { proj: Float32Array; view: Float32Array };
  light?: { kind: 'point' | 'directional' | 'ambient'; color: [number,number,number]; intensity: number; position: [number,number,number]; direction: [number,number,number] };
}
```

`core/mat4.ts` — zero-dep 4×4 math: `identity, multiply, compose(t,r,s,pivot), perspective(fovYdeg,aspect,near,far), lookAt, invertRigid, transformPoint`. Unit-tested against hand-computed cases.

`core/passes.ts` — the pass contract grows one method:
```ts
renderScene(node: NodeInst, spec: ScenePassSpec): TextureHandle;
interface ScenePassSpec {
  camera: { view: Float32Array; proj: Float32Array };
  lights: SceneObject['light'][];
  draws: { geo: GeometryData; geoKey: string; model: Float32Array;
           material: MaterialSpec; instances?: SceneObject['instances'] }[];
  output: { width: number; height: number };
  clear: [number, number, number, number];
}
```

## 2. SOP set (18 ops, pure-TS kernels in `ops/src/sop/`, all unit-tested)

| op | params (defaults) | output |
|---|---|---|
| `sop:line` | p1(0,0,0), p2(0,1,0), points=20 | one strip |
| `sop:circle` | radius .5, divisions=32, arc(closed/open), plane(xy/zx/xz) | strip (closed) |
| `sop:rectangle` | size, plane | closed strip |
| `sop:grid` | rows=10, cols=10, size — triangles + uv | mesh |
| `sop:sphere` | radius .5, rows=16, cols=24 | mesh + N + uv |
| `sop:box` | size xyz | mesh + per-face N |
| `sop:tube` | rad1, rad2, height, rows, cols | mesh + N |
| `sop:torus` | rad1 .5, rad2 .15, rows, cols | mesh + N |
| `sop:merge` | — (4 inputs) | concat all attribs/topology |
| `sop:transform` | t/r/s/pivot (TD tokens) | P (and N) transformed |
| `sop:noise` | amount .1, period 1, speed, seed, dirxyz | P displaced by fbm (reuses chop kernel noise) |
| `sop:copy` | — in0 geo, in1 template points | concat copy per template point (+Cd inherit) |
| `sop:skin` | — | loft consecutive strips of input (equal point counts) → mesh + N |
| `sop:add` | points text? v1: closeall toggle | strip(s) from input points / close strips |
| `sop:point` | color rgba (+ override toggle) | sets Cd |
| `sop:facet` | unique points? v1: compute normals toggle | recomputed face N |
| `sop:switch` | index (expr-able) | picks input |
| `sop:null` / `sop:in` / `sop:out` | — | passthrough / tunnels |

## 3. MATs (5 ops, `ops/src/mat/`)

| op | params | shading |
|---|---|---|
| `mat:constant` | color, map (TOP path), alpha | `constant` (unlit, color×map) |
| `mat:line` | color (linenearcolor), width (widthnear, clamped v1), pointsize | `line` |
| `mat:pointsprite` | color, pointsize | `points` |
| `mat:wireframe` | color, width(clamped) | `wireframe` (triangles drawn as line topology) |
| `mat:lit` | basecolor, map, metallic, roughness, emit | `lit` — single Lambert+GGX-lite shader; **both `MAT:phong` and `MAT:pbr` import to this** (documented approximation) |
| `mat:switch`/`mat:null`/in/out | index / passthrough | routing |

## 4. Object COMPs

| op | params (TD tokens) | cook |
|---|---|---|
| `comp:geo` | xform page `tx ty tz rx ry rz sx sy sz px py pz`; `material` path; render toggle; instancing page: `instancing`, `instanceop` (SOP path v1) | `{kind:'obj', role:'geo'}`: geo = display/out SOP child; material resolved (default mat:lit gray); model = compose(xform); instances from instanceop SOP points |
| `comp:cam` | xform page; `lookat` path; `projection` (persp/ortho); `fov` (vertical°, mapped from `vertfov`/`horzfov`+aspect); `near` .001→0.01, `far` 5000→500 | view = invertRigid(model or lookAt), proj |
| `comp:light` | xform; `lighttype` point/distant; `lightcolorr/g/b`; `dimmer` | light object |
| `comp:ambientlight` | color, dimmer | ambient term |

Render TOP `top:render`: `camera` path (default first cam found), `geometry` pattern (default `*` = all geo COMPs in its network, TD-style wildcards `geo* ^geo7` supported via existing pattern code), `lights` pattern (`*`), `bgcolor` rgba, common resolution page. Cook: resolve+cook objects → assemble ScenePassSpec → `gpu.renderScene`. No camera → placeholder + error badge; no lights → headlight fallback (documented).

## 5. WebGL2 scene renderer (`gpu/src/webgl2/scene.ts`)

- **Targets**: render-target pool entries gain an optional depth renderbuffer (DEPTH_COMPONENT24), created lazily for scene passes.
- **Geometry cache**: VAO + VBOs keyed `nodeKey:version` (GeometryData.version bumps on SOP cook change); LRU ~64 entries; instance attribute buffer (divisor 1) for translate/color.
- **Programs (4, original GLSL)**: `unlit` (color×map×Cd), `lit` (Lambert + half-vector spec, ≤4 point/dir lights + ambient, metallic/roughness-lite), `points` (gl_PointSize, round sprite alpha), `lines/wireframe` (unlit; wireframe uses barycentric-free edge draw via line topology of triangle edges, cached per geometry version).
- **State**: depth test on for scene passes; alpha blend for transparency (sorted-blending only, v1); cull off (line art shows both sides).
- **Draw order**: opaque first then blended by camera-distance (simple painter sort per draw).

## 6. Editor & UX

- Family colors: SOP `#5e8bb8`, MAT `#c9a84c`; palette gains SOP/MAT tabs; family-aware wiring already generic.
- **SOP node previews**: the compositor renders any SOP output through a built-in auto-orbit preview scene (bounding-box-fit camera, headlight, line/point material by topology) into the node's pooled texture — geometry thumbnails live at full rate like TOPs.
- Viewer: selected SOP → same auto-orbit preview full-size; selected geo/cam/light → render of their network if a render TOP exists, else preview scene.

## 7. Importer & fixture

- TYPE_MAP: the 18 SOPs (+`SOP:filein`→stub), `COMP:geo/cam/light/ambient`, the MAT set (`MAT:phong|pbr → mat:lit`), `TOP:render`.
- PARAM_MAPs from the crawled token tables above (xform pages shared helper; render camera/geometry/lights/resolutionw/h; cam lookat/fov tokens incl. `vertfov`; light `lightcolorr/g/b`+`dimmer`; geo `material`, `instancing`, `instanceop`; line MAT `widthnear`+`linenearcolor*`).
- **Fixture v2**: extend the original committed `.toe` (authored text → `toecollapse` → `toeexpand`) with a 3D branch — circle → skin? (keep tiny: circle ×2 → skin → geo + cam + light + render) so the CI suite covers the 3D import path on genuine tool output.
- Tests: kernel suites (counts/normals/bounds), mat4 math, importer 3D mappings, render-TOP camera-matrix unit test (pure), fixture round-trip updated counts.

## 8. Examples & measurement (acceptance)

1. **Example 10 — "3d lines"** (authored): two circles → skin → geo with `mat:line`; second geo with sphere + wireframe; instanced copies from a grid SOP; orbiting camera via expressions (`sin/cos(time.seconds)`), one point light + ambient; render → post chain (level/bloom-ish blur composite) → out. Must run 60 fps.
2. **Re-import the 2022 3D sketches** (Fire Dance 65%, DNA 55% runnable pre-R3) — measure the jump; if one becomes visually faithful with light curation, bundle it as example 11 (same curation rules as before).
3. **Corpus re-measure** — expectation per ROADMAP: ≈47% → ~65%.
4. All existing tests stay green; new suites added; CI green; production deploy verified.

## 9. Build order (commit gates)

| gate | contents | check |
|---|---|---|
| R3a | Family ext, GeometryData, mat4, OpOutput variants, ScenePassSpec | typecheck + mat4/geometry unit tests |
| R3b | SOP kernels + ops + tunnels | kernel test suite |
| R3c | MATs + object COMPs + render TOP cook (no GL yet: spec assembly unit-tested) | scene-spec assembly tests |
| R3d | WebGL2 scene renderer + SOP previews + editor families | browser: example 10 renders, screenshots |
| R3e | importer + fixture v2 + sketch re-imports + corpus measure + docs/ship | full suite + CI + production |
