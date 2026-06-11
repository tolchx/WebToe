# WebToe

A web-native, node-based dataflow engine for real-time visuals — patch operators together in the browser, TouchDesigner-style, and import your existing TouchDesigner projects.

**Status: under active construction.** See [PLAN.md](PLAN.md) for the full implementation plan and [WORKLOG.md](WORKLOG.md) for live progress.

- Network editor (create, wire, edit parameters live) with a WebGL2 engine cooking the graph every frame
- TOP (texture) and CHOP (channel) operator families, expression-driven parameters
- Imports ordinary TouchDesigner projects via the official `toeexpand` text expansion produced by *your own* TD install — supported operators run, the rest become faithful stubs
- Own JSON project format with lossless save/load, plus bundled runnable examples
- Zero runtime dependencies; MIT licensed

Research foundation (file-format findings, feasibility analysis, sources): [docs/RESEARCH.md](docs/RESEARCH.md).

## Disclaimer

WebToe is an independent open-source project, **not affiliated with or endorsed by Derivative Inc.** TouchDesigner is a trademark of Derivative Inc. WebToe contains no Derivative code, binaries, or assets; it reads the text expansion of project files that users generate locally with their own licensed TouchDesigner installation, for interoperability.

## License

[MIT](LICENSE)
