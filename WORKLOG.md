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

## NEXT

M2 — `packages/gpu` (GpuFacade impl: WebGL2 full + WebGPU detect/skeleton with pilot ops) + `packages/ops` TOP family per PLAN §7 (GLSL originals); wire a minimal boot in apps/web that renders 01-hello-noise headful; screenshot evidence; then commit M2.
