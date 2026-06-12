/** GLSL TOP — runs user-authored GLSL fragment shaders via the TD contract shim.
 *  Users write code using familiar TD conventions (sTD2DInputs[i], vUV,
 *  uTD2DInfos[i].res, TDOutputSwizzle, sTDNoiseMap, sTDSineLookup,
 *  uTDOutputInfo.res) and the shim makes them work in WebGL2 ES 300.
 *
 *  ES 300 cannot dynamically index sampler arrays, so sTD2DInputs[i] is
 *  mapped to named uniforms u_tex0..u_tex3 at the JS level via wrapGlslTop().
 *  sTDNoiseMap and sTDSineLookup are provided as procedural functions.
 *
 *  WebGPU: GLSL source is not auto-translated. Users write WGSL directly
 *  when targeting WebGPU; GLSL-only source shows a stub on WebGPU.
 */
import type { CookCtx, OpSpec, TextureOut, TextureHandle } from '@webtoe/core';
import { wrapGlslTop, type GlslTopWrapResult } from './glsl';

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
      // Mode: pixel (fragment shader) or compute (WebGPU only, R5)
      {
        key: 'mode',
        type: 'menu',
        default: 'pixel',
        menu: ['pixel', 'compute'],
        label: 'Mode',
        page: 'common',
      },
    ],
    backends: ['webgl2', 'webgpu'],
    alwaysCook: true,
    cook(ctx) {
      if (!ctx.gpu) {
        ctx.node.error = 'no GPU backend';
        return null;
      }

      const { w, h } = resolution(ctx, DEFAULT_RES[0], DEFAULT_RES[1]);
      const backendName = ctx.gpu.name;
      const userCode = ctx.paramStr('source');
      const mode = ctx.paramStr('mode');

      // Compute mode is WebGPU-only (planned for R5)
      if (mode === 'compute') {
        if (backendName === 'webgl2') {
          ctx.node.error = 'compute mode requires WebGPU (coming in R5)';
          return null;
        }
        ctx.node.error = 'compute mode not yet implemented (R5)';
        return null;
      }

      // --- WebGL2 path: compile GLSL via the TD shim ---
      if (backendName === 'webgl2') {
        const compiled: GlslTopWrapResult = wrapGlslTop(userCode);

        // Report unsupported features as node warnings (non-fatal)
        const warnings: string[] = [];
        if (compiled.hasDynamicIndex) {
          warnings.push('dynamic sTD2DInputs[index] not supported — use literal indices (0-3)');
        }
        if (compiled.uses3DInputs) {
          warnings.push('sTD3DInputs/sTDCubeInputs are stubs — 3D textures not available');
        }
        ctx.node.error = warnings.length ? warnings.join('; ') : null;

        const shaderId = `${ctx.node.id}:glslTop`;
        ctx.gpu.registerShader(shaderId, { glsl: compiled.glsl });

        // Gather connected inputs as texture handles
        const connectedTexes: TextureHandle[] = [];
        for (const inp of ctx.inputs) {
          const t = asTop(inp);
          if (t) connectedTexes.push(t.tex);
        }

        // Build per-input info uniforms + output info
        const inputs: TextureHandle[] = [];
        const uniforms: Record<string, number | number[]> = {};
        for (let i = 0; i < 4; i++) {
          const tex = i < connectedTexes.length ? connectedTexes[i] : null;
          if (tex) {
            inputs.push(tex);
            uniforms[`uTD2DInfoRes${i}`] = [tex.width, tex.height, 1.0 / tex.width, 1.0 / tex.height];
          } else {
            // No connected input — pass 1x1 dummy so the sampler uniform is bound
            uniforms[`uTD2DInfoRes${i}`] = [1, 1, 1, 1];
          }
        }
        // Output resolution info (TD's uTDOutputInfo.res = {w, h, 1/w, 1/h})
        uniforms['u_TDOutputInfoRes'] = [w, h, 1.0 / w, 1.0 / h];

        const tex = ctx.gpu.runPass(ctx.node, {
          shaderId,
          uniforms,
          inputs,
          output: { width: w, height: h },
        });
        return { kind: 'top', tex };
      }

      // --- WebGPU path: user writes WGSL directly ---
      // GLSL → WGSL auto-translation is deferred; users target WebGPU
      // by writing WGSL source directly. GLSL-only code shows a stub.
      if (backendName === 'webgpu') {
        // If user code looks like GLSL (has #version, void main, etc.), show stub
        const looksLikeGlsl = /#version|void\s+main\s*\(/.test(userCode) &&
          !/struct\s+\w+\s*\{|@fragment|@vertex/.test(userCode);
        if (looksLikeGlsl || !userCode.trim()) {
          ctx.node.error = 'WebGPU requires WGSL source — GLSL→WGSL translation not yet available (use WebGL2 backend for GLSL shaders)';
          return { kind: 'top', tex: ctx.gpu.runPass(ctx.node, {
            shaderId: 'top:placeholder',
            uniforms: { u_tint: [0.3, 0.3, 0.35, 1] },
            inputs: [],
            output: { width: w, height: h },
          })};
        }

        // User wrote WGSL directly — register and run
        const shaderId = `${ctx.node.id}:glslTop`;
        ctx.gpu.registerShader(shaderId, { wgsl: userCode });

        const tex = ctx.gpu.runPass(ctx.node, {
          shaderId,
          uniforms: {},
          inputs: [],
          output: { width: w, height: h },
        });
        return { kind: 'top', tex };
      }

      return null;
    },
  },
];
