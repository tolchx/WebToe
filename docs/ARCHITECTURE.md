# WebToe architecture

*Companion to [PLAN.md](../PLAN.md) (the execution contract) — this file records the shipped structure and the decisions behind it. Keep it updated when structure or decisions change.*

## Layers and the dependency rule

```
apps/web ──▶ @webtoe/editor ──▶ @webtoe/ops ──┐
                       │            │          ├──▶ @webtoe/core
                       ├──▶ @webtoe/gpu ───────┤
                       └──▶ @webtoe/io ────────┘
@webtoe/cli  (standalone node script; mirrors io's tables)
```

**Imports flow downward only. `core` imports nothing.** No package touches the DOM except `editor`, `apps/web`, and the media ops in `ops/top` (image/video/camera elements). `core` and the CHOP side of `ops` run headless in vitest.

## The load-bearing contracts

1. **`core/passes.ts` — the GPU pass contract.** The engine and all TOP ops describe work as `TexturePassSpec { shaderId, uniforms, inputs, output }` against the `GpuFacade` interface; backends own resources, pipeline caches, ping-pong pools (per node+slot), media upload, blit, readback. This is what makes WebGL2/WebGPU dual-backend possible and what a future compute pass type will extend.
2. **`core/registry.ts` — `registerOp(spec)`.** The public plugin surface. Op packs are modules that call it; the editor/palette/serializer discover everything through the registry. Op type keys are namespaced `family:name` (`top:noise`, `chop:noise`).
3. **`io` `ProjectLoader`.** Importers are adapters (`canLoad/load → GraphJSON + ImportReport`); `toedirLoader` is the first, Derivative's announced official JSON format becomes the second with zero engine changes.
4. **`ops/chop/kernels.ts` — the WASM seam.** CPU kernels sit behind a `Kernels` interface with the TypeScript implementation as permanent fallback; a wasm build is adopted only on a ≥2× profiled win (none needed at v1 scale).
5. **`serialize.ts` versioning.** `.webtoe.json` carries `version`; `migrations[]` chains old files forward; unknown op types degrade to family stubs via the `family` hint on every saved node.

## Cook model

- Pull-based, per-frame memoized (`cookedFrame`), cycle-guarded. Expressions can pull other nodes (`op('x')`) re-entrantly.
- `feedback` is the deliberate cycle-breaker: flagged `lazyInputs` so the engine does not pre-cook its input; it returns the input's *previous-frame* texture from the backend pool (and seeds transparent black on frame one).
- Time/media/io-driven ops are flagged `alwaysCook`; everything live recooks each frame at v1 scale (static-chain caching is a listed optimization — the memo field already exists).

## GPU backends

| | WebGL2 (`gpu/webgl2`) | WebGPU (`gpu/webgpu`) |
|---|---|---|
| Status | complete for all 18 TOPs | pilot ops (constant, ramp, level); parity = M7 |
| Pass | fullscreen triangle, per-shader program cache, uniform location cache | shared explicit bind-group layout; globals UBO @0, op uniforms @1 (256-aligned), sampler @2, textures @3+ |
| Uniform rule | direct `uniform float/vecN` by name | sorted-by-name, one `vec4f` per uniform (scalar→x, vec2→xy) — linted by test |
| Thumbnails | sync `readPixels` | deferred (async readback) — M7 |
| Known gap | — | blit has no aspect-fit letterbox yet |

Backend negotiation: WebGL2 default; `?backend=webgpu` opts in; graceful fallback on init failure. When WGSL coverage reaches parity, preference flips for capable projects.

## Editor

Framework-free DOM: node boxes over an SVG wire layer, CSS-transform pan/zoom, palette (Tab/double-click), per-param expression toggle, viewer hosting the engine's canvas (TOP blit / CHOP scope / DAT text), thumbnails via 6 Hz readback. Exported as `mountEditor(el, opts)` — embeddable in other sites (education platforms, portfolio pages) without a build-tool dependency on the host.

## TouchDesigner import

`toeexpand` text expansion → parser (`.n` graph grammar, `.parm` modes 0/16/17, `.text` payloads, nested dirs) → conservative translation tables (types, params, menu tokens, color component gathering) → TD-Python expression translation (validated by dry-run; untranslatable expressions kept inert as `tdExpr`) → family stubs for everything unmapped → `ImportReport` shown to the user. v1 limitations (by design, reported honestly): same-network wires only, no In/Out tunneling, media paths become placeholders.

## Decisions log

- **WebGL2 floor + WebGPU ceiling** (compute is the future particle path) — hence the pass contract.
- **Hand-written dual shader sources, no transpiler** — auditability and IP cleanliness over DRY; enforced by a contract test.
- **DOM+SVG editor over canvas-drawn** — hit-testing/text for free; fine to a few hundred visible nodes; a canvas renderer can swap in behind the same NetworkView API.
- **Expressions are real JS against a fixed scope** — a patching tool's trust model, not a security boundary; imported Python never executes.
- **Zero runtime dependencies** — longevity, embedding, and model-handoff friendliness.
- **toeexpand exits nonzero even on success** — the CLI verifies the output directory instead of the exit code.
- **TD type tokens differ from UI names** (e.g. Composite TOP = `comp`) — extend `TYPE_MAP` from real-world import report histograms.
