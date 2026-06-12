import { describe, it, expect, beforeAll } from 'vitest';
import { Engine } from '@webtoe/core';
import { registerAllOps, topOps } from '@webtoe/ops';

beforeAll(() => {
  registerAllOps();
});

/**
 * Helper: cook a CHOP node for a given number of frames and return its output.
 */
function liveCook(e: Engine, node: any, frames = 1) {
  e.liveRoots.add(node);
  for (let i = 0; i < frames; i++) {
    e.frame((1 / 60) * (i + 1));
  }
  const out = node.output;
  expect(out).not.toBeNull();
  expect(out.kind).toBe('chop');
  return out;
}

// --- DAT: null (nulo) ---
describe('dat:null - nulo', () => {
  // dat:null passthroughs kind:'dat' outputs. dat:table returns kind:'chop'
  // (channels), so we test null via dat:select's fallback output.
  it('should passthrough text through select -> null chain', () => {
    const e = new Engine();
    const sel = e.graph.create('dat:select');
    // With empty dat param and no input, select returns { kind: 'dat', text: ctx.node.text }
    // Setting the text property directly on the node works for DAT select
    sel.text = 'hello world';
    const nul = e.graph.create('dat:null');
    e.graph.connect(sel, nul, 0);
    e.liveRoots.add(nul);
    e.frame(0);
    const out = nul.output as { kind: string; text: string };
    expect(out).not.toBeNull();
    expect(out.kind).toBe('dat');
    expect(out.text).toBe('hello world');
  });

  it('should return empty text when no input is connected', () => {
    const e = new Engine();
    const nul = e.graph.create('dat:null');
    e.liveRoots.add(nul);
    e.frame(1 / 60);
    const out = nul.output as { kind: string; text: string };
    expect(out).not.toBeNull();
    expect(out.kind).toBe('dat');
    expect(out.text).toBe('');
  });

  it('should prevent connecting CHOP to DAT (family mismatch)', () => {
    const e = new Engine();
    const constant = e.graph.create('chop:constant');
    const nul = e.graph.create('dat:null');
    expect(() => e.graph.connect(constant, nul, 0)).toThrow('family mismatch');
  });
});

// --- CHOP: constant ---
describe('chop:constant - constant', () => {
  it('should produce default channels', () => {
    const e = new Engine();
    const constant = e.graph.create('chop:constant');
    const out = liveCook(e, constant);
    expect(out.channels.length).toBe(1);
    expect(out.channels[0].name).toBe('chan1');
    expect(out.channels[0].data[0]).toBe(0);
  });

  it('should produce custom named channels with values', () => {
    const e = new Engine();
    const constant = e.graph.create('chop:constant');
    constant.params.get('name0')!.value = 'speed';
    constant.params.get('value0')!.value = 1.5;
    constant.params.get('name1')!.value = 'amp';
    constant.params.get('value1')!.value = 0.75;
    constant.params.get('name2')!.value = 'freq';
    constant.params.get('value2')!.value = 440;
    const out = liveCook(e, constant);
    expect(out.channels.length).toBe(3);
    const speed = out.channels.find((c: any) => c.name === 'speed');
    expect(speed).toBeDefined();
    expect(speed!.data[0]).toBe(1.5);
    const amp = out.channels.find((c: any) => c.name === 'amp');
    expect(amp).toBeDefined();
    expect(amp!.data[0]).toBe(0.75);
    const freq = out.channels.find((c: any) => c.name === 'freq');
    expect(freq).toBeDefined();
    expect(freq!.data[0]).toBe(440);
  });

  it('should skip channels with empty names', () => {
    const e = new Engine();
    const constant = e.graph.create('chop:constant');
    constant.params.get('name0')!.value = '';
    constant.params.get('name1')!.value = 'valid';
    constant.params.get('value1')!.value = 42;
    const out = liveCook(e, constant);
    const valid = out.channels.find((c: any) => c.name === 'valid');
    expect(valid).toBeDefined();
    expect(valid!.data[0]).toBe(42);
  });
});

// --- TOP: blur ---
describe('top:blur - blur', () => {
  it('should be registered with correct spec and defaults', () => {
    const e = new Engine();
    const blur = e.graph.create('top:blur');
    expect(blur).toBeDefined();
    expect(blur.type).toBe('top:blur');
    expect(blur.params.get('size')!.value).toBe(5);
    expect(blur.params.get('passes')!.value).toBe(1);
    expect(blur.params.get('direction')!.value).toBe('both');
  });

  it('should accept parameter changes', () => {
    const e = new Engine();
    const blur = e.graph.create('top:blur');
    blur.params.get('size')!.value = 8;
    blur.params.get('passes')!.value = 2;
    blur.params.get('direction')!.value = 'horizontal';
    expect(blur.params.get('size')!.value).toBe(8);
    expect(blur.params.get('passes')!.value).toBe(2);
    expect(blur.params.get('direction')!.value).toBe('horizontal');
  });
});

