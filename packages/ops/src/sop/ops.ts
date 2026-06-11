import type { OpSpec } from '@webtoe/core';
import { mat4 } from '@webtoe/core';
import * as G from './geo';

const F = 'SOP' as const;
const PLANES = ['xy', 'zx', 'yz'];

const xformParams = [
  { key: 'tx', type: 'float', default: 0, min: -5, max: 5 },
  { key: 'ty', type: 'float', default: 0, min: -5, max: 5 },
  { key: 'tz', type: 'float', default: 0, min: -5, max: 5 },
  { key: 'rx', type: 'float', default: 0, min: -360, max: 360 },
  { key: 'ry', type: 'float', default: 0, min: -360, max: 360 },
  { key: 'rz', type: 'float', default: 0, min: -360, max: 360 },
  { key: 'sx', type: 'float', default: 1, min: -4, max: 4 },
  { key: 'sy', type: 'float', default: 1, min: -4, max: 4 },
  { key: 'sz', type: 'float', default: 1, min: -4, max: 4 },
] as const;

export const sopOps: OpSpec[] = [
  {
    type: 'sop:line',
    family: F,
    label: 'line',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'p1x', type: 'float', default: 0, min: -2, max: 2 },
      { key: 'p1y', type: 'float', default: -0.5, min: -2, max: 2 },
      { key: 'p1z', type: 'float', default: 0, min: -2, max: 2 },
      { key: 'p2x', type: 'float', default: 0, min: -2, max: 2 },
      { key: 'p2y', type: 'float', default: 0.5, min: -2, max: 2 },
      { key: 'p2z', type: 'float', default: 0, min: -2, max: 2 },
      { key: 'points', type: 'int', default: 20, min: 2, max: 400 },
    ],
    cook(ctx) {
      return {
        kind: 'sop',
        geo: G.line(
          [ctx.paramNum('p1x'), ctx.paramNum('p1y'), ctx.paramNum('p1z')],
          [ctx.paramNum('p2x'), ctx.paramNum('p2y'), ctx.paramNum('p2z')],
          ctx.paramNum('points'),
        ),
      };
    },
  },

  {
    type: 'sop:circle',
    family: F,
    label: 'circle',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'radius', type: 'float', default: 0.5, min: 0, max: 4 },
      { key: 'divisions', type: 'int', default: 48, min: 3, max: 400 },
      { key: 'closed', type: 'toggle', default: true },
      { key: 'plane', type: 'menu', default: 'xy', menu: [...PLANES] },
    ],
    cook(ctx) {
      return {
        kind: 'sop',
        geo: G.circle(ctx.paramNum('radius'), ctx.paramNum('divisions'), ctx.paramBool('closed'),
          ctx.paramStr('plane') as 'xy' | 'zx' | 'yz'),
      };
    },
  },

  {
    type: 'sop:rectangle',
    family: F,
    label: 'rectangle',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'sizex', type: 'float', default: 1, min: 0, max: 4 },
      { key: 'sizey', type: 'float', default: 1, min: 0, max: 4 },
    ],
    cook(ctx) {
      return { kind: 'sop', geo: G.rectangleSop(ctx.paramNum('sizex'), ctx.paramNum('sizey')) };
    },
  },

  {
    type: 'sop:grid',
    family: F,
    label: 'grid',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'rows', type: 'int', default: 10, min: 2, max: 200 },
      { key: 'cols', type: 'int', default: 10, min: 2, max: 200 },
      { key: 'sizex', type: 'float', default: 1, min: 0, max: 8 },
      { key: 'sizey', type: 'float', default: 1, min: 0, max: 8 },
    ],
    cook(ctx) {
      return {
        kind: 'sop',
        geo: G.grid(ctx.paramNum('rows'), ctx.paramNum('cols'), ctx.paramNum('sizex'), ctx.paramNum('sizey')),
      };
    },
  },

  {
    type: 'sop:sphere',
    family: F,
    label: 'sphere',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'radius', type: 'float', default: 0.5, min: 0, max: 4 },
      { key: 'rows', type: 'int', default: 16, min: 3, max: 128 },
      { key: 'cols', type: 'int', default: 24, min: 3, max: 128 },
    ],
    cook(ctx) {
      return { kind: 'sop', geo: G.sphere(ctx.paramNum('radius'), ctx.paramNum('rows'), ctx.paramNum('cols')) };
    },
  },

  {
    type: 'sop:box',
    family: F,
    label: 'box',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'sizex', type: 'float', default: 1, min: 0, max: 4 },
      { key: 'sizey', type: 'float', default: 1, min: 0, max: 4 },
      { key: 'sizez', type: 'float', default: 1, min: 0, max: 4 },
    ],
    cook(ctx) {
      return { kind: 'sop', geo: G.box(ctx.paramNum('sizex'), ctx.paramNum('sizey'), ctx.paramNum('sizez')) };
    },
  },

  {
    type: 'sop:tube',
    family: F,
    label: 'tube',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'rad1', type: 'float', default: 0.3, min: 0, max: 4 },
      { key: 'rad2', type: 'float', default: 0.3, min: 0, max: 4 },
      { key: 'height', type: 'float', default: 1, min: 0, max: 6 },
      { key: 'rows', type: 'int', default: 8, min: 2, max: 128 },
      { key: 'cols', type: 'int', default: 24, min: 3, max: 128 },
    ],
    cook(ctx) {
      return {
        kind: 'sop',
        geo: G.tube(ctx.paramNum('rad1'), ctx.paramNum('rad2'), ctx.paramNum('height'),
          ctx.paramNum('rows'), ctx.paramNum('cols')),
      };
    },
  },

  {
    type: 'sop:torus',
    family: F,
    label: 'torus',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'rad1', type: 'float', default: 0.5, min: 0, max: 4 },
      { key: 'rad2', type: 'float', default: 0.15, min: 0, max: 2 },
      { key: 'rows', type: 'int', default: 16, min: 3, max: 128 },
      { key: 'cols', type: 'int', default: 24, min: 3, max: 128 },
    ],
    cook(ctx) {
      return {
        kind: 'sop',
        geo: G.torus(ctx.paramNum('rad1'), ctx.paramNum('rad2'), ctx.paramNum('rows'), ctx.paramNum('cols')),
      };
    },
  },

  {
    type: 'sop:merge',
    family: F,
    label: 'merge',
    inputs: { min: 1, max: 4 },
    params: [],
    cook(ctx) {
      const geos = ctx.inputs.map(G.asSop).filter((g): g is NonNullable<typeof g> => !!g);
      if (!geos.length) return { kind: 'sop', geo: G.emptyGeo() };
      return { kind: 'sop', geo: G.mergeGeos(geos) };
    },
  },

  {
    type: 'sop:transform',
    family: F,
    label: 'transform',
    inputs: { min: 1, max: 1 },
    params: [...xformParams.map((p) => ({ ...p }))],
    cook(ctx) {
      const g = G.asSop(ctx.inputs[0]);
      if (!g) return { kind: 'sop', geo: G.emptyGeo() };
      const m = mat4.compose(
        [ctx.paramNum('tx'), ctx.paramNum('ty'), ctx.paramNum('tz')],
        [ctx.paramNum('rx'), ctx.paramNum('ry'), ctx.paramNum('rz')],
        [ctx.paramNum('sx'), ctx.paramNum('sy'), ctx.paramNum('sz')],
      );
      return { kind: 'sop', geo: G.transformGeo(g, m) };
    },
  },

  {
    type: 'sop:noise',
    family: F,
    label: 'noise',
    inputs: { min: 1, max: 1 },
    alwaysCook: true,
    params: [
      { key: 'amount', type: 'float', default: 0.15, min: 0, max: 2 },
      { key: 'period', type: 'float', default: 1, min: 0.05, max: 8 },
      { key: 'phase', type: 'float', default: 0, min: 0, max: 100 },
      { key: 'seed', type: 'float', default: 1, min: 0, max: 100 },
      { key: 'dirx', type: 'float', default: 0, min: -1, max: 1 },
      { key: 'diry', type: 'float', default: 0, min: -1, max: 1 },
      { key: 'dirz', type: 'float', default: 0, min: -1, max: 1 },
    ],
    cook(ctx) {
      const g = G.asSop(ctx.inputs[0]);
      if (!g) return { kind: 'sop', geo: G.emptyGeo() };
      return {
        kind: 'sop',
        geo: G.noiseDisplace(g, ctx.paramNum('amount'), ctx.paramNum('period'),
          ctx.paramNum('phase'), ctx.paramNum('seed'),
          [ctx.paramNum('dirx'), ctx.paramNum('diry'), ctx.paramNum('dirz')]),
      };
    },
  },

  {
    type: 'sop:copy',
    family: F,
    label: 'copy',
    inputs: { min: 2, max: 2 },
    inputLabels: ['geometry to copy', 'template points'],
    params: [],
    cook(ctx) {
      const src = G.asSop(ctx.inputs[0]);
      const tmpl = G.asSop(ctx.inputs[1]);
      if (!src || !tmpl) return { kind: 'sop', geo: src ?? G.emptyGeo() };
      return { kind: 'sop', geo: G.copyToPoints(src, tmpl) };
    },
  },

  {
    type: 'sop:skin',
    family: F,
    label: 'skin',
    inputs: { min: 1, max: 4 },
    inputLabels: ['strips to loft (equal point counts)'],
    params: [],
    cook(ctx) {
      const geos = ctx.inputs.map(G.asSop).filter((g): g is NonNullable<typeof g> => !!g);
      if (!geos.length) return { kind: 'sop', geo: G.emptyGeo() };
      const merged = geos.length > 1 ? G.mergeGeos(geos) : geos[0];
      return { kind: 'sop', geo: G.skinStrips(merged) };
    },
  },

  {
    type: 'sop:point',
    family: F,
    label: 'point',
    inputs: { min: 1, max: 1 },
    params: [{ key: 'color', type: 'color', default: [1, 1, 1, 1] }],
    cook(ctx) {
      const g = G.asSop(ctx.inputs[0]);
      if (!g) return { kind: 'sop', geo: G.emptyGeo() };
      return { kind: 'sop', geo: G.setColor(g, ctx.param('color') as [number, number, number, number]) };
    },
  },

  {
    type: 'sop:facet',
    family: F,
    label: 'facet',
    inputs: { min: 1, max: 1 },
    params: [],
    cook(ctx) {
      const g = G.asSop(ctx.inputs[0]);
      if (!g) return { kind: 'sop', geo: G.emptyGeo() };
      if (!g.triangles) return { kind: 'sop', geo: g };
      return { kind: 'sop', geo: { ...g, N: G.computeNormals(g.P, g.triangles), version: g.version } };
    },
  },

  {
    type: 'sop:add',
    family: F,
    label: 'add',
    inputs: { min: 1, max: 1 },
    params: [{ key: 'closeall', type: 'toggle', default: false }],
    cook(ctx) {
      const g = G.asSop(ctx.inputs[0]);
      if (!g) return { kind: 'sop', geo: G.emptyGeo() };
      if (!ctx.paramBool('closeall') || !g.lineStrips) return { kind: 'sop', geo: g };
      const closed = g.lineStrips.map((s) =>
        s[0] === s[s.length - 1] ? s : new Uint32Array([...s, s[0]]));
      return { kind: 'sop', geo: { ...g, lineStrips: closed, version: g.version + 0.5 } };
    },
  },

  {
    type: 'sop:switch',
    family: F,
    label: 'switch',
    inputs: { min: 1, max: 4 },
    params: [{ key: 'index', type: 'int', default: 0, min: 0, max: 3 }],
    cook(ctx) {
      const i = Math.max(0, Math.min(ctx.inputs.length - 1, Math.round(ctx.paramNum('index'))));
      const g = G.asSop(ctx.inputs[i]) ?? G.asSop(ctx.inputs.find((x) => x && x.kind === 'sop') ?? null);
      return { kind: 'sop', geo: g ?? G.emptyGeo() };
    },
  },

  {
    type: 'sop:null',
    family: F,
    label: 'null',
    inputs: { min: 1, max: 1 },
    params: [],
    cook(ctx) {
      const g = G.asSop(ctx.inputs[0]);
      return g ? { kind: 'sop', geo: g } : null;
    },
  },

  {
    type: 'sop:in',
    family: F,
    label: 'in',
    inputs: { min: 0, max: 0 },
    alwaysCook: true,
    params: [{ key: 'index', type: 'int', default: 0, min: 0, max: 7 }],
    cook(ctx) {
      const parent = ctx.node.parent;
      const ext = parent?.inputs[Math.max(0, Math.round(ctx.paramNum('index')))];
      if (!ext) return null;
      const out = ctx.engine.cook(ext);
      return out && out.kind === 'sop' ? out : null;
    },
  },

  {
    type: 'sop:out',
    family: F,
    label: 'out',
    inputs: { min: 1, max: 1 },
    params: [],
    cook(ctx) {
      const g = G.asSop(ctx.inputs[0]);
      return g ? { kind: 'sop', geo: g } : null;
    },
  },

  {
    type: 'sop:stub',
    family: F,
    label: 'stub (SOP)',
    inputs: { min: 0, max: 8 },
    params: [],
    cook(ctx) {
      const g = G.asSop(ctx.inputs.find((x) => x && x.kind === 'sop') ?? null);
      return g ? { kind: 'sop', geo: g } : null;
    },
  },
];
