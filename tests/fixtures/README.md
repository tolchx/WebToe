# Test fixtures — provenance

`tiny.toe` and `tiny.expanded/` are **100% original WebToe content**: the network
was authored by hand as expanded text for this repository (see the file list —
noise/level/comp chain, a `mirror1` op deliberately outside WebToe's mapped set,
an `inner1` COMP with in/out tunneling, parm modes 0/16/17 including TD-Python
expressions), then round-tripped through the official `toecollapse`/`toeexpand`
CLIs of a locally installed TouchDesigner build (2025.32460) so that the
committed bytes are genuine tool output in the genuine container format.

No Derivative sample content, palette components, or proprietary assets are
included — the binary container format is exercised, not their content.

Regenerate (requires a local TouchDesigner install):

```bash
# 1. edit the expanded text under a scratch dir + matching .toc list
# 2. toecollapse scratch/tiny.toe        (packs text → binary .toe)
# 3. toeexpand tiny.toe                  (canonical re-expansion)
# 4. copy tiny.toe + tiny.toe.dir → tests/fixtures/{tiny.toe, tiny.expanded}
```

Used by:
- `tests/toe-pipeline.test.ts` — CI-safe: imports `tiny.expanded/` through the
  real `toedirLoader` and asserts the full graph (types, wires, tunnels,
  expressions, stubs, report).
- `tests/toe-binary-local.test.ts` — integration (auto-skips when no local
  TouchDesigner): expands `tiny.toe` with the real `toeexpand` into a temp dir,
  asserts the expansion matches `tiny.expanded/`'s shape, runs the importer on
  it, and exercises `packages/cli/toe-convert.mjs` end-to-end.
