import { describe, expect, it } from 'vitest';
import { jsVideoKernels as k, encodeFrame, decodeFrame } from '@webtoe/ops';

describe('video kernels (JS reference for the WASM build)', () => {
  it('uyvy → rgba: mid-gray and primaries land where BT.601 says', () => {
    // two pixels of video-range mid gray: Y=126, U=V=128 → ~128 gray
    const uyvy = new Uint8Array([128, 126, 128, 126]);
    const rgba = new Uint8ClampedArray(8);
    k.uyvyToRgba(uyvy, rgba, 2, 1);
    for (const c of [rgba[0], rgba[1], rgba[2]]) {
      expect(Math.abs(c - 128)).toBeLessThanOrEqual(2);
    }
    expect(rgba[3]).toBe(255);
  });

  it('rgba → uyvy → rgba round-trips within tolerance', () => {
    const w = 4, h = 2;
    const src = new Uint8ClampedArray([
      200, 40, 40, 255, 200, 40, 40, 255, 40, 180, 60, 255, 40, 180, 60, 255,
      30, 60, 200, 255, 30, 60, 200, 255, 220, 220, 220, 255, 220, 220, 220, 255,
    ]);
    const uyvy = new Uint8Array(w * h * 2);
    const back = new Uint8ClampedArray(w * h * 4);
    k.rgbaToUyvy(src, uyvy, w, h);
    k.uyvyToRgba(uyvy, back, w, h);
    for (let i = 0; i < src.length; i++) {
      if (i % 4 === 3) continue; // alpha
      expect(Math.abs(back[i] - src[i])).toBeLessThanOrEqual(8); // 4:2:2 + rounding
    }
  });

  it('bgra → rgba swizzles channels', () => {
    const src = new Uint8Array([10, 20, 30, 40]);
    const dst = new Uint8ClampedArray(4);
    k.bgraToRgba(src, dst, 1, 1);
    expect([...dst]).toEqual([30, 20, 10, 40]);
  });

  it('flipY reverses row order in place', () => {
    const buf = new Uint8Array([
      1, 1, 1, 1, /* row0 */ 2, 2, 2, 2, /* row1 */ 3, 3, 3, 3, /* row2 */
    ]);
    k.flipY(buf, 1, 3);
    expect(buf[0]).toBe(3);
    expect(buf[4]).toBe(2);
    expect(buf[8]).toBe(1);
  });
});

describe('bridge frame protocol', () => {
  it('encode/decode round-trips header and payload', () => {
    const payload = new Uint8Array([9, 8, 7, 6, 5]);
    const buf = encodeFrame({ w: 640, h: 360, fourcc: 'UYVY', timestamp: 12.5 }, payload);
    const out = decodeFrame(buf)!;
    expect(out.header).toEqual({ w: 640, h: 360, fourcc: 'UYVY', timestamp: 12.5 });
    expect([...out.payload]).toEqual([9, 8, 7, 6, 5]);
  });

  it('rejects garbage', () => {
    expect(decodeFrame(new ArrayBuffer(8))).toBeNull();
    expect(decodeFrame(new Uint8Array(64).buffer)).toBeNull();
  });
});
