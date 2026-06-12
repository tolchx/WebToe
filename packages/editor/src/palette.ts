import { allOps, type Family, type OpSpec } from '@webtoe/core';
import { FAMILY_COLORS } from './style';

const FAMILIES: Family[] = ['TOP', 'CHOP', 'SOP', 'MAT', 'COMP', 'DAT'];

/** OP Create dialog: family tabs + multi-column grid + search (searching spans
 *  all families). Opened with Tab or double-click on empty network space. */
export class Palette {
  private el: HTMLDivElement | null = null;
  private items: { spec: OpSpec; el: HTMLDivElement }[] = [];
  private active = 0;
  private family: Family = 'TOP';
  private query = '';

  constructor(
    private readonly host: HTMLElement,
    private readonly onPick: (type: string) => void,
  ) {}

  get isOpen(): boolean {
    return !!this.el;
  }

  open(x: number, y: number, family?: string): void {
    this.close();
    const el = document.createElement('div');
    el.className = 'wt-palette';
    el.style.left = `${Math.max(8, Math.min(x, this.host.clientWidth - 560))}px`;
    el.style.top = `${Math.max(8, Math.min(y, this.host.clientHeight - 420))}px`;

    const head = document.createElement('div');
    head.className = 'wt-phead2';
    const title = document.createElement('span');
    title.className = 'wt-ptitle';
    title.textContent = 'create operator';
    const input = document.createElement('input');
    input.placeholder = family ? `search ${family}…` : 'search all families…';
    input.spellcheck = false;
    head.append(title, input);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#555;cursor:pointer;font-size:16px;padding:0 4px;line-height:1;';
    closeBtn.title = 'Close (Esc)';
    closeBtn.addEventListener('click', () => this.close());
    head.appendChild(closeBtn);

    const tabs = document.createElement('div');
    tabs.className = 'wt-ptabs';
    const tabEls = new Map<Family, HTMLButtonElement>();
    for (const fam of FAMILIES) {
      const b = document.createElement('button');
      b.textContent = fam;
      b.style.setProperty('--fam', FAMILY_COLORS[fam] ?? '#888');
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.family = fam;
        this.query = '';
        input.value = '';
        render();
        input.focus();
      });
      tabs.appendChild(b);
      tabEls.set(fam, b);
    }

    const grid = document.createElement('div');
    grid.className = 'wt-pgrid';
    el.append(head, tabs, grid);
    this.host.appendChild(el);
    this.el = el;

    // If a specific family was requested, set it and render immediately
    if (family && FAMILIES.includes(family as any)) {
      this.family = family as Family;
      this.query = '';
    }

    const render = () => {
      grid.innerHTML = '';
      this.items = [];
      this.active = 0;
      const q = this.query.trim().toLowerCase();
      for (const [fam, b] of tabEls) b.classList.toggle('wt-on', !q && fam === this.family);

      const specs = allOps()
        .filter((s) => s.type !== '__root__' && !s.type.endsWith(':stub'))
        .filter((s) => (q
          ? (s.label ?? s.type).toLowerCase().includes(q) || s.type.toLowerCase().includes(q)
          : s.family === this.family))
        .sort((a, b) => (a.label ?? a.type).localeCompare(b.label ?? b.type));

      for (const spec of specs) {
        const item = document.createElement('div');
        item.className = 'wt-pitem';
        if (spec.inputs.min === 0) item.classList.add('wt-pgen');
        else item.classList.add('wt-pfil');
        const dot = document.createElement('span');
        dot.className = 'wt-dot';
        dot.style.background = FAMILY_COLORS[spec.family] ?? '#888';
        const name = document.createElement('span');
        name.textContent = spec.label ?? spec.type;
        const genLabel = document.createElement('span');
        genLabel.className = 'wt-pgenlabel';
        genLabel.textContent = spec.inputs.min === 0 ? '(gen)' : '(fil)';
        item.append(dot, name, genLabel);
        if (q) {
          const fam = document.createElement('span');
          fam.className = 'wt-pfam';
          fam.textContent = spec.family;
          item.appendChild(fam);
        }
        item.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          this.pick(spec.type);
        });
        grid.appendChild(item);
        this.items.push({ spec, el: item });
      }
      this.highlight();
    };

    input.addEventListener('input', () => {
      this.query = input.value;
      render();
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const cols = Math.max(1, Math.floor(grid.clientWidth / 168));
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowDown') { this.active = Math.min(this.active + cols, this.items.length - 1); this.highlight(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { this.active = Math.max(this.active - cols, 0); this.highlight(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { this.active = Math.min(this.active + 1, this.items.length - 1); this.highlight(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { this.active = Math.max(this.active - 1, 0); this.highlight(); e.preventDefault(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const i = FAMILIES.indexOf(this.family);
        this.family = FAMILIES[(i + (e.shiftKey ? FAMILIES.length - 1 : 1)) % FAMILIES.length];
        this.query = '';
        input.value = '';
        render();
      } else if (e.key === 'Enter' && this.items[this.active]) {
        this.pick(this.items[this.active].spec.type);
      }
    });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());

    // Swipe gesture on the palette to switch family tabs
    let touchStartX = 0;
    el.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(deltaX) > 50) {
        const i = FAMILIES.indexOf(this.family);
        this.family = FAMILIES[(i + (deltaX < 0 ? 1 : FAMILIES.length - 1)) % FAMILIES.length];
        this.query = '';
        input.value = '';
        render();
      }
    }, { passive: true });

    render();
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
