import { beforeAll, describe, expect, it } from 'vitest';
import { Engine, graphFromJSON, graphToJSON, FORMAT_VERSION, LoadError } from '@webtoe/core';
import { registerAllOps } from '@webtoe/ops';

beforeAll(() => registerAllOps());

function buildSample(): Engine {
  const e = new Engine();
  const comp = e.graph.create('comp:container', undefined, 'scene');
  const lfo = e.graph.create('chop:lfo', comp, 'wobble');
  lfo.params.set('frequency', { mode: 'expr', value: 1, expr: 'time.seconds % 2' });
  lfo.pos = { x: 100, y: 50 };
  const lag = e.graph.create('chop:lag', comp, 'smooth');
  lag.flags.display = true;
  e.graph.connect(lfo, lag, 0);
  const txt = e.graph.create('dat:text', undefined, 'notes');
  txt.text = 'hello\nworld';
  return e;
}

describe('.webtoe.json serialization', () => {
  it('round-trips losslessly', () => {
    const e = buildSample();
    const j1 = graphToJSON(e.graph);
    const g2 = graphFromJSON(JSON.parse(JSON.stringify(j1)));
    const j2 = graphToJSON(g2);
    expect(j2).toEqual(j1);
    expect(j1.version).toBe(FORMAT_VERSION);
  });

  it('restores wires, hierarchy, expressions, flags and text', () => {
    const e = buildSample();
    const g2 = graphFromJSON(graphToJSON(e.graph));
    const scene = g2.resolve('/scene', g2.root)!;
    const wobble = g2.resolve('/scene/wobble', g2.root)!;
    const smooth = g2.resolve('/scene/smooth', g2.root)!;
    expect(scene.children?.size).toBe(2);
    expect(smooth.inputs[0]).toBe(wobble);
    expect(smooth.flags.display).toBe(true);
    expect(wobble.params.get('frequency')).toMatchObject({ mode: 'expr', expr: 'time.seconds % 2' });
    expect(g2.resolve('/notes', g2.root)?.text).toBe('hello\nworld');
  });

  it('falls back to family stubs for unknown types', () => {
    const e = buildSample();
    const j = graphToJSON(e.graph);
    j.root.nodes.push({ name: 'mystery', type: 'top:hologram', family: 'TOP', pos: [0, 0] });
    const g2 = graphFromJSON(j);
    const stub = g2.resolve('/mystery', g2.root)!;
    expect(stub.type).toBe('top:stub');
    expect(stub.foreignType).toBe('top:hologram');
  });

  it('rejects foreign or future files with a clear error', () => {
    expect(() => graphFromJSON({ hello: 1 })).toThrow(LoadError);
    expect(() => graphFromJSON({ app: 'webtoe', version: 999, root: { nodes: [] } })).toThrow(/newer/);
  });
});
