import { VERSION } from '@webtoe/core';

const app = document.getElementById('app')!;
app.innerHTML = `<div style="font: 14px ui-monospace, monospace; color: #ddd; background: #17171b; min-height: 100vh; display: grid; place-items: center; margin: 0;">
  <div>WebToe v${VERSION} — M0 scaffold. Engine lands in M1/M2 (see PLAN.md).</div>
</div>`;
document.body.style.margin = '0';
