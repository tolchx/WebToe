import { Graph } from './graph';
import { NodeInst } from './node';
import { getOp, type CookCtx, type OpSpec } from './registry';
import { compileExpr, makeChannelIndexable, type ExprScope, type CompiledExpr } from './expr';
import type { GpuFacade } from './passes';
import type { ChannelSet, InputState, OpOutput, ParamVal, TimeContext } from './types';

/**
 * Pull-based cook engine. `frame()` advances time and cooks the live roots;
 * `cook(node)` memoizes per frame, cooks wired inputs first, and lets
 * expressions pull other nodes (op('x')) with cycle protection.
 */
export class Engine {
  readonly graph = new Graph();
  gpu: GpuFacade | null = null;
  io: InputState = { mouse: { x: 0.5, y: 0.5, down: false } };
  time: TimeContext = { seconds: 0, frame: 0, delta: 1 / 60, fps: 60 };

  /** nodes the UI wants alive this frame (viewer, display flags, visible thumbs) */
  readonly liveRoots = new Set<NodeInst>();

  private startSeconds: number | null = null;
  private lastSeconds = 0;

  /** Advance time and cook everything live. `now` = seconds (e.g. performance.now()/1000). */
  frame(now: number): void {
    if (this.startSeconds === null) {
      this.startSeconds = now;
      this.lastSeconds = now;
    }
    const t = now - this.startSeconds;
    // delta floor = 4ms (250 fps): no real display exceeds it, and it keeps
    // abnormal drivers (tests, capture tools) from skewing the fps estimate
    const delta = Math.min(Math.max(now - this.lastSeconds, 1 / 250), 0.25);
    this.lastSeconds = now;
    const fps = this.time.fps * 0.95 + (1 / delta) * 0.05;
    this.time = { seconds: t, frame: this.time.frame + 1, delta, fps };
    this.gpu?.setTime(t);
    for (const node of this.liveRoots) {
      if (this.graph.byId.has(node.id)) this.cook(node);
    }
  }

  cook(node: NodeInst): OpOutput {
    if (node.cookedFrame === this.time.frame) return node.output;
    if (node.cooking) {
      // dependency cycle — yield previous output, flag once
      node.error = 'cycle detected';
      return node.output;
    }
    node.cooking = true;
    node.error = null;
    try {
      const spec = getOp(node.type);
      if (node.flags.bypass) {
        const src = node.inputs[0];
        node.output = src ? this.cook(src) : null;
      } else {
        const inputs = spec.lazyInputs ? [] : node.inputs.map((n) => (n ? this.cook(n) : null));
        const ctx = this.makeCtx(node, spec, inputs);
        node.output = spec.cook(ctx);
      }
    } catch (e) {
      node.error = (e as Error).message;
      node.output = null;
    } finally {
      node.cooking = false;
      node.cookedFrame = this.time.frame;
    }
    return node.output;
  }

  /** Resolve a param to its effective value (evaluating expressions). */
  param(node: NodeInst, key: string): ParamVal {
    const spec = getOp(node.type);
    const ps = spec.params.find((p) => p.key === key);
    const pv = node.params.get(key);
    const fallback = (ps?.default ?? 0) as ParamVal;
    if (!pv) return fallback;
    if (pv.mode !== 'expr' || !pv.expr) return pv.value;
    try {
      const compiled = this.compiledFor(node, key, pv.expr);
      const out = compiled(this.scopeFor(node));
      if (typeof out === 'number' && Number.isFinite(out)) return out;
      if (typeof out === 'boolean' || typeof out === 'string') return out;
      if (Array.isArray(out) && out.every((v) => typeof v === 'number')) return out as number[];
      throw new Error(`expression returned ${typeof out}`);
    } catch (e) {
      node.error = `param ${key}: ${(e as Error).message}`;
      return pv.value ?? fallback;
    }
  }

  paramNum(node: NodeInst, key: string): number {
    const v = this.param(node, key);
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private compiledFor(node: NodeInst, key: string, src: string): CompiledExpr {
    const cacheKey = `__expr:${key}`;
    const entry = node.state[cacheKey] as { src: string; fn: CompiledExpr } | undefined;
    if (entry && entry.src === src) return entry.fn;
    const fn = compileExpr(src);
    node.state[cacheKey] = { src, fn };
    return fn;
  }

  private scopeFor(node: NodeInst): ExprScope {
    return {
      time: this.time,
      me: { name: node.name, path: this.graph.pathOf(node) },
      op: (path: string) => {
        const target = this.graph.resolve(path, node);
        if (!target) return makeChannelIndexable(() => 0);
        const out = this.cook(target);
        if (out && out.kind === 'chop') return channelAccessor(out);
        return makeChannelIndexable(() => 0);
      },
    };
  }

  private makeCtx(node: NodeInst, spec: OpSpec, inputs: OpOutput[]): CookCtx {
    const self = this;
    return {
      node,
      engine: self,
      time: self.time,
      io: self.io,
      gpu: self.gpu,
      inputs,
      param: (key) => self.param(node, key),
      paramNum: (key) => self.paramNum(node, key),
      paramStr: (key) => String(self.param(node, key)),
      paramBool: (key) => {
        const v = self.param(node, key);
        return typeof v === 'boolean' ? v : Number(v) !== 0;
      },
      menuIndex: (key) => {
        const ps = spec.params.find((p) => p.key === key);
        const v = String(self.param(node, key));
        return ps?.menu ? ps.menu.indexOf(v) : -1;
      },
    };
  }
}

function channelAccessor(cs: ChannelSet): Record<string | number, number> {
  return makeChannelIndexable((key) => {
    const ch = typeof key === 'number' ? cs.channels[key] : cs.channels.find((c) => c.name === key);
    if (!ch || ch.data.length === 0) return 0;
    return ch.data[ch.data.length - 1];
  });
}
