import type { OpSpec } from '@webtoe/core';
import { asChop } from '../chop/data';

/** Container, DAT text, and the per-family stub fallbacks used by importers. */
export const commonOps: OpSpec[] = [
  {
    type: 'comp:container',
    family: 'COMP',
    label: 'container',
    inputs: { min: 0, max: 0 },
    params: [],
    isContainer: true,
    cook(ctx) {
      // COMP output = its display-flagged child's output (if any); cooked on demand
      const kids = ctx.node.children ? [...ctx.node.children.values()] : [];
      const display = kids.find((k) => k.flags.display);
      return display ? ctx.engine.cook(display) : null;
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
