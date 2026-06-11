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

## NEXT

M1 — implement `packages/core` (types, node, graph, engine, expr incl. TD translation, registry, passes contract, serialize+migrations) + `packages/ops` chop family with vitest coverage per PLAN §6–§7; `npm run check` must pass.
