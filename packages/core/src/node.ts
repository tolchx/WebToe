import type { OpOutput, ParamValue } from './types';

let nextId = 1;

/** Reset instance id counter (tests only). */
export function _resetNodeIds(): void {
  nextId = 1;
}

export class NodeInst {
  readonly id: number;
  name: string;
  /** registry op type, e.g. 'noise', 'lfo', 'container', 'stub' */
  type: string;
  parent: NodeInst | null;
  /** present only on container-like ops */
  children: Map<string, NodeInst> | null = null;
  /** wired input nodes by input index (TD-style: wires live on the consumer) */
  inputs: (NodeInst | null)[] = [];
  pos = { x: 0, y: 0 };
  flags: { display: boolean; bypass: boolean } = { display: false, bypass: false };
  params = new Map<string, ParamValue>();
  /** import fallback label (original foreign type) */
  foreignType?: string;
  /** DAT payload */
  text?: string;

  // ---- cook state ----
  cookedFrame = -1;
  cooking = false;
  output: OpOutput = null;
  error: string | null = null;
  /** per-node scratch for ops (filter state, media elements, compiled exprs…) */
  state: Record<string, unknown> = {};

  constructor(type: string, name: string, parent: NodeInst | null) {
    this.id = nextId++;
    this.type = type;
    this.name = name;
    this.parent = parent;
  }
}
