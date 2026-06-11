/** Editor styles, injected once — keeps the editor embeddable with no CSS pipeline.
 *  Tech/cyber aesthetic: dark glass, glow accents, family-colored accents. */

export const FAMILY_COLORS: Record<string, string> = {
  TOP: '#7c6cff',
  CHOP: '#10b981',
  COMP: '#8a8a93',
  DAT: '#ec4899',
  SOP: '#3b82f6',
  MAT: '#eab308',
};

const CSS = `
/* ── Root ───────────────────────────────────────────────────── */
.wt-root {
  position: relative; width: 100%; height: 100%;
  display: grid;
  grid-template-rows: 42px 1fr;
  grid-template-columns: 1fr 380px;
  grid-template-areas: "bar bar" "net side";
  background: #0b0b0e;
  color: #d6d6dc;
  overflow: hidden;
  font: 13px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif;
}
.wt-root *, .wt-root *::before, .wt-root *::after { box-sizing: border-box; }

/* ── Toolbar ────────────────────────────────────────────────── */
.wt-bar {
  grid-area: bar;
  display: flex; align-items: center; gap: 6px;
  padding: 0 12px;
  background: linear-gradient(180deg, #131317 0%, #0f0f13 100%);
  border-bottom: 1px solid #1e1e28;
  z-index: 30;
}
.wt-bar .wt-title {
  font-weight: 700; letter-spacing: 0.6px;
  color: #fff;
  margin-right: 6px;
  background: linear-gradient(135deg, #8b7cff 0%, #7c6cff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.wt-bar input.wt-projname {
  background: #18181e;
  border: 1px solid #28283a;
  color: #d6d6dc;
  border-radius: 6px;
  padding: 4px 10px;
  width: 160px;
  font-size: 12px;
  transition: border-color 0.2s;
}
.wt-bar input.wt-projname:focus {
  border-color: #7c6cff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(124,108,255,0.2);
}
.wt-bar button, .wt-bar select, .wt-bar label.wt-filebtn {
  background: #1a1a22;
  color: #c8c8d0;
  border: 1px solid #2a2a3a;
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  transition: all 0.15s;
}
.wt-bar button:hover, .wt-bar label.wt-filebtn:hover {
  background: #24243a;
  border-color: #4a4a6a;
  color: #fff;
}
.wt-bar .wt-spacer { flex: 1; }
.wt-bar .wt-hud {
  color: #6a6a7a;
  font-family: ui-monospace, monospace;
  font-size: 11px;
}
.wt-bar a.wt-repo {
  color: #6a6a7a;
  display: inline-flex;
  align-items: center;
  padding: 4px;
  border-radius: 5px;
  transition: all 0.15s;
}
.wt-bar a.wt-repo:hover { color: #fff; background: #1e1e28; }

/* ── Network grid ────────────────────────────────────────────── */
.wt-net {
  grid-area: net;
  position: relative;
  overflow: hidden;
  outline: none;
  background:
    radial-gradient(circle at 1px 1px, #1c1c26 1px, transparent 1.5px) 0 0 / 24px 24px,
    #0d0d12;
}
.wt-crumb {
  position: absolute; left: 12px; top: 10px;
  z-index: 20;
  color: #6a6a7a;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  user-select: none;
  letter-spacing: 0.2px;
}
.wt-crumb span { cursor: pointer; transition: color 0.15s; }
.wt-crumb span:hover { color: #fff; }
.wt-hint {
  position: absolute; right: 12px; top: 10px;
  z-index: 20;
  color: #4a4a5a;
  font-size: 11px;
  user-select: none;
}

/* ── World transform ─────────────────────────────────────────── */
.wt-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.wt-wires { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.wt-wires path {
  fill: none;
  stroke: #5a5a6a;
  stroke-width: 1.5;
  opacity: 0.7;
  transition: stroke 0.2s;
}
.wt-wires path.wt-preview {
  stroke: #f59e0b;
  stroke-dasharray: 5 4;
  opacity: 0.9;
}

/* ── Node cards ──────────────────────────────────────────────── */
.wt-node {
  position: absolute;
  width: 138px;
  background: linear-gradient(180deg, #1a1a24 0%, #14141e 100%);
  border: 1px solid #2a2a3e;
  border-radius: 8px;
  user-select: none;
  cursor: grab;
  transition: border-color 0.15s, box-shadow 0.15s;
  backdrop-filter: blur(4px);
}
.wt-node:hover {
  border-color: #3a3a5a;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.wt-node.wt-selected {
  border-color: #f59e0b;
  box-shadow: 0 0 0 1px #f59e0b, 0 2px 16px rgba(245,158,11,0.15);
}
.wt-node .wt-fam {
  position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  border-radius: 8px 0 0 8px;
}
.wt-node .wt-thumb {
  margin: 5px 6px 0 10px;
  height: 60px;
  background: #0a0a10;
  border-radius: 4px;
  overflow: hidden;
  display: none;
}
.wt-node.wt-has-thumb .wt-thumb { display: block; }
.wt-compositor {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 5;
}
.wt-node .wt-label {
  padding: 5px 8px 1px 11px;
  font-weight: 600;
  color: #e8e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  letter-spacing: 0.1px;
}
.wt-node .wt-typ {
  padding: 0 8px 6px 11px;
  color: #6a6a7a;
  font-size: 10px;
  font-family: ui-monospace, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.2px;
}
.wt-node .wt-err {
  position: absolute; right: 6px; top: 5px;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #ef4444;
  display: none;
  box-shadow: 0 0 6px rgba(239,68,68,0.6);
}
.wt-node.wt-haserr .wt-err { display: block; }
.wt-node .wt-flag {
  position: absolute; right: 6px; bottom: 6px;
  width: 9px; height: 9px;
  border-radius: 50%;
  border: 1.5px solid #4a4a5a;
  transition: all 0.15s;
}
.wt-node.wt-display .wt-flag {
  background: #f59e0b;
  border-color: #f59e0b;
  box-shadow: 0 0 6px rgba(245,158,11,0.5);
}

/* ── Stubs ───────────────────────────────────────────────────── */
.wt-stub {
  position: absolute;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #3a3a4a;
  border: 2px solid #0d0d12;
  cursor: crosshair;
  z-index: 5;
  transition: all 0.15s;
}
.wt-stub:hover {
  background: #7c6cff;
  box-shadow: 0 0 8px rgba(124,108,255,0.5);
  transform: scale(1.25);
}
.wt-stub.wt-out { right: -6px; top: 50%; margin-top: -5px; }
.wt-stub.wt-in { left: -6px; }

/* ── Side panel ──────────────────────────────────────────────── */
.wt-side {
  grid-area: side;
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
  border-left: 1px solid #1a1a28;
  background: #0e0e14;
}

/* ── Viewer ──────────────────────────────────────────────────── */
.wt-viewer {
  position: relative;
  background: #08080c;
  aspect-ratio: 16/9;
  border-bottom: 1px solid #1e1e28;
}
.wt-viewer canvas.wt-gl {
  position: absolute; inset: 0; width: 100%; height: 100%;
}
.wt-viewer canvas.wt-scope {
  position: absolute; inset: 0; width: 100%; height: 100%;
}
.wt-viewer pre.wt-dattext {
  position: absolute; inset: 0;
  margin: 0;
  padding: 12px;
  overflow: auto;
  font: 11px/1.5 ui-monospace, monospace;
  color: #a3e635;
}
.wt-viewer .wt-viewname {
  position: absolute;
  left: 10px; bottom: 8px;
  color: #6a6a7a;
  font: 10px ui-monospace, monospace;
  pointer-events: none;
  letter-spacing: 0.3px;
}

/* ── PARAMETER PANEL (Improved) ──────────────────────────────── */
.wt-params {
  overflow-y: auto;
  min-height: 0;
  padding-bottom: 20px;
}
/* Custom scrollbar for param panel */
.wt-params::-webkit-scrollbar { width: 5px; }
.wt-params::-webkit-scrollbar-track { background: transparent; }
.wt-params::-webkit-scrollbar-thumb {
  background: #2a2a38;
  border-radius: 3px;
}
.wt-params::-webkit-scrollbar-thumb:hover { background: #3a3a4a; }

/* Header */
.wt-params .wt-phead {
  padding: 10px 14px 8px;
  border-bottom: 1px solid #1e1e28;
  display: flex;
  align-items: center;
  gap: 8px;
  position: sticky;
  top: 0;
  background: linear-gradient(180deg, rgba(14,14,20,0.98) 0%, rgba(14,14,20,0.95) 100%);
  backdrop-filter: blur(8px);
  z-index: 2;
}
.wt-params .wt-phead .wt-pname {
  font-weight: 700;
  color: #e8e8f0;
  font-size: 14px;
  letter-spacing: 0.2px;
}
.wt-params .wt-phead .wt-ptype {
  color: #6a6a7a;
  font-size: 10px;
  font-family: ui-monospace, monospace;
  background: #181822;
  padding: 2px 6px;
  border-radius: 4px;
}
.wt-params .wt-phead .wt-perr {
  color: #ef4444;
  font-size: 11px;
  margin-left: auto;
  max-width: 170px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Page separator */
.wt-ppage {
  padding: 10px 14px 4px;
  color: #5a5a6a;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  border-top: 1px solid #181822;
  margin-top: 8px;
  font-weight: 600;
}

/* Parameter row */
.wt-prow {
  display: grid;
  grid-template-columns: 90px 1fr 26px;
  gap: 6px;
  align-items: center;
  padding: 5px 14px;
  min-height: 30px;
  transition: background 0.1s;
}
.wt-prow:hover { background: #15151e; }
.wt-prow .wt-plabel {
  color: #b0b0ba;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s;
}
.wt-prow:hover .wt-plabel { color: #d6d6dc; }

/* Generic inputs */
.wt-prow input[type="text"],
.wt-prow input[type="number"],
.wt-prow select {
  width: 100%;
  background: #16161e;
  border: 1px solid #242434;
  color: #d6d6dc;
  border-radius: 5px;
  padding: 3px 7px;
  font: 11px ui-monospace, monospace;
  transition: border-color 0.15s;
}
.wt-prow input[type="text"]:focus,
.wt-prow input[type="number"]:focus,
.wt-prow select:focus {
  border-color: #7c6cff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(124,108,255,0.15);
}
.wt-prow input.wt-exprfield {
  color: #f59e0b;
  font-weight: 500;
}
.wt-prow input.wt-exprfield.wt-badexpr {
  color: #ef4444;
  border-color: rgba(239,68,68,0.4);
}

/* Slider row */
.wt-prow .wt-sliderwrap {
  display: flex;
  gap: 6px;
  align-items: center;
}
.wt-prow input[type="range"] {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  background: linear-gradient(90deg, #2a2a3e, #4a4a6a);
  border-radius: 2px;
  outline: none;
  transition: background 0.2s;
}
.wt-prow input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #7c6cff, #5a4aee);
  cursor: pointer;
  border: 2px solid #1a1a24;
  box-shadow: 0 0 6px rgba(124,108,255,0.3);
  transition: all 0.12s;
}
.wt-prow input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 0 12px rgba(124,108,255,0.5);
}
.wt-prow input[type="range"]::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #7c6cff;
  cursor: pointer;
  border: 2px solid #1a1a24;
}
.wt-prow input.wt-num {
  width: 60px;
  flex: none;
  text-align: right;
}

/* Expression button */
.wt-prow .wt-exprbtn {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: 1px solid #242434;
  background: #16161e;
  color: #6a6a7a;
  cursor: pointer;
  font: 11px ui-monospace, monospace;
  transition: all 0.12s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wt-prow .wt-exprbtn:hover {
  border-color: #4a4a6a;
  color: #b0b0ba;
}
.wt-prow .wt-exprbtn.wt-on {
  color: #f59e0b;
  border-color: rgba(245,158,11,0.5);
  box-shadow: 0 0 6px rgba(245,158,11,0.15);
}

/* Color row */
.wt-prow .wt-colorrow {
  display: flex;
  gap: 3px;
}
.wt-prow .wt-colorrow input[type="number"] {
  flex: 1;
  min-width: 36px;
  padding: 3px 4px;
  text-align: center;
  font-size: 10px;
}
.wt-prow .wt-swatch {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #242434;
  flex: none;
  box-shadow: inset 0 0 4px rgba(0,0,0,0.3);
}

/* Toggle */
.wt-prow input[type="checkbox"] {
  -webkit-appearance: none;
  appearance: none;
  width: 30px;
  height: 16px;
  border-radius: 10px;
  background: #1e1e2a;
  border: 1px solid #2e2e40;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}
.wt-prow input[type="checkbox"]::after {
  content: '';
  position: absolute;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #4a4a5a;
  top: 1px;
  left: 1px;
  transition: all 0.2s;
}
.wt-prow input[type="checkbox"]:checked {
  background: rgba(124,108,255,0.3);
  border-color: #7c6cff;
}
.wt-prow input[type="checkbox"]:checked::after {
  left: 15px;
  background: #7c6cff;
  box-shadow: 0 0 6px rgba(124,108,255,0.5);
}

/* ── Palette ─────────────────────────────────────────────────── */
.wt-palette {
  position: absolute;
  z-index: 50;
  width: 560px;
  max-height: 420px;
  background: linear-gradient(180deg, #181820 0%, #12121a 100%);
  border: 1px solid #2a2a3e;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(8px);
}
.wt-palette .wt-phead2 {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 6px;
}
.wt-palette .wt-ptitle {
  color: #6a6a7a;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
}
.wt-palette input {
  flex: 1;
  padding: 7px 10px;
  background: #0d0d14;
  color: #e8e8f0;
  border: 1px solid #242434;
  border-radius: 7px;
  font: inherit;
  font-size: 13px;
  transition: border-color 0.2s;
}
.wt-palette input:focus {
  border-color: #7c6cff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(124,108,255,0.15);
}
.wt-palette .wt-ptabs {
  display: flex;
  gap: 2px;
  padding: 8px 14px 0;
  border-bottom: 1px solid #1e1e28;
}
.wt-palette .wt-ptabs button {
  background: transparent;
  color: #6a6a7a;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 5px 16px 8px;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  letter-spacing: 0.4px;
  font-size: 12px;
  transition: all 0.15s;
}
.wt-palette .wt-ptabs button:hover { color: #c8c8d0; }
.wt-palette .wt-ptabs button.wt-on {
  color: #fff;
  border-bottom-color: var(--fam, #7c6cff);
}
.wt-palette .wt-pgrid {
  overflow-y: auto;
  padding: 8px 10px 14px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px 8px;
  align-content: start;
}
.wt-palette .wt-pitem {
  padding: 6px 10px;
  cursor: pointer;
  display: flex;
  gap: 8px;
  align-items: center;
  border-radius: 6px;
  min-width: 0;
  transition: all 0.1s;
}
.wt-palette .wt-pitem span:nth-child(2) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}
.wt-palette .wt-pitem .wt-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}
.wt-palette .wt-pitem .wt-pfam {
  margin-left: auto;
  color: #5a5a6a;
  font-size: 9px;
  font-family: ui-monospace, monospace;
}
.wt-palette .wt-pitem.wt-active,
.wt-palette .wt-pitem:hover {
  background: #1e1e2e;
}

/* ── Toast ────────────────────────────────────────────────────── */
.wt-toast {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  background: rgba(22,22,30,0.95);
  border: 1px solid #2a2a3e;
  color: #d6d6dc;
  padding: 8px 16px;
  border-radius: 8px;
  z-index: 60;
  font-size: 12px;
  max-width: 70%;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
`;

let injected = false;

export function injectStyles(): void {
  if (injected) return;
  const el = document.createElement('style');
  el.dataset.webtoe = 'editor';
  el.textContent = CSS;
  document.head.appendChild(el);
  injected = true;
}
