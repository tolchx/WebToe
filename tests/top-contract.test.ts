import { describe, expect, it } from 'vitest';
import { topOps } from '@webtoe/ops';

describe('TOP backend contract (PLAN §4)', () => {
  it('every shader-driven TOP provides sources for each declared backend', () => {
    for (const op of topOps) {
      if (!op.shaders) continue; // passthrough/media ops run no own pass shader
      for (const b of op.backends ?? []) {
        if (b === 'webgl2') expect(op.shaders.glsl, `${op.type} glsl`).toBeTruthy();
        if (b === 'webgpu') expect(op.shaders.wgsl, `${op.type} wgsl`).toBeTruthy();
      }
    }
  });

  it('WGSL pilots follow the sorted vec4-padded uniform packing rule', () => {
    for (const op of topOps) {
      const wgsl = op.shaders?.wgsl;
      if (!wgsl) continue;
      const m = wgsl.match(/struct Ops \{([^}]*)\}/);
      if (!m) continue; // no op uniforms
      const fields = [...m[1].matchAll(/(\w+)\s*:\s*vec4f/g)].map((x) => x[1]);
      const sorted = [...fields].sort();
      expect(fields, `${op.type} Ops fields must be alphabetically sorted`).toEqual(sorted);
    }
  });

  it('declared WebGL2 coverage spans the full v1 op table', () => {
    const withGl = topOps.filter((o) => (o.backends ?? []).includes('webgl2'));
    expect(withGl.length).toBe(topOps.length);
  });
});
