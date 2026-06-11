import type { BackendName, GpuFacade } from '@webtoe/core';
import { WebGL2Backend } from './webgl2/backend';
import { WebGPUBackend } from './webgpu/backend';

export { WebGL2Backend } from './webgl2/backend';
export { WebGPUBackend } from './webgpu/backend';

/**
 * Backend negotiation (PLAN §3): WebGL2 is the v1 default/floor; WebGPU is
 * opt-in (`?backend=webgpu`) until op coverage reaches parity (M7), then the
 * preference flips for capable projects. Falls back gracefully.
 */
export async function createBackend(
  canvas: HTMLCanvasElement,
  prefer: BackendName = 'webgl2',
): Promise<GpuFacade> {
  if (prefer === 'webgpu') {
    try {
      return await WebGPUBackend.create(canvas);
    } catch (e) {
      console.warn('[webtoe] webgpu unavailable, falling back to webgl2:', (e as Error).message);
    }
  }
  return new WebGL2Backend(canvas);
}
