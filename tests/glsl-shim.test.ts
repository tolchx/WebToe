import { describe, expect, it } from 'vitest';
import { wrapGlslTop, glslTopContractGlsl, glslTopDefaultGlsl } from '../packages/ops/src/top/glsl';

describe('GLSL TOP shim (wrapGlslTop)', () => {
  it('returns default passthrough when source is empty', () => {
    const result = wrapGlslTop('');
    expect(result.glsl).toBe(glslTopDefaultGlsl);
    expect(result.hasDynamicIndex).toBe(false);
    expect(result.uses3DInputs).toBe(false);
  });

  it('prepends the contract preamble with noise/sine functions', () => {
    const result = wrapGlslTop('void main() { fragColor = vec4(1.0); }');
    expect(result.glsl).toContain('vec4 TDOutputSwizzle(vec4 c)');
    expect(result.glsl).toContain('float tdHash(vec2 p)');
    expect(result.glsl).toContain('float tdNoise(vec2 uv)');
    expect(result.glsl).toContain('#define sTDNoiseMap');
    expect(result.glsl).toContain('#define sTDSineLookup');
    expect(result.glsl).toContain('u_TDOutputInfoRes');
    expect(result.glsl).toContain('sTD3DInputs0');
    expect(result.glsl).toContain('sTDCubeInputs0');
    expect(result.glsl).toContain('void main()');
  });

  it('rewrites sTD2DInputs[0-3] → u_tex0-3', () => {
    const src = [
      'void main() {',
      '  vec4 a = texture(sTD2DInputs[0], vUV);',
      '  vec4 b = texture(sTD2DInputs[  1 ], vUV);',
      '  vec4 c = texture(sTD2DInputs[2], vUV);',
      '  vec4 d = texture(sTD2DInputs[3], vUV);',
      '  fragColor = a + b + c + d;',
      '}',
    ].join('\n');
    const result = wrapGlslTop(src);
    expect(result.glsl).toContain('texture(u_tex0, vUV)');
    expect(result.glsl).toContain('texture(u_tex1, vUV)');
    expect(result.glsl).toContain('texture(u_tex2, vUV)');
    expect(result.glsl).toContain('texture(u_tex3, vUV)');
    expect(result.glsl).not.toMatch(/sTD2DInputs\s*\[/);
    expect(result.hasDynamicIndex).toBe(false);
  });

  it('detects dynamic sampler array indexing', () => {
    const src = [
      'void main() {',
      '  int idx = 0;',
      '  vec4 a = texture(sTD2DInputs[idx], vUV);',
      '  fragColor = a;',
      '}',
    ].join('\n');
    const result = wrapGlslTop(src);
    expect(result.hasDynamicIndex).toBe(true);
  });

  it('detects dynamic indexing with variable name containing digits', () => {
    const src = 'void main() { vec4 a = texture(sTD2DInputs[myVar0], vUV); fragColor = a; }';
    const result = wrapGlslTop(src);
    expect(result.hasDynamicIndex).toBe(true);
  });

  it('does not flag literal indices 0-3 as dynamic', () => {
    const src = 'void main() { fragColor = texture(sTD2DInputs[0], vUV) + texture(sTD2DInputs[3], vUV); }';
    const result = wrapGlslTop(src);
    expect(result.hasDynamicIndex).toBe(false);
  });

  it('detects 3D input references', () => {
    const src = 'void main() { vec4 a = texture(sTD3DInputs[0], vec3(0)); fragColor = a; }';
    const result = wrapGlslTop(src);
    expect(result.uses3DInputs).toBe(true);
  });

  it('detects cube input references', () => {
    const src = 'void main() { vec4 a = texture(sTDCubeInputs[0], vec3(0)); fragColor = a; }';
    const result = wrapGlslTop(src);
    expect(result.uses3DInputs).toBe(true);
  });

  it('rewrites uTD2DInfos[i].res → uTD2DInfoResI', () => {
    const src = [
      'void main() {',
      '  vec4 r0 = uTD2DInfos[0].res;',
      '  vec4 r1 = uTD2DInfos[ 1 ].res;',
      '  vec4 r2 = uTD2DInfos[2].res;',
      '  vec4 r3 = uTD2DInfos[3].res;',
      '  fragColor = r0 + r1 + r2 + r3;',
      '}',
    ].join('\n');
    const result = wrapGlslTop(src);
    expect(result.glsl).toContain('uTD2DInfoRes0');
    expect(result.glsl).toContain('uTD2DInfoRes1');
    expect(result.glsl).toContain('uTD2DInfoRes2');
    expect(result.glsl).toContain('uTD2DInfoRes3');
    expect(result.glsl).not.toMatch(/uTD2DInfos\s*\[/);
  });

  it('rewrites uTDOutputInfo.res → u_TDOutputInfoRes', () => {
    const src = 'void main() { vec4 info = uTDOutputInfo.res; fragColor = info; }';
    const result = wrapGlslTop(src);
    expect(result.glsl).toContain('u_TDOutputInfoRes');
    // The preamble comment mentions "uTDOutputInfo.res" for documentation,
    // so only check that the user-code portion doesn't contain raw uTDOutputInfo
    const userPortion = result.glsl.slice(result.glsl.indexOf('// --- End Shim ---'));
    expect(userPortion).not.toContain('uTDOutputInfo');
  });

  it('preserves user code after the contract preamble', () => {
    const userFn = 'float myFunc(float x) { return x * 2.0; }';
    const result = wrapGlslTop(userFn);
    expect(result.glsl).toContain(userFn);
    expect(result.glsl.indexOf('// --- End Shim ---')).toBeLessThan(result.glsl.indexOf(userFn));
  });

  it('produces a shader that ends with a newline', () => {
    const result = wrapGlslTop('void main() { fragColor = vec4(1.0); }');
    expect(result.glsl.endsWith('\n')).toBe(true);
  });

  it('handles a realistic TD GLSL shader snippet', () => {
    // Typical TD GLSL pattern: use noise map, sample inputs, output swizzle
    const src = [
      'void main() {',
      '  vec4 n = sTDNoiseMap(vUV.st);',
      '  vec4 a = texture(sTD2DInputs[0], vUV.st);',
      '  vec4 b = texture(sTD2DInputs[1], vUV.st);',
      '  vec4 res = uTD2DInfos[0].res;',
      '  float s = sTDSineLookup(u_time);',
      '  vec4 out = uTDOutputInfo.res;',
      '  vec4 mixed = mix(a, b, n.r * s);',
      '  fragColor = TDOutputSwizzle(mixed);',
      '}',
    ].join('\n');
    const result = wrapGlslTop(src);

    // All rewrites applied
    expect(result.glsl).toContain('texture(u_tex0');
    expect(result.glsl).toContain('texture(u_tex1');
    expect(result.glsl).toContain('uTD2DInfoRes0');
    expect(result.glsl).toContain('u_TDOutputInfoRes');
    // Noise/sine macros present
    expect(result.glsl).toContain('sTDNoiseMap(vUV.st)');
    expect(result.glsl).toContain('sTDSineLookup(u_time)');
    // TDOutputSwizzle identity present
    expect(result.glsl).toContain('TDOutputSwizzle');
    // No false positives
    expect(result.hasDynamicIndex).toBe(false);
    expect(result.uses3DInputs).toBe(false);
  });
});
