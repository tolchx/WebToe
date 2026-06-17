# WebToe Import Report: Toe_Expand Project Conversion

Source: [Touchdesigner_MCP]/old/mcp_td_v3/Toe_Expand/Toe_Expand
Destination: [WebToe]/apps/web/public/examples

## Imported Projects

| # | Project | Nodes | Wires | Families | Types | Size |
|---|---------|-------|-------|----------|-------|------|
| 3 | SolidGeometrySketches_30770 | 1907 | 1341 | CHOP, COMP, DAT, MAT, POP, SOP, TOP | 165 types | 1375.5 KB |
| 4 | JPOPsDev | 1734 | 974 | CHOP, COMP, DAT, MAT, POP, SOP, TOP | 162 types | 1522.7 KB |

**Totals: 3641 nodes, 2315 wires across 5 projects**

## Family Coverage

Nodes per family across all projects:

- CHOP: 204
- COMP: 661
- DAT: 348
- MAT: 95
- POP: 1230
- SOP: 815
- TOP: 288

## Type Coverage (Top 30 by count)

| Type | Count |
|------|-------|
| comp:annotate | 181 |
| sop:merge | 146 |
| sop:line | 132 |
| dat:text | 125 |
| sop:circle | 120 |
| comp:base | 111 |
| pop:primitive | 106 |
| comp:geo | 96 |
| sop:transform | 96 |
| comp:null | 88 |
| pop:in | 86 |
| pop:out | 84 |
| sop:switch | 74 |
| pop:noise | 74 |
| dat:info | 53 |
| dat:table | 51 |
| pop:null | 51 |
| sop:filein | 50 |
| pop:math | 47 |
| pop:transform | 46 |
| pop:attribute | 46 |
| comp:container | 45 |
| pop:mathmix | 44 |
| pop:glsl | 42 |
| pop:line | 40 |
| dat:panelexec | 35 |
| comp:cam | 34 |
| top:null | 34 |
| top:render | 34 |
| pop:merge | 33 |

## Notes

- Parameters are stubbed with default values from .parm files where available
- Wire connections derived from .network files and inputs in .n files
- Container hierarchy is flattened — all nodes are root-level with fully qualified names
- Text/script content (DAT, GLSL) is referenced but not fully embedded
- Complex COMP containers treated as flat node entries
- Some file paths may have had their `.toe.dir` at slightly different nest levels