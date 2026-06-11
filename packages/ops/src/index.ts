import { registerOp, hasOp, type OpSpec } from '@webtoe/core';
import { chopOps } from './chop/ops';
import { commonOps } from './common/ops';
import { topOps } from './top/ops';
import { sopOps } from './sop/ops';
import { matOps } from './mat/ops';
import { objOps } from './obj/ops';
import { ndiOps } from './top/ndi';

export { channels, channel, sample, asChop, CONTROL_RATE } from './chop/data';
export { kernels, setKernels, tsKernels, type Kernels, type LfoShape } from './chop/kernels';
export { chopOps } from './chop/ops';
export { commonOps } from './common/ops';
export { topOps } from './top/ops';
export { sopOps } from './sop/ops';
export { matOps } from './mat/ops';
export { objOps, matchTdPattern } from './obj/ops';
export { ndiOps } from './top/ndi';
export * as geoKernels from './sop/geo';
export {
  videoKernels, setVideoKernels, jsVideoKernels, initVideoKernelsWasm,
  type VideoKernels,
} from './video/kernels';
export { encodeFrame, decodeFrame, FRAME_MAGIC, HEADER_BYTES, type FrameHeader } from './video/protocol';

function registerAll(specs: OpSpec[]): void {
  for (const s of specs) if (!hasOp(s.type)) registerOp(s);
}

/** Register every built-in op family (idempotent). */
export function registerAllOps(): void {
  registerAll(commonOps);
  registerAll(chopOps);
  registerAll(topOps);
  registerAll(sopOps);
  registerAll(matOps);
  registerAll(objOps);
  registerAll(ndiOps);
}
