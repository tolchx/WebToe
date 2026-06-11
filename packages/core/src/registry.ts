import type { Family, OpOutput, ParamSpec, ParamVal, TimeContext, InputState } from './types';
import type { GpuFacade, ShaderSources, BackendName } from './passes';
import type { NodeInst } from './node';
import type { Engine } from './engine';

/** Everything an operator's cook() may touch. */
export interface CookCtx {
  node: NodeInst;
  engine: Engine;
  time: TimeContext;
  io: InputState;
  gpu: GpuFacade | null;
  /** cooked outputs of wired inputs (null where unwired) */
  inputs: OpOutput[];
  /** resolved parameter (expressions evaluated) */
  param(key: string): ParamVal;
  paramNum(key: string): number;
  paramStr(key: string): string;
  paramBool(key: string): boolean;
  /** menu param → index within spec.menu (-1 if unknown) */
  menuIndex(key: string): number;
}

export interface OpSpec {
  type: string;
  family: Family;
  label?: string;
  inputs: { min: number; max: number };
  params: ParamSpec[];
  /** TOP only: which backends this op supports (shader sources present for each) */
  backends?: BackendName[];
  /** TOP only: fragment shader sources keyed by backend language */
  shaders?: ShaderSources;
  /** container-like ops get a children map on creation */
  isContainer?: boolean;
  /** ops that must cook every frame even with static params (time/media/io-driven) */
  alwaysCook?: boolean;
  schemaVersion?: number;
  cook(ctx: CookCtx): OpOutput;
  /** optional param migration for plugin/op evolution */
  migrate?(params: Record<string, unknown>, fromVersion: number): Record<string, unknown>;
}

const ops = new Map<string, OpSpec>();

/** PUBLIC plugin API: op packs are modules that call registerOp(). */
export function registerOp(spec: OpSpec): void {
  if (ops.has(spec.type)) throw new Error(`op type already registered: ${spec.type}`);
  ops.set(spec.type, spec);
}

export function getOp(type: string): OpSpec {
  const s = ops.get(type);
  if (!s) throw new Error(`unknown op type: ${type}`);
  return s;
}

export function hasOp(type: string): boolean {
  return ops.has(type);
}

export function allOps(): OpSpec[] {
  return [...ops.values()];
}

/** tests only */
export function _resetRegistry(): void {
  ops.clear();
}

export function defaultParams(spec: OpSpec): Map<string, import('./types').ParamValue> {
  const m = new Map<string, import('./types').ParamValue>();
  for (const p of spec.params) m.set(p.key, { mode: 'const', value: structuredClone(p.default) });
  return m;
}
