/**
 * Video pixel kernels — the WASM seam for the NDI path (PLAN §5).
 * JS implementations are the unit-tested reference and permanent fallback;
 * `initVideoKernelsWasm()` swaps in the compiled AssemblyScript build
 * (packages/wasm-kernels) when the artifact is reachable.
 *
 * Color math: BT.601 video-range YCbCr ⇄ full-range RGB (NDI's common case
 * at SD/HD; BT.709 matrix is a follow-up flag).
 */

export interface VideoKernels {
  /** UYVY 4:2:2 (2 pixels per 4 bytes) → RGBA8888 */
  uyvyToRgba(src: Uint8Array, dst: Uint8ClampedArray, w: number, h: number): void;
  /** RGBA8888 → UYVY 4:2:2 */
  rgbaToUyvy(src: Uint8Array | Uint8ClampedArray, dst: Uint8Array, w: number, h: number): void;
  /** BGRA8888 → RGBA8888 (NDI BGRA frames) */
  bgraToRgba(src: Uint8Array, dst: Uint8ClampedArray, w: number, h: number): void;
  /** flip rows in place (GL readbacks are bottom-up) */
  flipY(buf: Uint8Array | Uint8ClampedArray, w: number, h: number): void;
}

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v) | 0;

export const jsVideoKernels: VideoKernels = {
  uyvyToRgba(src, dst, w, h) {
    const pairs = (w * h) / 2;
    for (let i = 0; i < pairs; i++) {
      const s = i * 4;
      const u = src[s] - 128;
      const y0 = src[s + 1] - 16;
      const v = src[s + 2] - 128;
      const y1 = src[s + 3] - 16;
      const rC = 1.596 * v;
      const gC = -0.391 * u - 0.813 * v;
      const bC = 2.018 * u;
      const d = i * 8;
      const c0 = 1.164 * y0;
      dst[d] = clamp8(c0 + rC); dst[d + 1] = clamp8(c0 + gC); dst[d + 2] = clamp8(c0 + bC); dst[d + 3] = 255;
      const c1 = 1.164 * y1;
      dst[d + 4] = clamp8(c1 + rC); dst[d + 5] = clamp8(c1 + gC); dst[d + 6] = clamp8(c1 + bC); dst[d + 7] = 255;
    }
  },

  rgbaToUyvy(src, dst, w, h) {
    const pairs = (w * h) / 2;
    for (let i = 0; i < pairs; i++) {
      const s = i * 8;
      const r0 = src[s], g0 = src[s + 1], b0 = src[s + 2];
      const r1 = src[s + 4], g1 = src[s + 5], b1 = src[s + 6];
      const y0 = 16 + 0.257 * r0 + 0.504 * g0 + 0.098 * b0;
      const y1 = 16 + 0.257 * r1 + 0.504 * g1 + 0.098 * b1;
      const ar = (r0 + r1) / 2, ag = (g0 + g1) / 2, ab = (b0 + b1) / 2;
      const u = 128 - 0.148 * ar - 0.291 * ag + 0.439 * ab;
      const v = 128 + 0.439 * ar - 0.368 * ag - 0.071 * ab;
      const d = i * 4;
      dst[d] = clamp8(u); dst[d + 1] = clamp8(y0); dst[d + 2] = clamp8(v); dst[d + 3] = clamp8(y1);
    }
  },

  bgraToRgba(src, dst, w, h) {
    const n = w * h * 4;
    for (let i = 0; i < n; i += 4) {
      dst[i] = src[i + 2];
      dst[i + 1] = src[i + 1];
      dst[i + 2] = src[i];
      dst[i + 3] = src[i + 3];
    }
  },

  flipY(buf, w, h) {
    const row = w * 4;
    const tmp = new Uint8Array(row);
    for (let y = 0; y < (h >> 1); y++) {
      const a = y * row, b = (h - 1 - y) * row;
      tmp.set(buf.subarray(a, a + row));
      buf.copyWithin(a, b, b + row);
      buf.set(tmp, b);
    }
  },
};

let active: VideoKernels = jsVideoKernels;

export function videoKernels(): VideoKernels {
  return active;
}

export function setVideoKernels(impl: VideoKernels): void {
  active = impl;
}

interface WasmExports {
  memory: WebAssembly.Memory;
  uyvyToRgba(inPtr: number, outPtr: number, w: number, h: number): void;
  rgbaToUyvy(inPtr: number, outPtr: number, w: number, h: number): void;
  bgraToRgba(inPtr: number, outPtr: number, w: number, h: number): void;
}

/** Best-effort: load the committed wasm build and swap the provider.
 *  Returns the active backend name. JS remains the fallback on any failure. */
export async function initVideoKernelsWasm(url: string): Promise<'wasm' | 'js'> {
  try {
    const res = await fetch(url);
    if (!res.ok) return 'js';
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {
      env: { abort: () => { throw new Error('wasm abort'); } },
    });
    const ex = instance.exports as unknown as WasmExports;
    if (!ex.memory || !ex.uyvyToRgba) return 'js';

    const ensure = (bytes: number) => {
      const need = bytes - ex.memory.buffer.byteLength;
      if (need > 0) ex.memory.grow(Math.ceil(need / 65536));
    };
    const run = (
      fn: (i: number, o: number, w: number, h: number) => void,
      src: ArrayLike<number>, srcLen: number, dst: { set(a: Uint8Array): void }, dstLen: number,
      w: number, h: number,
    ) => {
      ensure(srcLen + dstLen + 1024);
      const inPtr = 0, outPtr = srcLen;
      new Uint8Array(ex.memory.buffer, inPtr, srcLen).set(src as Uint8Array);
      fn(inPtr, outPtr, w, h);
      dst.set(new Uint8Array(ex.memory.buffer, outPtr, dstLen));
    };

    setVideoKernels({
      uyvyToRgba: (src, dst, w, h) => run(ex.uyvyToRgba, src, w * h * 2, dst, w * h * 4, w, h),
      rgbaToUyvy: (src, dst, w, h) => run(ex.rgbaToUyvy, src, w * h * 4, dst, w * h * 2, w, h),
      bgraToRgba: (src, dst, w, h) => run(ex.bgraToRgba, src, w * h * 4, dst, w * h * 4, w, h),
      flipY: jsVideoKernels.flipY, // memmove-bound; JS copyWithin is already optimal
    });
    return 'wasm';
  } catch {
    setVideoKernels(jsVideoKernels);
    return 'js';
  }
}
