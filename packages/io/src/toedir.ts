/**
 * TouchDesigner `.toe.dir` importer — the first ProjectLoader adapter.
 *
 * Input: the text expansion produced by the user's own TD install via the
 * official `toeexpand` CLI (format undocumented; grammar empirically verified,
 * see docs/RESEARCH.md §2.1). Output: GraphJSON + an honest ImportReport.
 *
 * Mapping philosophy: translate what WebToe can faithfully run; everything
 * else becomes a family-colored stub that preserves name/wires/layout, and
 * untranslatable Python expressions are kept inert as `tdExpr`.
 */
import {
  translateTdExpr,
  type Family, type GraphJSON, type ImportReport, type NodeJSON,
  type ParamValueJSON, type WireJSON,
} from '@webtoe/core';

export interface ImportFile {
  /** path relative to the expansion root, e.g. "project1/noise1.n" */
  path: string;
  text(): Promise<string>;
}

export interface ProjectLoader {
  name: string;
  canLoad(files: ImportFile[]): boolean;
  load(files: ImportFile[]): Promise<{ json: GraphJSON; report: ImportReport }>;
}

// ---------------------------------------------------------------- tables

/** TD `FAMILY:type` → WebToe op type. Conservative: only confident mappings. */
const TYPE_MAP: Record<string, string> = {
  'TOP:noise': 'top:noise',
  'TOP:level': 'top:level',
  'TOP:blur': 'top:blur',
  'TOP:transform': 'top:transform',
  'TOP:ramp': 'top:ramp',
  'TOP:constant': 'top:constant',
  'TOP:rectangle': 'top:rectangle',
  'TOP:composite': 'top:composite',
  'TOP:comp': 'top:composite',
  'TOP:over': 'top:composite',
  'TOP:add': 'top:composite',
  'TOP:multiply': 'top:composite',
  'TOP:displace': 'top:displace',
  'TOP:edge': 'top:edge',
  'TOP:feedback': 'top:feedback',
  'TOP:moviefilein': 'top:imagein',
  'TOP:videodevin': 'top:camerain',
  'TOP:null': 'top:null',
  'TOP:out': 'top:out',
  'TOP:in': 'top:in',
  'CHOP:in': 'chop:in',
  'CHOP:out': 'chop:out',
  'CHOP:lfo': 'chop:lfo',
  'CHOP:noise': 'chop:noise',
  'CHOP:math': 'chop:math',
  'CHOP:lag': 'chop:lag',
  'CHOP:constant': 'chop:constant',
  'CHOP:mousein': 'chop:mousein',
  'CHOP:merge': 'chop:merge',
  'CHOP:select': 'chop:select',
  'CHOP:null': 'chop:merge', // passthrough approximation
  'COMP:container': 'comp:container',
  'COMP:base': 'comp:container',
  'DAT:text': 'dat:text',
};

/** implied parameter presets for collapsed type mappings */
const TYPE_PRESETS: Record<string, Record<string, string>> = {
  'TOP:over': { operation: 'over' },
  'TOP:add': { operation: 'add' },
  'TOP:multiply': { operation: 'multiply' },
};

type ParamRule =
  | { to: string }
  | { to: string; menu: Record<string, string> }
  | { toColor: string; channel: number };

/** TD parm token → WebToe param, per mapped TD type. Unlisted parms are
 *  ignored (counted in the report). */
