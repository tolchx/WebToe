import type { MaterialSpec, OpSpec } from '@webtoe/core';

const F = 'MAT' as const;

function asMat(out: import('@webtoe/core').OpOutput): MaterialSpec | null {
  return out && out.kind === 'mat' ? out.mat : null;
}

function resolveMap(ctx: import('@webtoe/core').CookCtx, key: string): import('@webtoe/core').TextureHandle | null {
  const path = ctx.paramStr(key);
  if (!path) return null;
  const target = ctx.engine.graph.resolve(path, ctx.node);
  if (!target) return null;
  const out = ctx.engine.cook(target);
  return out && out.kind === 'top' ? out.tex : null;
}

export const matOps: OpSpec[] = [
  {
    type: 'mat:constant',
    family: F,
    label: 'constant',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'color', type: 'color', default: [1, 1, 1, 1] },
      { key: 'map', label: 'color map (TOP)', type: 'string', default: '' },
    ],
    cook(ctx) {
      return {
        kind: 'mat',
        mat: { shading: 'constant', color: ctx.param('color') as MaterialSpec['color'], map: resolveMap(ctx, 'map') },
      };
    },
  },

  {
    type: 'mat:lit',
    family: F,
    label: 'lit (phong/pbr)',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'basecolor', type: 'color', default: [0.8, 0.8, 0.8, 1] },
      { key: 'map', label: 'base color map (TOP)', type: 'string', default: '' },
      { key: 'metallic', type: 'float', default: 0, min: 0, max: 1 },
      { key: 'roughness', type: 'float', default: 0.6, min: 0.02, max: 1 },
      { key: 'emitr', type: 'float', default: 0, min: 0, max: 4 },
      { key: 'emitg', type: 'float', default: 0, min: 0, max: 4 },
      { key: 'emitb', type: 'float', default: 0, min: 0, max: 4 },
    ],
    cook(ctx) {
      return {
        kind: 'mat',
        mat: {
          shading: 'lit',
          color: ctx.param('basecolor') as MaterialSpec['color'],
          map: resolveMap(ctx, 'map'),
          metallic: ctx.paramNum('metallic'),
          roughness: ctx.paramNum('roughness'),
          emit: [ctx.paramNum('emitr'), ctx.paramNum('emitg'), ctx.paramNum('emitb')],
        },
      };
    },
  },

  {
    type: 'mat:line',
    family: F,
    label: 'line',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'color', type: 'color', default: [1, 1, 1, 1] },
      { key: 'width', label: 'width (clamped to 1px in v1)', type: 'float', default: 1, min: 0, max: 20 },
      { key: 'pointsize', type: 'float', default: 3, min: 0, max: 64 },
    ],
    cook(ctx) {
      return {
        kind: 'mat',
        mat: {
          shading: 'line',
          color: ctx.param('color') as MaterialSpec['color'],
          lineWidth: ctx.paramNum('width'),
          pointSize: ctx.paramNum('pointsize'),
        },
      };
    },
  },

  {
    type: 'mat:pointsprite',
    family: F,
    label: 'point sprite',
    inputs: { min: 0, max: 0 },
    params: [
      { key: 'color', type: 'color', default: [1, 1, 1, 1] },
      { key: 'pointsize', type: 'float', default: 6, min: 0.5, max: 128 },
    ],
    cook(ctx) {
      return {
        kind: 'mat',
        mat: { shading: 'points', color: ctx.param('color') as MaterialSpec['color'], pointSize: ctx.paramNum('pointsize') },
      };
    },
  },

  {
    type: 'mat:wireframe',
    family: F,
    label: 'wireframe',
    inputs: { min: 0, max: 0 },
    params: [{ key: 'color', type: 'color', default: [1, 1, 1, 1] }],
    cook(ctx) {
      return { kind: 'mat', mat: { shading: 'wireframe', color: ctx.param('color') as MaterialSpec['color'] } };
    },
  },

  {
    type: 'mat:switch',
    family: F,
    label: 'switch',
    inputs: { min: 1, max: 4 },
    params: [{ key: 'index', type: 'int', default: 0, min: 0, max: 3 }],
    cook(ctx) {
      const i = Math.max(0, Math.min(ctx.inputs.length - 1, Math.round(ctx.paramNum('index'))));
      const m = asMat(ctx.inputs[i]) ?? asMat(ctx.inputs.find((x) => x && x.kind === 'mat') ?? null);
      return m ? { kind: 'mat', mat: m } : null;
    },
  },

  {
    type: 'mat:null',
    family: F,
    label: 'null',
    inputs: { min: 1, max: 1 },
    params: [],
    cook(ctx) {
      const m = asMat(ctx.inputs[0]);
      return m ? { kind: 'mat', mat: m } : null;
    },
  },

  {
    type: 'mat:stub',
    family: F,
    label: 'stub (MAT)',
    inputs: { min: 0, max: 8 },
    params: [],
    cook(ctx) {
      const m = asMat(ctx.inputs.find((x) => x && x.kind === 'mat') ?? null);
      return m ? { kind: 'mat', mat: m } : null;
    },
  },
];
