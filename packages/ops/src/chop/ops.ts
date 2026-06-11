import type { OpSpec, ChannelSet, Channel } from '@webtoe/core';
import { channels, asChop, CONTROL_RATE } from './data';
import { kernels, type LfoShape } from './kernels';

const F = 'CHOP' as const;

export const chopOps: OpSpec[] = [
  {
    type: 'chop:constant',
    family: F,
    label: 'constant',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'name0', type: 'string', default: 'chan1' },
      { key: 'value0', type: 'float', default: 0, min: -10, max: 10 },
      { key: 'name1', type: 'string', default: '' },
      { key: 'value1', type: 'float', default: 0, min: -10, max: 10 },
      { key: 'name2', type: 'string', default: '' },
      { key: 'value2', type: 'float', default: 0, min: -10, max: 10 },
      { key: 'name3', type: 'string', default: '' },
      { key: 'value3', type: 'float', default: 0, min: -10, max: 10 },
    ],
    cook(ctx) {
      const out: [string, number][] = [];
      for (let i = 0; i < 4; i++) {
        const name = ctx.paramStr(`name${i}`).trim();
        if (name) out.push([name, ctx.paramNum(`value${i}`)]);
      }
      return channels(out);
    },
  },

  {
    type: 'chop:lfo',
    family: F,
    label: 'lfo',
    inputs: { min: 0, max: 0 },
    alwaysCook: true,
    params: [
      { key: 'wave', type: 'menu', default: 'sin', menu: ['sin', 'tri', 'square', 'saw', 'pulse'] },
      { key: 'frequency', type: 'float', default: 1, min: 0, max: 20 },
      { key: 'amplitude', type: 'float', default: 1, min: -5, max: 5 },
      { key: 'offset', type: 'float', default: 0, min: -5, max: 5 },
      { key: 'phase', type: 'float', default: 0, min: 0, max: 1 },
    ],
    cook(ctx) {
      // integrate phase so live frequency changes don't jump (state survives frames)
      const st = ctx.node.state as { phase?: number };
      const prev = st.phase ?? ctx.paramNum('phase');
      const phase = prev + ctx.paramNum('frequency') * ctx.time.delta;
      st.phase = phase - Math.floor(phase);
      const v = kernels().lfo(ctx.paramStr('wave') as LfoShape, st.phase);
      return channels([['chan1', v * ctx.paramNum('amplitude') + ctx.paramNum('offset')]]);
    },
  },

  {
    type: 'chop:noise',
    family: F,
    label: 'noise',
    inputs: { min: 0, max: 0 },
    alwaysCook: true,
    params: [
      { key: 'period', type: 'float', default: 1, min: 0.01, max: 20 },
      { key: 'harmonics', type: 'int', default: 3, min: 1, max: 8 },
      { key: 'amplitude', type: 'float', default: 1, min: -5, max: 5 },
      { key: 'offset', type: 'float', default: 0, min: -5, max: 5 },
      { key: 'seed', type: 'float', default: 1, min: 0, max: 100 },
    ],
    cook(ctx) {
      const t = ctx.time.seconds / Math.max(1e-4, ctx.paramNum('period'));
      const v = kernels().fbm1(t, ctx.paramNum('harmonics'), ctx.paramNum('seed'));
      return channels([['chan1', v * ctx.paramNum('amplitude') + ctx.paramNum('offset')]]);
    },
  },

  {
    type: 'chop:math',
    family: F,
    label: 'math',
    inputs: { min: 1, max: 4 },
    params: [
      { key: 'combine', type: 'menu', default: 'add', menu: ['add', 'subtract', 'multiply', 'divide', 'average'] },
      { key: 'preadd', type: 'float', default: 0, min: -10, max: 10 },
      { key: 'gain', type: 'float', default: 1, min: -10, max: 10 },
      { key: 'postadd', type: 'float', default: 0, min: -10, max: 10 },
    ],
    cook(ctx) {
      const ins = ctx.inputs.map(asChop).filter((c): c is ChannelSet => !!c);
      if (!ins.length) return channels([]);
      const nch = Math.max(...ins.map((c) => c.channels.length));
      const combine = ctx.paramStr('combine');
      const preadd = ctx.paramNum('preadd');
      const gain = ctx.paramNum('gain');
      const postadd = ctx.paramNum('postadd');
      const out: [string, number][] = [];
      for (let i = 0; i < nch; i++) {
        const vals = ins
          .map((c) => c.channels[i])
          .filter((ch): ch is Channel => !!ch)
          .map((ch) => ch.data[ch.data.length - 1] ?? 0);
        let v = vals[0] ?? 0;
        for (let k = 1; k < vals.length; k++) {
          switch (combine) {
            case 'add': v += vals[k]; break;
            case 'subtract': v -= vals[k]; break;
            case 'multiply': v *= vals[k]; break;
            case 'divide': v = vals[k] === 0 ? 0 : v / vals[k]; break;
            case 'average': v += vals[k]; break;
          }
        }
        if (combine === 'average' && vals.length > 0) v /= vals.length;
        const name = ins.find((c) => c.channels[i])?.channels[i]?.name ?? `chan${i + 1}`;
        out.push([name, (v + preadd) * gain + postadd]);
      }
      return channels(out);
    },
  },

  {
    type: 'chop:lag',
    family: F,
    label: 'lag',
    inputs: { min: 1, max: 1 },
    alwaysCook: true,
    params: [
      { key: 'lagup', type: 'float', default: 0.2, min: 0, max: 5 },
      { key: 'lagdown', type: 'float', default: 0.2, min: 0, max: 5 },
    ],
    cook(ctx) {
      const input = asChop(ctx.inputs[0]);
      if (!input) return channels([]);
      const st = ctx.node.state as { lag?: Map<string, number> };
      st.lag ??= new Map();
      const lagup = ctx.paramNum('lagup');
      const lagdown = ctx.paramNum('lagdown');
      const out: [string, number][] = input.channels.map((ch) => {
        const target = ch.data[ch.data.length - 1] ?? 0;
        const cur = st.lag!.get(ch.name) ?? target;
        const v = kernels().lagStep(cur, target, lagup, lagdown, ctx.time.delta);
        st.lag!.set(ch.name, v);
        return [ch.name, v];
      });
      return channels(out, input.rate);
    },
  },

  {
    type: 'chop:merge',
    family: F,
    label: 'merge',
    inputs: { min: 1, max: 4 },
    params: [],
    cook(ctx) {
      const out: Channel[] = [];
      for (const cs of ctx.inputs.map(asChop)) {
        if (cs) out.push(...cs.channels.map((c) => ({ name: c.name, data: c.data })));
      }
      return { kind: 'chop', rate: CONTROL_RATE, channels: out };
    },
  },

  {
    type: 'chop:select',
    family: F,
    label: 'select',
    inputs: { min: 1, max: 1 },
    params: [{ key: 'channames', type: 'string', default: '*' }],
    cook(ctx) {
      const input = asChop(ctx.inputs[0]);
      if (!input) return channels([]);
      const patterns = ctx.paramStr('channames').trim().split(/\s+/).filter(Boolean);
      const match = (name: string) =>
        patterns.some((p) => new RegExp(`^${p.replace(/[.+^${}()|\\[\]]/g, '\\$&').replace(/\*/g, '.*')}$`).test(name));
      return { kind: 'chop', rate: input.rate, channels: input.channels.filter((c) => match(c.name)) };
    },
  },

  {
    type: 'chop:mousein',
    family: F,
    label: 'mouse in',
    inputs: { min: 0, max: 0 },
    alwaysCook: true,
    params: [],
    cook(ctx) {
      const m = ctx.io.mouse;
      return channels([
        ['tx', m.x],
        ['ty', m.y],
        ['lmb', m.down ? 1 : 0],
      ]);
    },
  },

  {
    type: 'chop:in',
    family: F,
    label: 'in',
    inputs: { min: 0, max: 0 },
    alwaysCook: true,
    params: [{ key: 'index', type: 'int', default: 0, min: 0, max: 7 }],
    cook(ctx) {
      const parent = ctx.node.parent;
      const ext = parent?.inputs[Math.max(0, Math.round(ctx.paramNum('index')))];
      if (!ext) return channels([]);
      return asChop(ctx.engine.cook(ext)) ?? channels([]);
    },
  },

  {
    type: 'chop:out',
    family: F,
    label: 'out',
    inputs: { min: 1, max: 1 },
    params: [],
    cook(ctx) {
      return asChop(ctx.inputs[0]);
    },
  },
];