const PARAM_MAP: Record<string, Record<string, ParamRule>> = {
  'TOP:noise': {
    period: { to: 'period' },
    harmon: { to: 'harmonics' },
    exp: { to: 'exponent' },
    mono: { to: 'mono' },
  },
  'TOP:level': {
    brightness1: { to: 'brightness' },
    gamma1: { to: 'gamma' },
    contrast: { to: 'contrast' },
    opacity: { to: 'opacity' },
    invert: { to: 'invert' },
  },
  'TOP:blur': { size: { to: 'size' } },
  'TOP:transform': {
    tx: { to: 'tx' },
    ty: { to: 'ty' },
    rotate: { to: 'rotate' },
    sx: { to: 'sx' },
    sy: { to: 'sy' },
    px: { to: 'pivotx' },
    py: { to: 'pivoty' },
    extend: { to: 'extend', menu: { hold: 'hold', zero: 'zero', repeat: 'cycle', mirror: 'mirror' } },
  },
  'TOP:ramp': {
    type: { to: 'type', menu: { horz: 'linear', vert: 'linear', radial: 'radial', circular: 'circular' } },
    phase: { to: 'phase' },
  },
  'TOP:constant': {
    colorr: { toColor: 'color', channel: 0 },
    colorg: { toColor: 'color', channel: 1 },
    colorb: { toColor: 'color', channel: 2 },
    alpha: { toColor: 'color', channel: 3 },
  },
  'TOP:composite': { operand: { to: 'operation' } },
  'TOP:comp': { operand: { to: 'operation' } },
  'TOP:displace': {
    weight1: { to: 'weight' },
    offsetweight1: { to: 'weight' },
  },
  'TOP:edge': { strength: { to: 'strength' } },
  'TOP:moviefilein': { file: { to: 'file' } },
  'CHOP:lfo': {
    type: { to: 'wave', menu: { sin: 'sin', square: 'square', tri: 'tri', triangle: 'tri', ramp: 'saw', saw: 'saw', pulse: 'pulse' } },
    frequency: { to: 'frequency' },
    amp: { to: 'amplitude' },
    offset: { to: 'offset' },
    phase: { to: 'phase' },
  },
  'CHOP:noise': {
    period: { to: 'period' },
    harmon: { to: 'harmonics' },
    amp: { to: 'amplitude' },
    seed: { to: 'seed' },
  },
  'CHOP:math': {
    chopop: { to: 'combine', menu: { add: 'add', sub: 'subtract', mult: 'multiply', divide: 'divide', average: 'average' } },
    gain: { to: 'gain' },
    preoff: { to: 'preadd' },
    postoff: { to: 'postadd' },
  },
  'CHOP:lag': { lag1: { to: 'lagup' }, lag2: { to: 'lagdown' } },
  'CHOP:select': { channames: { to: 'channames' } },
};

const STUB_FOR: Record<string, string> = {
  TOP: 'top:stub',
  CHOP: 'chop:stub',
  SOP: 'comp:stub',
  POP: 'comp:stub',
  MAT: 'comp:stub',
  COMP: 'comp:stub',
  DAT: 'dat:stub',
};

const POS_SCALE = 1.0;

// ---------------------------------------------------------------- parsing

interface RawNode {
  name: string;
  tdType: string; // FAMILY:type
  family: string;
  tile: { x: number; y: number };
  comment?: string;
  inputs: { index: number; source: string }[];
  parms: Map<string, { mode: number; rest: string }>;
  text?: string;
  children?: Map<string, RawNode>;
}

function parseNodeFile(text: string): Omit<RawNode, 'name' | 'parms'> {
  const lines = text.split('\n');
  let tdType = '';
  let family = '';
  const tile = { x: 0, y: 0 };
  let comment: string | undefined;
  const inputs: { index: number; source: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i].trim();
    const head = L.match(/^([A-Z]+):(\S+)/);
    if (head && !tdType) {
      family = head[1];
      tdType = `${head[1]}:${head[2]}`;
    } else if (L.startsWith('tile ')) {
      const [x, y] = L.slice(5).trim().split(/\s+/).map(Number);
      tile.x = x || 0;
      tile.y = y || 0;
    } else if (L.startsWith('comment ')) {
      comment = L.slice(8).replace(/^"|"$/g, '');
    } else if (L === 'inputs') {
      i++; // '{'
      while (++i < lines.length && !lines[i].includes('}')) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 2) inputs.push({ index: Number(parts[0]), source: parts.slice(1).join(' ') });
      }
    }
  }
  return { tdType, family, tile, comment, inputs };
}

