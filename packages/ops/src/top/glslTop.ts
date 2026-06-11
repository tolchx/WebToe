/** GLSL TOP — runs user-authored GLSL fragment shaders via the TD contract shim.
 *  Users write code using familiar TD conventions (sTD2DInputs[i], vUV,
 *  uTD2DInfos[i].res, TDOutputSwizzle) and the shim makes them work in
 *  WebGL2 ES 300.
 *
 *  ES 300 cannot dynamically index sampler arrays, so sTD2DInputs[i] is
 *  mapped to named uniforms u_tex0..u_tex3 at the JS level via wrapGlslTop().
 */
import type { CookCtx, OpSpec, TextureOut, TextureHandle } from '@webtoe/core';
import { wrapGlslTop } from './glsl';

const F = 'TOP' as const;
const DEFAULT_RES: [number, number] = [1280, 720];

function asTop(o: unknown): TextureOut | null {
  return o && typeof o === 'object' && 'kind' in o && (o as Record<string, unknown>).kind === 'top'
    ? (o as TextureOut) : null;
}

function resolution(
  ctx: CookCtx,
  fallbackW: number,
  fallbackH: number,
): { w: number; h: number } {
  if (ctx.paramStr('resmode') === 'custom') {
    return { w: ctx.paramNum('resw'), h: ctx.paramNum('resh') };
  }
  // Use first valid input's resolution
  for (const inp of ctx.inputs) {
    const t = asTop(inp);
    if (t) return { w: t.tex.width, h: t.tex.height };
  }
  return { w: fallbackW, h: fallbackH };
}

export const glslTopOps: OpSpec[] = [
  {
    type: 'top:glsl',
    family: F,
    label: 'GLSL TOP',
    inputs: { min: 0, max: 4 },
    inputLabels: ['Input 0', 'Input 1', 'Input 2', 'Input 3'],
    params: [
      // User GLSL source code
      {
        key: 'source',
        type: 'string',
        default: '',
        label: 'GLSL Source',
      },
      // Resolution
      {
        key: 'resmode',
        type: 'menu',
        default: 'input',
        menu: ['input', 'custom'],
        label: 'Resolution',
        page: 'common',
      },
      {
        key: 'resw',
        type: 'int',
        default: DEFAULT_RES[0],
        min: 1,
        max: 4096,
        label: 'Width',
        page: 'common',
      },
      {
        key: 'resh',
        type: 'int',
        default: DEFAULT_RES[1],
        min: 1,
        max: 4096,
        label: 'Height',
        page: 'common',
      },
    ],
    backends: ['webgl2'],
    alwaysCook: true,
    cook(ctx) {
      if (!ctx.gpu) {
        ctx.node.error = 'no GPU backend';
        return null;
      }

      // Read user source and compile via the TD shim
      const userCode = ctx.paramStr('source');
      const compiled = wrapGlslTop(userCode);

      // Use a shader id scoped to this node (stable across cooks for the same
      // node; the backend caches compiled shaders and recompiles on change)
      const shaderId = `${ctx.node.id}:glslTop`;
      ctx.gpu.registerShader(shaderId, { glsl: compiled });

      // Gather connected inputs as texture handles
      const connectedTexes: TextureHandle[] = [];
      for (const inp of ctx.inputs) {
        const t = asTop(inp);
        if (t) connectedTexes.push(t.tex);
      }

      const { w, h } = resolution(ctx, DEFAULT_RES[0], DEFAULT_RES[1]);

      // Build per-input info uniforms (uTD2DInfoRes0..uTD2DInfoRes3).
      // The shim declares individual vec4 uniforms for each slot.
      const inputs: TextureHandle[] = [];
      const uniforms: Record<string, number | number[]> = {};
      for (let i = 0; i < 4; i++) {
        const tex = i < connectedTexes.length ? connectedTexes[i] : null;
        if (tex) {
          inputs.push(tex);
          uniforms[`uTD2DInfoRes${i}`] = [tex.width, tex.height, 1.0 / tex.width, 1.0 / tex.height];
        } else {
          // No connected input — pass 1x1 dummy so the sampler uniform is bound
          // (WebGL requires all active sampler uniforms to have a bound texture)
          uniforms[`uTD2DInfoRes${i}`] = [1, 1, 1, 1];
        }
      }

      const tex = ctx.gpu.runPass(ctx.node, {
        shaderId,
        uniforms,
        inputs,
        output: { width: w, height: h },
      });
      return { kind: 'top', tex };
    },
  },
];
