import type { OpSpec } from '@webtoe/core';
import { asChop } from '../chop/data';

/** Container, DAT text, and the per-family stub fallbacks used by importers. */
export const commonOps: OpSpec[] = [
  {
    type: 'comp:container',
    family: 'COMP',
    label: 'container',
    inputs: { min: 0, max: 8 },
    params: [],
    isContainer: true,
    cook(ctx) {
      // COMP output: its out-tunnel child if present, else the display child
      const kids = ctx.node.children ? [...ctx.node.children.values()] : [];
      const outs = kids
        .filter((k) => k.type === 'top:out' || k.type === 'chop:out' || k.type === 'dat:out')
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const target = outs[0] ?? kids.find((k) => k.flags.display);
      return target ? ctx.engine.cook(target) : null;
    },
  },

  {
    type: 'dat:text',
    family: 'DAT',
    label: 'text',
    inputs: { min: 0, max: 0 },
    params: [],
    cook(ctx) {
      return { kind: 'dat', text: ctx.node.text ?? '' };
    },
  },

  {
    type: 'dat:table',
    family: 'DAT',
    label: 'table',
    inputs: { min: 0, max: 1 },
    params: [],
    cook(ctx) {
      const input = ctx.inputs[0];
      if (input && input.kind === 'dat') return input;
      return { kind: 'dat', text: ctx.node.text ?? '' };
    },
  },

  {
    type: 'dat:select',
    family: 'DAT',
    label: 'select',
    inputs: { min: 0, max: 1 },
    params: [{ key: 'dat', type: 'string', default: '' }],
    cook(ctx) {
      const path = ctx.paramStr('dat');
      if (path) {
        const target = ctx.engine.graph.resolve(path, ctx.node);
        if (target) {
          const out = ctx.engine.cook(target);
          if (out && out.kind === 'dat') return out;
        }
      }
      const input = ctx.inputs[0];
      return input && input.kind === 'dat' ? input : { kind: 'dat', text: ctx.node.text ?? '' };
    },
  },

  {
    type: 'dat:null',
    family: 'DAT',
    label: 'null',
    inputs: { min: 1, max: 1 },
    params: [],
    cook(ctx) {
      const input = ctx.inputs[0];
      return input && input.kind === 'dat' ? input : { kind: 'dat', text: '' };
    },
  },

  {
    type: 'dat:in',
    family: 'DAT',
    label: 'in',
    inputs: { min: 0, max: 0 },
    alwaysCook: true,
    params: [{ key: 'index', type: 'int', default: 0, min: 0, max: 7 }],
    cook(ctx) {
      const parent = ctx.node.parent;
      const ext = parent?.inputs[Math.max(0, Math.round(ctx.paramNum('index')))];
      if (!ext) return { kind: 'dat', text: '' };
      const out = ctx.engine.cook(ext);
      return out && out.kind === 'dat' ? out : { kind: 'dat', text: '' };
    },
  },

  {
    type: 'dat:out',
    family: 'DAT',
    label: 'out',
    inputs: { min: 1, max: 1 },
    params: [],
    cook(ctx) {
      const input = ctx.inputs[0];
      return input && input.kind === 'dat' ? input : { kind: 'dat', text: '' };
    },
  },

  // ---- import fallbacks: keep structure honest, never pretend to compute ----
  {
    type: 'top:stub',
    family: 'TOP',
    label: 'stub (TOP)',
    inputs: { min: 0, max: 8 },
    params: [],
    cook(ctx) {
      const first = ctx.inputs.find((i) => i && i.kind === 'top') ?? null;
      return first; // passthrough when possible, else nothing
    },
  },
  {
    type: 'chop:stub',
    family: 'CHOP',
    label: 'stub (CHOP)',
    inputs: { min: 0, max: 8 },
    params: [],
    cook(ctx) {
      return asChop(ctx.inputs.find((i) => i && i.kind === 'chop') ?? null);
    },
  },
  {
    type: 'comp:stub',
    family: 'COMP',
    label: 'stub (COMP)',
    inputs: { min: 0, max: 8 },
    params: [],
    isContainer: true,
    cook() {
      return null;
    },
  },
  {
    type: 'dat:stub',
    family: 'DAT',
    label: 'stub (DAT)',
    inputs: { min: 0, max: 8 },
    params: [],
    cook(ctx) {
      return { kind: 'dat', text: ctx.node.text ?? '' };
    },
  },
];
