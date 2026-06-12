/** Editor styles — TD-inspired: flat, dark, compact, minimal. */

export const FAMILY_COLORS: Record<string, string> = {
  TOP: '#8b6cf7',
  CHOP: '#3bc48a',
  COMP: '#8a8a96',
  DAT: '#d4739e',
  SOP: '#5a8ec9',
  MAT: '#d4a84a',
};

const F = (h: string) => `var(--${h})`;

const CSS = `
.wt-root {
  position: relative; width: 100%; height: 100%;
  display: grid;
  grid-template-rows: 36px 1fr 24px;
  grid-template-columns: 1fr 340px;
  grid-template-areas: "bar bar" "net side" "ftr ftr";
  background: #141418;
  color: #c8c8d0;
  overflow: hidden;
  font: 12px/1.45 -apple-system, "Segoe UI", system-ui, sans-serif;
}
.wt-root *, .wt-root *::before, .wt-root *::after { box-sizing: border-box; }

/* ── Toolbar ────────────────────────────────────────────────── */
.wt-bar {
  grid-area: bar; display: flex; align-items: center; gap: 6px; padding: 0 10px;
  background: #1c1c22; border-bottom: 1px solid #2a2a30; z-index: 30;
}
.wt-bar .wt-title { font-weight: 700; color: #ddd; margin-right: 4px; }
.wt-bar input.wt-projname { background:#22222a; border:1px solid #333; color:#ccc;
  border-radius:3px; padding:2px 7px; width:140px; font-size:11px; }
.wt-bar input.wt-projname:focus { border-color:#8b6cf7; outline:none; }
.wt-bar button, .wt-bar select, .wt-bar label.wt-filebtn { background:#22222a; color:#bbb;
  border:1px solid #333; border-radius:3px; padding:3px 9px; cursor:pointer; font:inherit; font-size:11px; }
.wt-bar button:hover, .wt-bar label.wt-filebtn:hover { background:#2a2a34; color:#eee; }
.wt-bar .wt-spacer { flex:1; }
.wt-bar .wt-hud { color:#666; font-family:ui-monospace,monospace; font-size:10px; }
.wt-bar a.wt-repo { color:#666; display:inline-flex; align-items:center; padding:3px; border-radius:3px; }
.wt-bar a.wt-repo:hover { color:#ddd; background:#2a2a34; }

/* ── Network ─────────────────────────────────────────────────── */
.wt-net {
  grid-area: net; position: relative; overflow: hidden; outline: none;
  touch-action: none; /* prevent browser scroll/zoom on touch for smooth drag */
  background:
    radial-gradient(circle at 1px 1px, #22222a 1px, transparent 1px) 0 0 / 20px 20px,
    #141418;
}
.wt-crumb { position:absolute; left:10px; top:8px; z-index:20; color:#666;
  font-family:ui-monospace,monospace; font-size:11px; user-select:none; }
.wt-crumb span { cursor:pointer; }
.wt-crumb span:hover { color:#fff; }
.wt-hint { position:absolute; right:10px; top:8px; z-index:20; color:#444; font-size:10px; user-select:none; }

.wt-world { position:absolute; left:0; top:0; transform-origin:0 0; }
.wt-wires { position:absolute; left:0; top:0; overflow:visible; pointer-events:none; }
.wt-wires path { fill:none; stroke-width:1.2; opacity:.6; transition:opacity .15s; }
.wt-wires path:hover { opacity:1; }
.wt-wires path.wt-preview { stroke-dasharray:4 3; opacity:.8; }

/* ── Nodes ───────────────────────────────────────────────────── */
.wt-node {
  position:absolute; width:124px;
  background:#1c1c22; border:1px solid #333338;
  border-radius:4px; user-select:none; cursor:grab; transition:border-color .1s;
}
.wt-node:hover { border-color:#555; }
.wt-node.wt-selected { border-color:#f5b342; box-shadow:0 0 0 1px #f5b342; }
.wt-node .wt-fam {
  position:absolute; left:0; top:0; bottom:0; width:3px;
  border-radius:4px 0 0 4px;
}
.wt-node .wt-fam.wt-fam-gen { filter: brightness(.55); }
.wt-selrect { position:absolute; border:1px solid #5a8ec9; background:rgba(90,142,201,0.12); z-index:20; pointer-events:none; }
.wt-node .wt-thumb { margin:4px 5px 0 9px;
  border-radius:3px; overflow:hidden; display:none; position:relative; }
.wt-node.wt-has-thumb .wt-thumb { display:block; }
.wt-node .wt-thumb-init {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font:bold 14px ui-monospace,sans-serif; color:#444; letter-spacing:1px;
}
.wt-compositor { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:5; }
.wt-node .wt-label { padding:4px 7px 0 10px; font-weight:600; color:#e0e0e8;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11px; }
.wt-node .wt-typ { padding:1px 7px 5px 10px; color:#666; font-size:10px;
  font-family:ui-monospace,monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wt-node .wt-err { position:absolute; right:5px; top:4px; width:7px; height:7px;
  border-radius:50%; background:#e04040; display:none; }
.wt-node.wt-haserr .wt-err { display:block; }
.wt-node .wt-flag { position:absolute; right:5px; bottom:5px; width:8px; height:8px;
  border-radius:50%; border:1.5px solid #555; }
.wt-node.wt-display .wt-flag { background:#f5b342; border-color:#f5b342; }

/* Gear icon for opening params (visible on selected node) */
.wt-gear {
  position:absolute; right:6px; top:-10px;
  font-size:13px; cursor:pointer; opacity:0;
  transition:opacity .15s; z-index:15; width:20px; height:20px;
  display:flex; align-items:center; justify-content:center;
  border-radius:50%; background:#1c1c22; border:1px solid #333;
  color:#999; line-height:1;
}
.wt-selected .wt-gear { opacity:0; pointer-events:none; }
.wt-bypassed { opacity:.45; filter:grayscale(.6); }

/* Floating action bar above nodes (long-press) */
.wt-actbar {
  position:fixed; z-index:50; display:flex; gap:4px; padding:4px 6px;
  background:#1c1c22; border:1px solid #333; border-radius:8px;
  box-shadow:0 4px 20px rgba(0,0,0,.6);
  transform:translate(-50%,-100%);
}
.wt-actbar button {
  width:36px; height:36px; border-radius:50%; border:1px solid #333;
  background:#24242c; color:#aaa; cursor:pointer; font-size:13px;
  display:flex; align-items:center; justify-content:center;
  transition:all .1s; touch-action:none;
}
.wt-actbar button.wt-act-hover { background:#33334a; border-color:#5a8ec9; color:#fff; transform:scale(1.15); }
.wt-actbar button:active { background:#44445a; }

/* ── Stubs ───────────────────────────────────────────────────── */
.wt-stub { position:absolute; width:9px; height:9px; border-radius:50%;
  background:#444; border:2px solid #141418; cursor:crosshair; z-index:5;
  transition:background .1s; }
.wt-stub:hover { background:#8b6cf7; }
.wt-stub.wt-out { right:-5px; top:50%; margin-top:-5px; }
.wt-stub.wt-in { left:-5px; }

/* ── Side ────────────────────────────────────────────────────── */
.wt-side { grid-area:side; display:grid; grid-template-columns:1fr 4px 1fr; grid-template-rows:1fr;
  min-height:0; border-left:1px solid #2a2a30; background:#18181e; }

/* ── Viewer ──────────────────────────────────────────────────── */
.wt-viewer { position:relative; background:#0e0e12; border-bottom:1px solid #2a2a30;
  overflow:hidden; min-height:0; display:flex; align-items:center; justify-content:center; }
.wt-viewer canvas.wt-gl { display:none; }
.wt-viewer canvas.wt-scope { display:block; flex:none; max-width:100%; max-height:100%; }
.wt-viewer pre.wt-dattext { position:absolute; inset:0; margin:0; padding:10px;
  overflow:auto; font:10px/1.4 ui-monospace,monospace; color:#aadd44; }
.wt-viewer .wt-viewname { position:absolute; left:8px; bottom:6px; color:#666;
  font:10px ui-monospace,monospace; pointer-events:none; }

/* Aspect ratio selector */
.wt-ratio {
  position:absolute; right:8px; bottom:4px; z-index:12;
  background:rgba(20,20,24,0.8); border:1px solid #333; color:#999;
  border-radius:3px; padding:0 4px; font:9px ui-monospace,monospace; cursor:pointer;
  opacity:0.6; transition:opacity .15s; max-width:50px;
}
.wt-ratio:hover { opacity:1; color:#ddd; }

/* Viewer/params splitter */
.wt-splitter {
  width:4px; cursor:ew-resize; background:#22222a;
  border-left:1px solid #2a2a30; border-right:1px solid #2a2a30;
  flex:none; transition:background .1s;
  position:relative; z-index:3; touch-action:none;
}
.wt-splitter:hover { background:#33333e; }
.wt-splitter::after {
  content:''; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  height:24px; width:2px; border-radius:1px; background:#555;
}

/* ── Params ──────────────────────────────────────────────────── */
.wt-params { overflow-y:auto; min-height:0; padding-bottom:10px; flex:1; }
.wt-params::-webkit-scrollbar { width:4px; }
.wt-params::-webkit-scrollbar-track { background:transparent; }
.wt-params::-webkit-scrollbar-thumb { background:#2a2a34; border-radius:2px; }

.wt-params .wt-phead { padding:8px 12px 6px; border-bottom:1px solid #2a2a30;
  display:flex; align-items:center; gap:6px; position:sticky; top:0; background:#18181e; z-index:2; }
.wt-params .wt-phead .wt-pname { font-weight:700; color:#e0e0e8; font-size:13px; }
.wt-params .wt-phead .wt-ptype { color:#666; font-size:10px;
  font-family:ui-monospace,monospace; background:#1e1e26; padding:1px 5px; border-radius:3px; }
.wt-params .wt-phead .wt-perr { color:#e04040; font-size:11px; margin-left:auto;
  max-width:160px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* Page header — collapsible */
.wt-ppage {
  padding:7px 12px 3px; color:#555; font-size:9px; text-transform:uppercase;
  letter-spacing:1.2px; border-top:1px solid #22222a; margin-top:6px;
  cursor:pointer; user-select:none; position:relative; font-weight:600;
  transition:color .1s;
}
.wt-ppage:hover { color:#aaa; }
.wt-ppage::before { content:'▾ '; font-size:7px; }
.wt-ppage.wt-collapsed::before { content:'▸ '; }
.wt-ppage.wt-collapsed + .wt-pbody { display:none; }

.wt-prow {
  display:grid; grid-template-columns:84px 1fr 22px; gap:4px;
  align-items:center; padding:3px 12px; min-height:24px;
  transition:background .08s;
}
.wt-prow:hover { background:#1e1e28; }
.wt-prow .wt-plabel { color:#999; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wt-prow input[type="text"], .wt-prow input[type="number"], .wt-prow select {
  width:100%; background:#1e1e26; border:1px solid #2a2a34; color:#ccc;
  border-radius:3px; padding:2px 5px; font:11px ui-monospace,monospace;
  transition:border-color .1s;
}
.wt-prow input[type="text"]:focus, .wt-prow input[type="number"]:focus, .wt-prow select:focus {
  border-color:#8b6cf7; outline:none;
}
.wt-prow input.wt-exprfield { color:#f5b342; font-weight:500; }
.wt-prow input.wt-exprfield.wt-badexpr { color:#e04040; border-color:rgba(224,64,64,.4); }

/* Slider */
.wt-prow .wt-sliderwrap { display:flex; gap:4px; align-items:center; }
.wt-prow input[type="range"] {
  flex:1; -webkit-appearance:none; appearance:none; height:2px;
  background:#2a2a34; border-radius:1px; outline:none;
}
.wt-prow input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance:none; appearance:none;
  width:11px; height:11px; border-radius:50%;
  background:#888; cursor:pointer; border:1px solid #555;
  transition:background .1s;
}
.wt-prow input[type="range"]::-webkit-slider-thumb:hover { background:#aaa; }
.wt-prow input[type="range"]::-moz-range-thumb {
  width:11px; height:11px; border-radius:50%;
  background:#888; cursor:pointer; border:1px solid #555;
}
.wt-prow input.wt-num { width:52px; flex:none; text-align:right; }

/* Expression btn */
.wt-prow .wt-exprbtn { width:20px; height:20px; border-radius:3px;
  border:1px solid #2a2a34; background:#1e1e26; color:#666; cursor:pointer;
  font:10px ui-monospace,monospace; transition:all .1s;
  display:flex; align-items:center; justify-content:center;
}
.wt-prow .wt-exprbtn:hover { border-color:#444; color:#999; }
.wt-prow .wt-exprbtn.wt-on { color:#f5b342; border-color:rgba(245,179,66,.4); }

/* Color */
.wt-prow .wt-colorrow { display:flex; gap:2px; }
.wt-prow .wt-colorrow input[type="number"] { flex:1; min-width:30px; padding:2px 3px; text-align:center; font-size:9px; }
.wt-prow .wt-swatch { width:18px; height:18px; border-radius:3px; border:1px solid #2a2a34; flex:none; }

/* Toggle — minimal square */
.wt-prow input[type="checkbox"] {
  -webkit-appearance:none; appearance:none;
  width:14px; height:14px; border-radius:2px;
  background:#1e1e26; border:1px solid #2a2a34;
  cursor:pointer; position:relative;
  transition:all .12s;
}
.wt-prow input[type="checkbox"]:checked {
  background:#8b6cf7; border-color:#8b6cf7;
}
.wt-prow input[type="checkbox"]:checked::after {
  content:''; position:absolute;
  left:4px; top:1px; width:4px; height:8px;
  border:solid #fff; border-width:0 2px 2px 0;
  transform:rotate(45deg);
}

/* ── Palette ─────────────────────────────────────────────────── */
.wt-palette { position:absolute; z-index:50; width:520px; max-height:380px;
  background:#1c1c22; border:1px solid #333; border-radius:6px;
  box-shadow:0 8px 24px rgba(0,0,0,.5); display:flex; flex-direction:column; overflow:hidden; }
.wt-palette .wt-phead2 { display:flex; align-items:center; gap:8px; padding:8px 12px 4px; }
.wt-palette .wt-ptitle { color:#666; font-size:10px; text-transform:uppercase; letter-spacing:1px; }
.wt-palette input { flex:1; padding:5px 8px; background:#141418; color:#ddd;
  border:1px solid #2a2a34; border-radius:4px; font:inherit; font-size:12px; }
.wt-palette input:focus { border-color:#8b6cf7; outline:none; }
.wt-palette .wt-ptabs { display:flex; gap:1px; padding:5px 12px 0; border-bottom:1px solid #2a2a30; }
.wt-palette .wt-ptabs button { background:transparent; color:#666; border:none;
  border-bottom:2px solid transparent; padding:4px 14px 6px; cursor:pointer;
  font:inherit; font-weight:600; font-size:11px; transition:all .1s; }
.wt-palette .wt-ptabs button:hover { color:#aaa; }
.wt-palette .wt-ptabs button.wt-on { color:#ddd; border-bottom-color:${F('fam')}; }
.wt-palette .wt-pgrid { overflow-y:auto; padding:6px 8px 10px;
  display:grid; grid-template-columns:repeat(3,1fr); gap:1px 6px; align-content:start; }
.wt-palette .wt-pitem { padding:4px 8px; cursor:pointer; display:flex; gap:6px;
  align-items:center; border-radius:4px; min-width:0; font-size:11px; }
.wt-palette .wt-pitem span:nth-child(2) { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wt-palette .wt-pitem .wt-dot { width:6px; height:6px; border-radius:50%; flex:none; }
.wt-palette .wt-pitem .wt-pfam { margin-left:auto; color:#555; font-size:9px; font-family:ui-monospace,monospace; }
.wt-palette .wt-pitem .wt-pgenlabel { margin-left:auto; color:#555; font-size:9px; font-family:ui-monospace,monospace; }
.wt-palette .wt-pitem.wt-pgen { opacity:0.85; }
.wt-palette .wt-pitem.wt-active, .wt-palette .wt-pitem:hover { background:#22222a; }

/* ── Toast ────────────────────────────────────────────────────── */
.wt-toast { position:absolute; left:50%; bottom:32px; transform:translateX(-50%);
  background:#1c1c22; border:1px solid #333; color:#ccc; padding:6px 14px;
  border-radius:4px; z-index:60; font-size:11px; max-width:70%; }

/* Wire context menu */
.wt-wiremenu {
  position:fixed; z-index:100; background:#1c1c22; border:1px solid #333;
  border-radius:6px; padding:4px 0; min-width:160px;
  box-shadow:0 4px 16px rgba(0,0,0,.5);
}
.wt-wiremenu button {
  display:block; width:100%; background:none; border:none; color:#ccc;
  padding:7px 14px; font:12px -apple-system,sans-serif; text-align:left;
  cursor:pointer; transition:background .1s;
}
.wt-wiremenu button:hover { background:#2a2a36; }

/* Mobile: larger touch targets for context menus */
@media (max-width: 768px) {
  .wt-wiremenu { min-width: 180px; }
  .wt-wiremenu button { padding: 12px 16px; font-size: 14px; min-height: 44px; }
}

/* ── Status bar (footer) ─────────────────────────────────────── */
.wt-ftr {
  grid-area:ftr; display:flex; align-items:center; gap:12px;
  padding:0 10px; background:#141418; border-top:1px solid #2a2a30;
  font:9px ui-monospace,monospace; color:#555; z-index:30;
}
.wt-ftr .wt-fps { color:#888; }
.wt-ftr .wt-errs { color:#e04040; }
.wt-ftr .wt-errs:empty { display:none; }
.wt-ftr .wt-spacer2 { flex:1; }
.wt-ftr .wt-timing { color:#666; }
.wt-ftr .wt-nodecount { color:#666; }
.wt-ftr .wt-addop {
  background:none; border:1px solid #333; color:#888; border-radius:3px;
  cursor:pointer; font-size:13px; width:22px; height:20px;
  display:flex; align-items:center; justify-content:center; padding:0; line-height:1;
  transition:color .1s, border-color .1s;
}
.wt-ftr .wt-addop:hover { color:#ddd; border-color:#666; }

/* ── Dark mode por preferencia del sistema ──────────────────────── */
@media (prefers-color-scheme: light) {
  .wt-root, .wt-params, .wt-side, .wt-ftr { color-scheme: dark; }
}

/* ── RESPONSIVE ─────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .wt-root {
    grid-template-columns: 1fr;
    grid-template-rows: 40px auto 1fr 28px;
    grid-template-areas: "bar" "side" "net" "ftr";
    touch-action: manipulation; /* prevent browser double-tap zoom */
  }
  .wt-side { border-left: none; border-bottom: 2px solid #2a2a30; max-height: 45vh;
    grid-template-columns: 1fr; grid-template-rows: auto 4px 1fr; }
  .wt-side .wt-viewer, .wt-side .wt-splitter, .wt-side .wt-params { grid-row:auto; grid-column:auto; }
  .wt-side .wt-splitter { width:auto; height:4px; cursor:ns-resize; border-left:none; border-right:none; border-top:1px solid #2a2a30; border-bottom:1px solid #2a2a30; }
  .wt-viewer { height: 180px; overflow:hidden; border-bottom:none; }
  .wt-params { font-size: 11px; }
  .wt-node { width: 110px; }
  .wt-node .wt-label { font-size: 10px; padding: 3px 6px 0 8px; }
  .wt-node .wt-typ { font-size: 8px; padding: 0 6px 4px 8px; }
  .wt-node .wt-thumb { height: 40px; margin: 3px 4px 0 7px; }
  /* Larger touch targets for param rows */
  .wt-prow { grid-template-columns: 70px 1fr 26px; gap: 4px; padding: 3px 6px; min-height: 32px; }
  .wt-prow .wt-plabel { font-size: 10px; }
  .wt-prow input[type="text"], .wt-prow input[type="number"], .wt-prow select { font-size: 11px; padding: 5px 6px; min-height: 30px; }
  .wt-prow input[type="range"] { height: 6px; min-height: 28px; }
  .wt-prow input[type="range"]::-webkit-slider-thumb { width: 20px; height: 20px; }
  .wt-prow input[type="range"]::-moz-range-thumb { width: 20px; height: 20px; }
  .wt-prow input.wt-num { width: 60px; font-size: 11px; }
  .wt-prow .wt-exprbtn { width: 26px; height: 26px; font-size: 12px; }
  .wt-prow input[type="checkbox"] { width: 22px; height: 22px; }
  .wt-bar .wt-hamburger { position:sticky; right:0; z-index:2; }
  .wt-bar .wt-hud, .wt-bar input.wt-projname { display: none; }
  /* Show only icons, hide text labels on mobile toolbar */
  .wt-bar .wt-bi { font-size: 14px; }
  .wt-bar .wt-bt { display: none; }
  .wt-bar button, .wt-bar select, .wt-bar label.wt-filebtn { padding: 5px 8px; font-size: 11px; min-height: 32px; min-width: 32px; justify-content: center; }
  /* Preserve examples select text */
  .wt-bar select .wt-bi { display: none; }
  .wt-bar select .wt-bt { display: inline; }
  .wt-bar .wt-title { font-size: 12px; }
  .wt-bar input.wt-projname { width: 80px; font-size: 10px; }
  .wt-ftr { font-size: 8px; gap: 8px; padding: 0 6px; }
  .wt-ftr .wt-addop { width: 28px; height: 26px; font-size: 16px; }
  .wt-palette { width: 92vw; max-height: 65vh; left: 4vw; }
  .wt-palette .wt-pgrid { grid-template-columns: repeat(2, 1fr); }
  .wt-palette .wt-pitem { padding: 8px 10px; min-height: 36px; }
  .wt-hint { display: none; }

  /* Mobile nav: +/-/home overlay */
  .wt-mobilenav {
    position: absolute; right: 8px; bottom: 8px; z-index: 25;
    display: flex; flex-direction: column; gap: 6px;
  }
  .wt-mobilenav button {
    width: 40px; height: 40px; border-radius: 50%;
    background: rgba(28,28,34,0.92); border: 1px solid #3a3a4a;
    color: #ccc; font-size: 20px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
  .wt-mobilenav button:active { background: #2a2a3e; }

  /* Fullscreen + back buttons on viewer */
  .wt-fsbtn, .wt-backbtn {
    position: absolute; z-index: 10;
    background: rgba(20,20,24,0.8); border: 1px solid #3a3a4a;
    color: #ccc; cursor: pointer; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; width: 36px; height: 36px;
    opacity: 0.7; transition: opacity .2s;
  }
  .wt-fsbtn:hover, .wt-backbtn:hover { opacity: 1; }
  .wt-fsbtn { right: 8px; top: 8px; }
  .wt-backbtn { left: 8px; top: 8px; font-size: 28px; }
}
@media (max-width: 480px) {
  .wt-root { grid-template-rows: 40px auto 1fr 24px; }
  .wt-side { max-height: 40vh; }
  .wt-viewer { height: 140px; }
  .wt-node { width: 94px; }
  .wt-node .wt-label { font-size: 9px; }
  .wt-prow input[type="text"], .wt-prow input[type="number"], .wt-prow select { font-size: 10px; padding: 4px 5px; }
}`;

let injected = false;

export function injectStyles(): void {
  if (injected) return;
  const el = document.createElement('style');
  el.dataset.webtoe = 'editor';
  el.textContent = CSS;
  document.head.appendChild(el);
  injected = true;
}
