import { beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '@webtoe/core';
import { registerAllOps } from '@webtoe/ops';

beforeAll(() => registerAllOps());

describe('graph structure', () => {
  it('creates nodes with TD-style unique names', () => {
    const e = new Engine();
    const a = e.graph.create('chop:noise');
    const b = e.graph.create('chop:noise');
    const c = e.graph.create('chop:noise', undefined, 'noise1');
    expect(a.name).toBe('noise1');
    expect(b.name).toBe('noise2');
    expect(c.name).toBe('noise3');
  });

  it('rejects cross-family wires and bad indices', () => {
    const e = new Engine();
    const lfo = e.graph.create('chop:lfo');
    const txt = e.graph.create('dat:text');
    const math = e.graph.create('chop:math');
    expect(() => e.graph.connect(txt, math, 0)).toThrow(/family/);
    expect(() => e.graph.connect(lfo, math, 99)).toThrow(/out of range/);
    e.graph.connect(lfo, math, 0);
    expect(math.inputs[0]).toBe(lfo);
  });

  it('builds hierarchy and resolves TD-style paths', () => {
    const e = new Engine();
    const comp = e.graph.create('comp:container', undefined, 'scene');
    const inner = e.graph.create('chop:lfo', comp, 'wob');
    const top = e.graph.create('chop:constant', undefined, 'global');

    expect(e.graph.pathOf(inner)).toBe('/scene/wob');
    // from inner's network (inside comp)
    expect(e.graph.resolve('wob', inner)).toBe(inner);
    expect(e.graph.resolve('../global', inner)).toBe(top);
    expect(e.graph.resolve('/scene/wob', top)).toBe(inner);
    expect(e.graph.resolve('scene/wob', top)).toBe(inner);
    expect(e.graph.resolve('missing', top)).toBeNull();
  });

  it('delete detaches wires everywhere', () => {
    const e = new Engine();
    const a = e.graph.create('chop:lfo');
    const m = e.graph.create('chop:math');
    e.graph.connect(a, m, 0);
    e.graph.delete(a);
    expect(m.inputs[0]).toBeNull();
    expect(e.graph.resolve('lfo1', m)).toBeNull();
  });

  it('rename keeps names unique', () => {
    const e = new Engine();
    const a = e.graph.create('chop:lfo'); // lfo1
    const b = e.graph.create('chop:lfo'); // lfo2
    e.graph.rename(b, 'lfo1');
    expect(b.name).not.toBe(a.name);
    expect(b.name).toMatch(/^lfo\d+$/);
  });
});