// --- TOP: reorder ---
describe('top:reorder - reorder', () => {
  it('should be registered with correct defaults', () => {
    const e = new Engine();
    const reorder = e.graph.create('top:reorder');
    expect(reorder).toBeDefined();
    expect(reorder.type).toBe('top:reorder');
    expect(reorder.params.get('outr')!.value).toBe('r');
    expect(reorder.params.get('outg')!.value).toBe('g');
    expect(reorder.params.get('outb')!.value).toBe('b');
    expect(reorder.params.get('outa')!.value).toBe('a');
  });

  it('should accept channel swap configuration', () => {
    const e = new Engine();
    const reorder = e.graph.create('top:reorder');
    reorder.params.get('outr')!.value = 'b';
    reorder.params.get('outb')!.value = 'r';
    expect(reorder.params.get('outr')!.value).toBe('b');
    expect(reorder.params.get('outb')!.value).toBe('r');
    expect(reorder.params.get('outg')!.value).toBe('g');
    expect(reorder.params.get('outa')!.value).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// TOP Contract Tests (blur + reorder)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// TOP Contract Tests (blur + reorder) - spec validation without GPU
// ---------------------------------------------------------------------------
describe('top contract: blur and reorder', () => {
  const blurSpec = topOps.find((op: any) => op.type === 'top:blur')!;
  const reorderSpec = topOps.find((op: any) => op.type === 'top:reorder')!;

  it('should have glsl and wgsl shader sources', () => {
    [blurSpec, reorderSpec].forEach((spec) => {
      expect(spec.shaders).toBeDefined();
      expect(spec.shaders!.glsl).toBeDefined();
      expect(typeof spec.shaders!.glsl).toBe('string');
      expect(spec.shaders!.glsl!.length).toBeGreaterThan(0);
      expect(spec.shaders!.wgsl).toBeDefined();
      expect(typeof spec.shaders!.wgsl).toBe('string');
      expect(spec.shaders!.wgsl!.length).toBeGreaterThan(0);
    });
  });

  it('should declare webgl2 and webgpu backends', () => {
    [blurSpec, reorderSpec].forEach((spec) => {
      expect(spec.backends).toContain('webgl2');
      expect(spec.backends).toContain('webgpu');
    });
  });

  it('blur: params should have correct types, defaults and ranges', () => {
    const findP = (key: string) => blurSpec.params.find((p: any) => p.key === key)!;
    const size = findP('size');
    expect(size.type).toBe('float');
    expect(size.default).toBe(5);
    expect(size.min).toBe(0);
    expect(size.max).toBe(15);
    const passes = findP('passes');
    expect(passes.type).toBe('int');
    expect(passes.default).toBe(1);
    expect(passes.min).toBe(1);
    expect(passes.max).toBe(4);
    const dir = findP('direction');
    expect(dir.type).toBe('menu');
    expect(dir.default).toBe('both');
    expect(dir.menu).toEqual(['both', 'horizontal', 'vertical']);
  });

  it('reorder: params should have correct types and menu options', () => {
    const expectedMenu = ['r', 'g', 'b', 'a', 'zero', 'one'];
    for (const key of ['outr', 'outg', 'outb', 'outa']) {
      const param = reorderSpec.params.find((p: any) => p.key === key)!;
      expect(param.type).toBe('menu');
      const defaults: Record<string, string> = { outr: 'r', outg: 'g', outb: 'b', outa: 'a' };
      expect(param.default).toBe(defaults[key]);
      expect(param.menu).toEqual(expectedMenu);
    }
  });

  it('should require exactly 1 input', () => {
    expect(blurSpec.inputs.min).toBe(1);
    expect(blurSpec.inputs.max).toBe(1);
    expect(reorderSpec.inputs.min).toBe(1);
    expect(reorderSpec.inputs.max).toBe(1);
  });

  it('cook without GPU should handle missing context gracefully', () => {
    const e = new Engine();
    const blur = e.graph.create('top:blur');
    const reorder = e.graph.create('top:reorder');
    e.liveRoots.add(blur);
    e.liveRoots.add(reorder);
    expect(() => e.frame(0)).not.toThrow();
  });
});

// --- Edge cases ---
describe('edge cases', () => {
  // --- dat:null bypass ---
  describe('dat:null bypass', () => {
    it('should passthrough input unchanged when bypass is enabled', () => {
      const e = new Engine();
      const sel = e.graph.create('dat:select');
      sel.text = 'bypass test';
      const nul = e.graph.create('dat:null');
      nul.flags.bypass = true;
      e.graph.connect(sel, nul, 0);
      e.liveRoots.add(nul);
      e.frame(0);
      const raw = nul.output;
      expect(raw).not.toBeNull();
      const out = raw as { kind: string; text: string };
      expect(out.kind).toBe('dat');
      expect(out.text).toBe('bypass test');
    });

    it('should return null when bypass is enabled and no input is connected', () => {
      const e = new Engine();
      const nul = e.graph.create('dat:null');
      nul.flags.bypass = true;
      e.liveRoots.add(nul);
      e.frame(0);
      expect(nul.output).toBeNull();
    });
  });

  // --- chop:constant extreme values ---
  describe('chop:constant extreme values', () => {
    it('should accept value at min -10', () => {
      const e = new Engine();
      const constant = e.graph.create('chop:constant');
      constant.params.get('name0')!.value = 'chan';
      constant.params.get('value0')!.value = -10;
      const out = liveCook(e, constant) as any;
      expect(out.channels.length).toBe(1);
      expect(out.channels[0].name).toBe('chan');
      expect(out.channels[0].data[0]).toBe(-10);
    });

    it('should accept value at max 10', () => {
      const e = new Engine();
      const constant = e.graph.create('chop:constant');
      constant.params.get('name0')!.value = 'chan';
      constant.params.get('value0')!.value = 10;
      const out = liveCook(e, constant);
      expect(out.channels.length).toBe(1);
      expect(out.channels[0].name).toBe('chan');
      expect(out.channels[0].data[0]).toBe(10);
    });

    it('should produce 4 channels when all names are set (NAME_MAX)', () => {
      const e = new Engine();
      const constant = e.graph.create('chop:constant');
      constant.params.get('name0')!.value = 'ch0';
      constant.params.get('value0')!.value = 1;
      constant.params.get('name1')!.value = 'ch1';
      constant.params.get('value1')!.value = 2;
      constant.params.get('name2')!.value = 'ch2';
      constant.params.get('value2')!.value = 3;
      constant.params.get('name3')!.value = 'ch3';
      constant.params.get('value3')!.value = 4;
      const out = liveCook(e, constant);
      expect(out.channels.length).toBe(4);
      for (let i = 0; i < 4; i++) {
        expect(out.channels[i].name).toBe('ch' + i);
        expect(out.channels[i].data[0]).toBe(i + 1);
      }
    });
  });


// --- connectExpr tests ---
describe('graph.connectExpr', () => {
  it('should set expression with channel name on target param', () => {
    const e = new Engine();
    const constant = e.graph.create('chop:constant');
    const reorder = e.graph.create('top:reorder');
    constant.params.get('name0')!.value = 'chan1';
    constant.params.get('value0')!.value = 0.5;
    const expr = e.graph.connectExpr(constant, reorder, 'size', 'chan1');
    expect(expr).toContain('chan1');
    expect(expr).toContain("op('");
    const param = reorder.params.get('size')!;
    expect(param.mode).toBe('expr');
    expect(param.expr).toContain("op('");
    expect(param.expr).toContain("chan1");
    expect(param.expr).toContain("']");
  });

  it('should set expression without channel name when omitted', () => {
    const e = new Engine();
    const constant = e.graph.create('chop:constant');
    const reorder = e.graph.create('top:reorder');
    const expr2 = e.graph.connectExpr(constant, reorder, 'size');
    expect(expr2).toContain("op('");
    expect(expr2.endsWith("'")).toBe(false);
    const param = reorder.params.get('size')!;
    expect(param.mode).toBe('expr');
    expect(param.expr).toContain("op('");
    // No trailing quote bug - should not end with extra quote
    expect(param.expr!.endsWith("'")).toBe(false);
  });

  it('should store expression with channel name on param metadata', () => {
    const e = new Engine();
    const constant = e.graph.create('chop:constant');
    constant.params.get('name0')!.value = 'amp';
    constant.params.get('value0')!.value = 0.75;
    const nullNode = e.graph.create('dat:null');
    e.graph.connectExpr(constant, nullNode, 'text', 'amp');
    const param = nullNode.params.get('text')!;
    expect(param.mode).toBe('expr');
    expect(param.expr).toContain('amp');
    expect(param.expr).toContain("op('");
  });

  it('should use pathOf to generate correct path', () => {
    const e = new Engine();
    const container = e.graph.create('comp:container');
    const inner = e.graph.create('chop:constant', container);
    const nullNode = e.graph.create('dat:null');
    e.graph.connectExpr(inner, nullNode, 'text');
    const param = nullNode.params.get('text')!;
    expect(param.mode).toBe('expr');
        // Verify the path includes the container hierarchy (auto-named containerX)
    expect(param.expr).toMatch(/container\d+/);
    expect(param.expr).toContain('constant1');
  });
  it('should throw if source node is not in the graph', () => {
    const e = new Engine();
    const fakeNode = { id: 'fake', name: 'fake', type: 'chop:constant', children: new Map(), inputs: [], flags: { bypass: false, display: false } } as any;
    const nullNode = e.graph.create('dat:null');
    expect(() => e.graph.connectExpr(fakeNode, nullNode, 'text', 'chan1')).toThrow('not in the graph');

  });

  it('should resolve expression value when cooked end-to-end', () => {
    const e = new Engine();
    const source = e.graph.create('chop:constant');
    source.params.get('name0')!.value = 'amp';
    source.params.get('value0')!.value = 0.75;
    const target = e.graph.create('chop:constant');
    e.graph.connectExpr(source, target, 'value0', 'amp');
    // Cook source first to ensure its channel output is available
    e.liveRoots.add(source);
    e.frame(1 / 60);
    // Then cook target to verify expression resolves during cooking
    e.liveRoots.add(target);
    e.frame(1 / 60);
    // Verify the expression resolves via engine param resolution
    const resolved = e.param(target, 'value0');
    expect(resolved).toBe(0.75);
  });

  });
});