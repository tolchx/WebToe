import { allOps, type OpSpec } from '@webtoe/core';
import { FAMILY_COLORS } from './style';

/** Searchable op-create dialog (Tab / double-click on empty network space). */
export class Palette {
  private el: HTMLDivElement | null = null;
  private items: { spec: OpSpec; el: HTMLDivElement }[] = [];
  private active = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly onPick: (type: string) => void,
  ) {}

  get isOpen(): boolean {
    return !!this.el;
  }

  open(x: number, y: number): void {
    this.close();
    const el = document.createElement('div');
    el.className = 'wt-palette';
    el.style.left = `${Math.min(x, this.host.clientWidth - 290)}px`;
    el.style.top = `${Math.min(y, this.host.clientHeight - 390)}px`;
    const input = document.createElement('input');
    input.placeholder = 'search operators…';
    input.spellcheck = false;
    const list = document.createElement('div');
    list.className = 'wt-plist';
    el.append(input, list);
    this.host.appendChild(el);
    this.el = el;

    const render = (q: string) => {
      list.innerHTML = '';
      this.items = [];
      this.active = 0;
      const ql = q.trim().toLowerCase();
      const groups = new Map<string, OpSpec[]>();
      for (const spec of allOps()) {
        if (spec.type === '__root__' || spec.type.endsWith(':stub')) continue;
        const label = spec.label ?? spec.type;
        if (ql && !label.toLowerCase().includes(ql) && !spec.type.toLowerCase().includes(ql)) continue;
        const arr = groups.get(spec.family) ?? [];
        arr.push(spec);
        groups.set(spec.family, arr);
      }
      for (const fam of ['TOP', 'CHOP', 'COMP', 'DAT']) {
        const specs = groups.get(fam);
        if (!specs?.length) continue;
        const g = document.createElement('div');
        g.className = 'wt-pgroup';
        g.textContent = fam;
        list.appendChild(g);
        for (const spec of specs.sort((a, b) => (a.label ?? a.type).localeCompare(b.label ?? b.type))) {
          const item = document.createElement('div');
          item.className = 'wt-pitem';
          const dot = document.createElement('span');
          dot.className = 'wt-dot';
          dot.style.background = FAMILY_COLORS[fam] ?? '#888';
          const name = document.createElement('span');
          name.textContent = spec.label ?? spec.type;
          item.append(dot, name);
          item.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            this.pick(spec.type);
          });
          list.appendChild(item);
          this.items.push({ spec, el: item });
        }
      }
      this.highlight();
    };

    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowDown') { this.active = Math.min(this.active + 1, this.items.length - 1); this.highlight(); }
      else if (e.key === 'ArrowUp') { this.active = Math.max(this.active - 1, 0); this.highlight(); }
      else if (e.key === 'Enter' && this.items[this.active]) this.pick(this.items[this.active].spec.type);
    });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());

    render('');
    input.focus();
  }

  close(): void {
    this.el?.remove();
    this.el = null;
    this.items = [];
  }

  private pick(type: string): void {
    this.close();
    this.onPick(type);
  }

  private highlight(): void {
    this.items.forEach((it, i) => it.el.classList.toggle('wt-active', i === this.active));
    this.items[this.active]?.el.scrollIntoView({ block: 'nearest' });
  }
}