function parseParmFile(text: string): Map<string, { mode: number; rest: string }> {
  const out = new Map<string, { mode: number; rest: string }>();
  for (const raw of text.split('\n')) {
    const L = raw.replace(/^﻿/, '').trim();
    if (!L || L === '?') continue;
    const m = L.match(/^(\S+)\s+(\d+)\s+(.*)$/);
    if (m) out.set(m[1], { mode: Number(m[2]), rest: m[3].replace(/^﻿/, '') });
  }
  return out;
}

// ---------------------------------------------------------------- loader

export const toedirLoader: ProjectLoader = {
  name: 'TouchDesigner toeexpand directory',

  canLoad(files) {
    return files.some((f) => f.path.endsWith('.n') || f.path === '.build');
  },

  async load(files) {
    const report: ImportReport = {
      nodesTotal: 0, nodesMapped: 0, nodesStubbed: 0,
      exprTranslated: 0, exprDisabled: 0, notes: [],
    };
    const unknownTypes = new Map<string, number>();
    let unmappedParms = 0;
    let skippedWires = 0;

    // index files by normalized path
    const byPath = new Map<string, ImportFile>();
    for (const f of files) byPath.set(f.path.replace(/\\/g, '/'), f);

    // collect nodes: every "<dir>/<name>.n"
    const root = new Map<string, RawNode>();
    const networkOf = (dir: string): Map<string, RawNode> | null => {
      if (!dir) return root;
      let cur: Map<string, RawNode> | null = root;
      for (const seg of dir.split('/')) {
        const parent: RawNode | undefined = cur?.get(seg);
        if (!parent) return null; // parent .n not seen (yet) — second pass resolves
        parent.children ??= new Map();
        cur = parent.children;
      }
      return cur;
    };

    const nFiles = [...byPath.keys()].filter((p) => p.endsWith('.n')).sort(
      (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b),
    );
    for (const path of nFiles) {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const name = path.slice(dir ? dir.length + 1 : 0, -2);
      if (name.startsWith('.')) continue;
      const net = networkOf(dir);
      if (!net) {
        report.notes.push(`orphan network path skipped: ${path}`);
        continue;
      }
      const base = parseNodeFile(await byPath.get(path)!.text());
      if (!base.tdType) continue;
      const node: RawNode = { name, parms: new Map(), ...base };
      const parmFile = byPath.get(`${dir ? dir + '/' : ''}${name}.parm`);
      if (parmFile) node.parms = parseParmFile(await parmFile.text());
      const textFile = byPath.get(`${dir ? dir + '/' : ''}${name}.text`);
      if (textFile) node.text = await textFile.text();
      net.set(name, node);
    }

    // convert RawNode tree → NodeJSON tree
    const convertNet = (nodes: Map<string, RawNode>): { nodes: NodeJSON[]; wires: WireJSON[] } => {
      const out: NodeJSON[] = [];
      const wires: WireJSON[] = [];
      const xs = [...nodes.values()].map((n) => n.tile.x);
      const ys = [...nodes.values()].map((n) => -n.tile.y);
      const ox = xs.length ? Math.min(...xs) : 0;
      const oy = ys.length ? Math.min(...ys) : 0;

      for (const raw of nodes.values()) {
        report.nodesTotal++;
        const mapped = TYPE_MAP[raw.tdType];
        const family = (raw.family in STUB_FOR ? raw.family : 'COMP') as string;
        const type = mapped ?? STUB_FOR[family];
        if (mapped) report.nodesMapped++;
        else {
          report.nodesStubbed++;
          unknownTypes.set(raw.tdType, (unknownTypes.get(raw.tdType) ?? 0) + 1);
        }

        const nj: NodeJSON = {
          name: raw.name,
          type,
          family: (['TOP', 'CHOP', 'DAT'].includes(family) ? family : 'COMP') as Family,
          pos: [(raw.tile.x - ox) * POS_SCALE + 40, (-raw.tile.y - oy) * POS_SCALE + 40],
        };
        if (!mapped) nj.foreignType = raw.tdType;
        if (raw.text !== undefined) nj.text = raw.text;

        // params
        const params: Record<string, ParamValueJSON> = {};
        for (const [k, v] of Object.entries(TYPE_PRESETS[raw.tdType] ?? {})) {
          params[k] = { mode: 'const', value: v };
        }
        if (type === 'top:in' || type === 'chop:in') {
          const digits = raw.name.match(/^in(\d+)$/);
          if (digits) params.index = { mode: 'const', value: Number(digits[1]) - 1 };
        }
        const rules = PARAM_MAP[raw.tdType] ?? {};
        const colorAcc: Record<string, number[]> = {};
        for (const [tdKey, { mode, rest }] of raw.parms) {
          const rule = rules[tdKey];
          if (!rule) {
            unmappedParms++;
            continue;
          }
          if (mode === 17) {
            // "<default> <python expression>"
            const sp = rest.indexOf(' ');
            const def = sp >= 0 ? rest.slice(0, sp) : rest;
            const py = sp >= 0 ? rest.slice(sp + 1) : '';
            const t = translateTdExpr(py);
            const defVal = Number.isFinite(Number(def)) ? Number(def) : def;
            if ('to' in rule) {
              if (t.ok) {
                report.exprTranslated++;
                params[rule.to] = { mode: 'expr', value: defVal, expr: t.expr };
              } else {
                report.exprDisabled++;
                params[rule.to] = { mode: 'disabled-expr', value: defVal, tdExpr: py };
              }
            }
            continue;
          }
          // const-ish modes (0 = value, 16 = "quoted-string default-expr")
          let value: string | number = rest;
          if (mode === 16) {
            const q = rest.match(/^"([^"]*)"/);
            value = q ? q[1] : rest.split(/\s+/)[0];
          } else {
            const first = rest.trim();
            value = Number.isFinite(Number(first)) ? Number(first) : first;
          }
          if ('toColor' in rule) {
            colorAcc[rule.toColor] ??= [1, 1, 1, 1];
            colorAcc[rule.toColor][rule.channel] = Number(value) || 0;
          } else if ('menu' in rule) {
            const mappedVal = rule.menu[String(value)];
            if (mappedVal !== undefined) params[rule.to] = { mode: 'const', value: mappedVal };
            else unmappedParms++;
          } else {
            params[rule.to] = { mode: 'const', value };
          }
        }
        for (const [key, col] of Object.entries(colorAcc)) {
          params[key] = { mode: 'const', value: col };
        }
        if (Object.keys(params).length) nj.params = params;

        // children
        if (raw.children?.size) {
          const sub = convertNet(raw.children);
          nj.children = sub.nodes;
          if (sub.wires.length) nj.wires = sub.wires;
          if (nj.type.endsWith(':stub')) nj.type = 'comp:stub';
        }
        out.push(nj);

        // wires (same-network only in v1)
        for (const inp of raw.inputs) {
          const src = inp.source.replace(/^\.\//, '');
          if (src.includes('/')) {
            skippedWires++;
            continue;
          }
          if (nodes.has(src)) wires.push({ from: `${src}:0`, to: `${raw.name}:${inp.index}` });
          else skippedWires++;
        }
      }
      return { nodes: out, wires };
    };

    const rootNet = convertNet(root);
    if (unknownTypes.size) {
      const top = [...unknownTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([t, c]) => `${t}×${c}`).join(', ');
      report.notes.push(`stubbed op types: ${top}${unknownTypes.size > 12 ? ', …' : ''}`);
    }
    if (skippedWires) report.notes.push(`${skippedWires} cross-network or unresolved wires skipped (v1 limitation)`);
    if (unmappedParms) report.notes.push(`${unmappedParms} parameters had no mapping and were left at defaults`);

    return {
      json: { app: 'webtoe', version: 1, root: rootNet },
      report,
    };
  },
};

/** Browser helper: turn a webkitdirectory FileList into ImportFiles,
 *  stripping the top-level "<name>.toe.dir/" segment. */
export function importFilesFromFileList(list: FileList | File[]): ImportFile[] {
  const files = [...list] as (File & { webkitRelativePath?: string })[];
  return files.map((f) => {
    let p = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
    const segs = p.split('/');
    if (segs.length > 1) p = segs.slice(1).join('/');
    return { path: p, text: () => f.text() };
  });
}
