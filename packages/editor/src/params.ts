import { getOp, type Engine, type NodeInst, type ParamSpec, type ParamValue } from '@webtoe/core';

/** Right-side parameter panel: typed widgets + per-param expression toggle. */
export class ParamPanel {
  private node: NodeInst | null = null;
  private headErr: HTMLElement | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly engine: Engine,
    private readonly onChanged: () => void,
  ) {
    el.className = 'wt-params';
  }

  show(node: NodeInst | null): void {
    this.node = node;
    this.el.innerHTML = '';
    this.headErr = null;
    if (!node) return;
    const spec = getOp(node.type);

    const head = document.createElement('div');
    head.className = 'wt-phead';
    const name = document.createElement('span');
    name.className = 'wt-pname';
    name.textContent = node.name;
    const typ = document.createElement('span');
    typ.className = 'wt-ptype';
    typ.textContent = node.foreignType ? `${spec.label} · was ${node.foreignType}` : (spec.label ?? node.type);
    const err = document.createElement('span');
    err.className = 'wt-perr';
    head.append(name, typ, err);
    this.el.appendChild(head);
    this.headErr = err;

    let page: string | undefined;
    for (const ps of spec.params) {
      if (ps.page !== page) {
        page = ps.page;
        if (page) {
          const h = document.createElement('div');
          h.className = 'wt-ppage';
          h.textContent = page;
          this.el.appendChild(h);
        }
      }
      this.el.appendChild(this.row(node, ps));
    }

    if (node.text !== undefined) {
      const pre = document.createElement('pre');
      pre.style.cssText = 'margin:8px 12px;padding:8px;background:#101013;border-radius:6px;max-height:200px;overflow:auto;font:11px ui-monospace,monospace;color:#c5e1a5;';
      pre.textContent = node.text.slice(0, 4000);
      this.el.appendChild(pre);
    }
  }

  /** light refresh: error badge only (called at low rate from the app loop) */
  tick(): void {
    if (this.node && this.headErr) {
      this.headErr.textContent = this.node.error ?? '';
      this.headErr.title = this.node.error ?? '';
    }
  }

  private pv(node: NodeInst, key: string, fallback: ParamSpec): ParamValue {
    let v = node.params.get(key);
    if (!v) {
      v = { mode: 'const', value: structuredClone(fallback.default) };
      node.params.set(key, v);
    }
    return v;
  }

  private row(node: NodeInst, ps: ParamSpec): HTMLElement {
    const row = document.createElement('div');
    row.className = 'wt-prow';
    const label = document.createElement('div');
    label.className = 'wt-plabel';
    label.textContent = ps.label ?? ps.key;
    label.title = ps.key;
    const widget = document.createElement('div');
    const exprBtn = document.createElement('button');
    exprBtn.className = 'wt-exprbtn';
    exprBtn.textContent = 'ƒ';
    exprBtn.title = 'toggle expression';
    row.append(label, widget, exprBtn);

    const pv = this.pv(node, ps.key, ps);
    const renderWidget = () => {
      widget.innerHTML = '';
      if (pv.mode === 'expr' || pv.mode === 'disabled-expr') {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'wt-exprfield';
        input.spellcheck = false;
        input.value = pv.expr ?? pv.tdExpr ?? '';
        if (pv.mode === 'disabled-expr') {
          input.classList.add('wt-badexpr');
          input.title = `imported expression (inactive): ${pv.tdExpr ?? ''}`;
        }
        input.addEventListener('change', () => {
          pv.expr = input.value;
          pv.mode = 'expr';
          input.classList.remove('wt-badexpr');
          this.onChanged();
        });
        input.addEventListener('keydown', (e) => e.stopPropagation());
        widget.appendChild(input);
      } else {
        this.constWidget(widget, node, ps, pv);
      }
      exprBtn.classList.toggle('wt-on', pv.mode !== 'const');
    };
    exprBtn.addEventListener('click', () => {
      if (pv.mode === 'const') {
        pv.mode = 'expr';
        pv.expr = pv.expr ?? String(typeof pv.value === 'number' ? pv.value : `'${String(pv.value)}'`);
      } else {
        pv.mode = 'const';
      }
      renderWidget();
      this.onChanged();
    });
    renderWidget();
    return row;
  }

  private constWidget(host: HTMLElement, node: NodeInst, ps: ParamSpec, pv: ParamValue): void {
    const changed = () => this.onChanged();
    switch (ps.type) {
      case 'float':
      case 'int': {
        const wrap = document.createElement('div');
        wrap.className = 'wt-sliderwrap';
        const num = document.createElement('input');
        num.type = 'number';
        num.className = 'wt-num';
        num.step = ps.type === 'int' ? '1' : String(ps.step ?? 0.01);
        num.value = String(pv.value);
        const hasRange = ps.min !== undefined && ps.max !== undefined;
        let slider: HTMLInputElement | null = null;
        if (hasRange) {
          slider = document.createElement('input');
          slider.type = 'range';
          slider.min = String(ps.min);
          slider.max = String(ps.max);
          slider.step = ps.type === 'int' ? '1' : String((ps.max! - ps.min!) / 200);
          slider.value = String(pv.value);
          slider.addEventListener('input', () => {
            pv.value = Number(slider!.value);
            num.value = slider!.value;
            changed();
          });
          wrap.appendChild(slider);
        }
        num.addEventListener('change', () => {
          const v = ps.type === 'int' ? Math.round(Number(num.value)) : Number(num.value);
          pv.value = Number.isFinite(v) ? v : 0;
          if (slider) slider.value = String(pv.value);
          changed();
        });
        num.addEventListener('keydown', (e) => e.stopPropagation());
        wrap.appendChild(num);
        host.appendChild(wrap);
        break;
      }
      case 'toggle': {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!pv.value;
        cb.addEventListener('change', () => {
          pv.value = cb.checked;
          changed();
        });
        host.appendChild(cb);
        break;
      }
      case 'menu': {
        const sel = document.createElement('select');
        for (const m of ps.menu ?? []) {
          const o = document.createElement('option');
          o.value = m;
          o.textContent = m;
          sel.appendChild(o);
        }
        sel.value = String(pv.value);
        sel.addEventListener('change', () => {
          pv.value = sel.value;
          changed();
        });
        host.appendChild(sel);
        break;
      }
      case 'string': {
        const input = document.createElement('input');
        input.type = 'text';
        input.spellcheck = false;
        input.value = String(pv.value);
        input.addEventListener('change', () => {
          pv.value = input.value;
          changed();
        });
        input.addEventListener('keydown', (e) => e.stopPropagation());
        host.appendChild(input);
        break;
      }
      case 'color': {
        const wrap = document.createElement('div');
        wrap.className = 'wt-colorrow';
        const arr = Array.isArray(pv.value) ? [...(pv.value as number[])] : [1, 1, 1, 1];
        while (arr.length < 4) arr.push(1);
        const swatch = document.createElement('div');
        swatch.className = 'wt-swatch';
        const sync = () => {
          pv.value = [...arr];
          swatch.style.background = `rgba(${arr.slice(0, 3).map((c) => Math.round(c * 255)).join(',')},${arr[3]})`;
          changed();
        };
        ['r', 'g', 'b', 'a'].forEach((ch, i) => {
          const num = document.createElement('input');
          num.type = 'number';
          num.min = '0';
          num.max = '4';
          num.step = '0.05';
          num.title = ch;
          num.value = String(arr[i]);
          num.addEventListener('change', () => {
            arr[i] = Number(num.value) || 0;
            sync();
          });
          num.addEventListener('keydown', (e) => e.stopPropagation());
          wrap.appendChild(num);
        });
        wrap.appendChild(swatch);
        swatch.style.background = `rgba(${arr.slice(0, 3).map((c) => Math.round(c * 255)).join(',')},${arr[3]})`;
        host.appendChild(wrap);
        break;
      }
      case 'xy': {
        const wrap = document.createElement('div');
        wrap.className = 'wt-colorrow';
        const arr = Array.isArray(pv.value) ? [...(pv.value as number[])] : [0, 0];
        ['x', 'y'].forEach((ch, i) => {
          const num = document.createElement('input');
          num.type = 'number';
          num.step = '0.01';
          num.title = ch;
          num.value = String(arr[i] ?? 0);
          num.addEventListener('change', () => {
            arr[i] = Number(num.value) || 0;
            pv.value = [...arr];
            this.onChanged();
          });
          num.addEventListener('keydown', (e) => e.stopPropagation());
          wrap.appendChild(num);
        });
        host.appendChild(wrap);
        break;
      }
    }
    void node;
    void this.engine;
  }
}
