import { beforeAll, describe, expect, it } from 'vitest';
import { Engine, type ChannelSet } from '@webtoe/core';
import { registerAllOps, sample } from '@webtoe/ops';

beforeAll(() => registerAllOps());

describe('COMP in/out tunneling', () => {
  it('flows data across a COMP boundary through in/out children', () => {
    const e = new Engine();
    const g = e.graph;
    const src = g.create('chop:constant');
    src.params.get('value0')!.value = 5;

    const comp = g.create('comp:container', undefined, 'box');
    const tin = g.create('chop:in', comp, 'in1');
    const math = g.create('chop:math', comp);
    math.params.get('gain')!.value = 2;
    const tout = g.create('chop:out', comp, 'out1');
    g.connect(tin, math, 0);
    g.connect(math, tout, 0);

    g.connect(src, comp, 0); // COMP-boundary wire

    e.liveRoots.add(comp);
    e.frame(0);
    const out = comp.output as ChannelSet;
    expect(out?.kind).toBe('chop');
    expect(sample(out, 'chan1')).toBe(10);
  });

  it('respects the in-tunnel index parameter', () => {
    const e = new Engine();
    const g = e.graph;
    const a = g.create('chop:constant');
    a.params.get('value0')!.value = 1;
    const b = g.create('chop:constant');
    b.params.get('value0')!.value = 7;

    const comp = g.create('comp:container');
    const tin1 = g.create('chop:in', comp, 'in1');
    const tin2 = g.create('chop:in', comp, 'in2');
    tin2.params.get('index')!.value = 1;
    const merge = g.create('chop:merge', comp);
    const tout = g.create('chop:out', comp, 'out1');
    g.connect(tin1, merge, 0);
    g.connect(tin2, merge, 1);
    g.connect(merge, tout, 0);
    g.connect(a, comp, 0);
    g.connect(b, comp, 1);

    e.liveRoots.add(comp);
    e.frame(0);
    const out = comp.output as ChannelSet;
    expect(out.channels.length).toBe(2);
    expect(out.channels[1].data[0]).toBe(7);
  });

  it('container input capacity follows its in-children', () => {
    const e = new Engine();
    const g = e.graph;
    const comp = g.create('comp:container');
    expect(g.inputCapacity(comp)).toBe(1); // wireable before tunnels exist
    g.create('chop:in', comp, 'in1');
    g.create('chop:in', comp, 'in2');
    expect(g.inputCapacity(comp)).toBe(2);
  });

  it('falls back to the display child when no out-tunnel exists', () => {
    const e = new Engine();
    const g = e.graph;
    const comp = g.create('comp:container');
    const c = g.create('chop:constant', comp);
    c.params.get('value0')!.value = 3;
    c.flags.display = true;
    e.liveRoots.add(comp);
    e.frame(0);
    expect(sample(comp.output as ChannelSet, 'chan1')).toBe(3);
  });
});
