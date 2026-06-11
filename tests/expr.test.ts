import { describe, expect, it } from 'vitest';
import { compileExpr, makeChannelIndexable, translateTdExpr, type ExprScope } from '@webtoe/core';

const scope = (over: Partial<ExprScope> = {}): ExprScope => ({
  time: { seconds: 2, frame: 120, delta: 1 / 60, fps: 60 },
  me: { name: 'n', path: '/n' },
  op: () => makeChannelIndexable(() => 0.5),
  ...over,
});

describe('expression evaluator', () => {
  it('evaluates math with time scope', () => {
    expect(compileExpr('time.seconds * 0.5')(scope())).toBe(1);
    expect(compileExpr('sin(0)')(scope())).toBe(0);
    expect(compileExpr('clamp(5, 0, 2)')(scope())).toBe(2);
    expect(compileExpr('floor(time.frame / 100)')(scope())).toBe(1);
  });

  it('reads channels through op()', () => {
    const v = compileExpr("op('lfo1')['chan1'] * 2")(scope());
    expect(v).toBe(1);
    const byIndex = compileExpr("op('lfo1')[0] + 1")(scope());
    expect(byIndex).toBe(1.5);
  });

  it('rand is deterministic', () => {
    const a = compileExpr('rand(42)')(scope());
    const b = compileExpr('rand(42)')(scope());
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });

  it('throws on syntax errors at compile time', () => {
    expect(() => compileExpr('1 +')).toThrow();
  });
});

describe('TD Python translation', () => {
  it('translates the supported idioms', () => {
    expect(translateTdExpr('absTime.seconds*0.2')).toEqual({ ok: true, expr: 'time.seconds*0.2' });
    expect(translateTdExpr('me.time.frame + 1')).toEqual({ ok: true, expr: 'time.frame + 1' });
    expect(translateTdExpr('math.sin(absTime.seconds)*math.pi')).toEqual({
      ok: true,
      expr: 'sin(time.seconds)*PI',
    });
    const t = translateTdExpr("op('constant1')['width'] / 2");
    expect(t.ok).toBe(true);
  });

  it('refuses what it cannot faithfully translate', () => {
    expect(translateTdExpr("op('base1').par.tx").ok).toBe(false);
    expect(translateTdExpr('[x for x in range(3)]').ok).toBe(false);
    expect(translateTdExpr('1 if me.digits else 0').ok).toBe(false);
    expect(translateTdExpr('absTime.frame // 2').ok).toBe(false); // python floor-div
    expect(translateTdExpr("str(me.name)").ok).toBe(false);
    expect(translateTdExpr('').ok).toBe(false);
  });
});
