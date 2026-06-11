export type Family = 'TOP' | 'CHOP' | 'COMP' | 'DAT';

export type ParamScalar = number | string | boolean;
export type ParamVal = ParamScalar | number[];

export type ParamType = 'float' | 'int' | 'toggle' | 'menu' | 'string' | 'color' | 'xy';

export interface ParamSpec {
  key: string;
  label?: string;
  type: ParamType;
  default: ParamVal;
  min?: number;
  max?: number;
  step?: number;
  menu?: string[];
  /** parameter page (panel renders a section header per page) */
  page?: string;
}

export type ParamMode = 'const' | 'expr' | 'disabled-expr';

/** A parameter's stored state. `expr` is a WebToe expression; `tdExpr` preserves
 *  an untranslatable imported TouchDesigner expression for display only. */
export interface ParamValue {
  mode: ParamMode;
  value: ParamVal;
  expr?: string;
  tdExpr?: string;
}

export interface Channel {
  name: string;
  data: Float32Array;
}

export interface ChannelSet {
  kind: 'chop';
  channels: Channel[];
  /** samples per second; 60 for control-rate v1 */
  rate: number;
}

export interface TextureOut {
  kind: 'top';
  tex: import('./passes').TextureHandle;
}

export interface TextOut {
  kind: 'dat';
  text: string;
}

export type OpOutput = ChannelSet | TextureOut | TextOut | null;

export interface TimeContext {
  seconds: number;
  frame: number;
  delta: number;
  fps: number;
}

export interface InputState {
  mouse: { x: number; y: number; down: boolean };
}

// ---------- project JSON (versioned; see serialize.ts for migrations) ----------

export interface ParamValueJSON {
  mode: ParamMode;
  value: ParamVal;
  expr?: string;
  tdExpr?: string;
}

export interface NodeJSON {
  name: string;
  type: string;
  /** family hint — lets loaders fall back to the right stub when `type` is unknown */
  family?: Family;
  pos: [number, number];
  flags?: { display?: boolean; bypass?: boolean };
  params?: Record<string, ParamValueJSON>;
  /** import fallback: original foreign type label, shown on stub nodes */
  foreignType?: string;
  /** DAT payload */
  text?: string;
  children?: NodeJSON[];
  wires?: WireJSON[];
}

/** Wire within one network level: "srcName:outIndex" → "dstName:inIndex" */
export interface WireJSON {
  from: string;
  to: string;
}

export interface GraphJSON {
  app: 'webtoe';
  version: number;
  root: { nodes: NodeJSON[]; wires: WireJSON[] };
  meta?: Record<string, unknown>;
}

export interface ImportReport {
  nodesTotal: number;
  nodesMapped: number;
  nodesStubbed: number;
  exprTranslated: number;
  exprDisabled: number;
  notes: string[];
}
