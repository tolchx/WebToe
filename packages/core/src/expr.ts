/**
 * Parameter expressions. Grammar = a JS expression evaluated against a fixed,
 * explicit scope (time, me, op(), math whitelist). Compiled once per source
 * string. This is user-authored patch code — the same trust model as any
 * browser patching environment; it is NOT a security sandbox.
 *
 * Imported TouchDesigner (Python) expressions are never executed: they are
 * either translated to this grammar by `translateTdExpr` or kept inert.
 */

export type CompiledExpr = (scope: ExprScope) => unknown;

export interface ExprScope {
  time: { seconds: number; frame: number; delta: number; fps: number };
  me: { name: string; path: string };
  op: (path: string) => ChannelIndexable;
  [k: string]: unknown;
}

/** op('x') result: index by channel name or number → sample value. */
export type ChannelIndexable = Record<string | number, number>;

const MATH_SCOPE: Record<string, unknown> = {
  PI: Math.PI,
  abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
  min: Math.min, max: Math.max, pow: Math.pow, sqrt: Math.sqrt,
  exp: Math.exp, log: Math.log, sign: Math.sign,
  clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
  fract: (v: number) => v - Math.floor(v),
  lerp: (a: number, b: number, t: number) => a + (b - a) * t,
  /** deterministic 0..1 hash of a seed */
  rand: (seed: number) => {
    const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  },
};

const SCOPE_KEYS = ['time', 'me', 'op', ...Object.keys(MATH_SCOPE)];

const cache = new Map<string, CompiledExpr>();

export class ExprError extends Error {}

export function compileExpr(src: string): CompiledExpr {
  const hit = cache.get(src);
  if (hit) return hit;
  let fn: (...args: unknown[]) => unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    fn = new Function(...SCOPE_KEYS, `"use strict"; return (${src});`) as (...args: unknown[]) => unknown;
  } catch (e) {
    throw new ExprError(`syntax error in expression: ${(e as Error).message}`);
  }
  const compiled: CompiledExpr = (scope) => {
    const args = SCOPE_KEYS.map((k) => (k in scope ? scope[k] : MATH_SCOPE[k]));
    return fn(...args);
  };
  cache.set(src, compiled);
  return compiled;
}

export function makeChannelIndexable(get: (key: string | number) => number): ChannelIndexable {
  return new Proxy({} as ChannelIndexable, {
    get: (_t, prop) => {
      if (typeof prop === 'symbol') return undefined;
      const asNum = Number(prop);
      return get(Number.isNaN(asNum) ? prop : asNum);
    },
  });
}

// ---------------------------------------------------------------------------
// TouchDesigner Python → WebToe expression translation (import-time only)
// ---------------------------------------------------------------------------

export interface TdTranslation {
  ok: boolean;
  expr?: string;
}

/** Patterns that mark an expression as beyond the translatable subset. */
const TD_UNSUPPORTED = [
  /\.par\b/, /\bparent\(/, /\bmod\(/, /\bme\.digits\b/, /\bme\.inputVal\b/,
  /\blambda\b/, /\bfor\b/, /\bif\b/, /\belse\b/, /\bdef\b/, /\bstr\(/, /\bint\(/,
  /\blen\(/, /\btdu\./, /\bvar\(/, /\bext\./, /\bproject\./, /\bapp\./, /'''|"""/,
  /\/\//, // Python floor-div: regex-rewriting operand boundaries is unsafe; leave disabled
];

const TD_REWRITES: [RegExp, string][] = [
  [/\babsTime\.seconds\b/g, 'time.seconds'],
  [/\babsTime\.frame\b/g, 'time.frame'],
  [/\bme\.time\.seconds\b/g, 'time.seconds'],
  [/\bme\.time\.frame\b/g, 'time.frame'],
  [/\bmath\.pi\b/g, 'PI'],
  [/\bmath\.([a-z][a-z0-9_]*)/g, '$1'],
  [/\bTrue\b/g, 'true'],
  [/\bFalse\b/g, 'false'],
  [/\*\*/g, '**'], // JS supports ** natively
];

/** Attempt to translate a TD Python parameter expression into our grammar.
 *  Conservative: validates by compiling and dry-running against a zero scope. */
export function translateTdExpr(py: string): TdTranslation {
  const src = py.trim();
  if (!src) return { ok: false };
  for (const bad of TD_UNSUPPORTED) if (bad.test(src)) return { ok: false };
  let out = src;
  for (const [re, rep] of TD_REWRITES) out = out.replace(re, rep);
  try {
    const compiled = compileExpr(out);
    const zero = makeChannelIndexable(() => 0);
    const v = compiled({
      time: { seconds: 0, frame: 0, delta: 1 / 60, fps: 60 },
      me: { name: 'x', path: '/x' },
      op: () => zero,
    });
    if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') return { ok: false };
    return { ok: true, expr: out };
  } catch {
    return { ok: false };
  }
}
