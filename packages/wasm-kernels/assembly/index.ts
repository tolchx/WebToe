/** Video pixel kernels (WASM). Flat-memory contract: caller writes input at
 *  inPtr, we write output at outPtr; no allocations (runtime stub). Math must
 *  match the JS reference in packages/ops/src/video/kernels.ts (BT.601). */

// @ts-ignore: decorator
@inline
function clamp8(v: f32): u8 {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return <u8>v;
}

export function uyvyToRgba(inPtr: usize, outPtr: usize, w: i32, h: i32): void {
  const pairs = (w * h) / 2;
  for (let i = 0; i < pairs; i++) {
    const s = inPtr + <usize>(i << 2);
    const u: f32 = <f32>load<u8>(s) - 128.0;
    const y0: f32 = <f32>load<u8>(s + 1) - 16.0;
    const v: f32 = <f32>load<u8>(s + 2) - 128.0;
    const y1: f32 = <f32>load<u8>(s + 3) - 16.0;
    const rC: f32 = 1.596 * v;
    const gC: f32 = -0.391 * u - 0.813 * v;
    const bC: f32 = 2.018 * u;
    const d = outPtr + <usize>(i << 3);
    const c0: f32 = 1.164 * y0;
    store<u8>(d, clamp8(c0 + rC));
    store<u8>(d + 1, clamp8(c0 + gC));
    store<u8>(d + 2, clamp8(c0 + bC));
    store<u8>(d + 3, 255);
    const c1: f32 = 1.164 * y1;
    store<u8>(d + 4, clamp8(c1 + rC));
    store<u8>(d + 5, clamp8(c1 + gC));
    store<u8>(d + 6, clamp8(c1 + bC));
    store<u8>(d + 7, 255);
  }
}

export function rgbaToUyvy(inPtr: usize, outPtr: usize, w: i32, h: i32): void {
  const pairs = (w * h) / 2;
  for (let i = 0; i < pairs; i++) {
    const s = inPtr + <usize>(i << 3);
    const r0: f32 = <f32>load<u8>(s);
    const g0: f32 = <f32>load<u8>(s + 1);
    const b0: f32 = <f32>load<u8>(s + 2);
    const r1: f32 = <f32>load<u8>(s + 4);
    const g1: f32 = <f32>load<u8>(s + 5);
    const b1: f32 = <f32>load<u8>(s + 6);
    const y0: f32 = 16.0 + 0.257 * r0 + 0.504 * g0 + 0.098 * b0;
    const y1: f32 = 16.0 + 0.257 * r1 + 0.504 * g1 + 0.098 * b1;
    const ar: f32 = (r0 + r1) / 2.0;
    const ag: f32 = (g0 + g1) / 2.0;
    const ab: f32 = (b0 + b1) / 2.0;
    const u: f32 = 128.0 - 0.148 * ar - 0.291 * ag + 0.439 * ab;
    const v: f32 = 128.0 + 0.439 * ar - 0.368 * ag - 0.071 * ab;
    const d = outPtr + <usize>(i << 2);
    store<u8>(d, clamp8(u));
    store<u8>(d + 1, clamp8(y0));
    store<u8>(d + 2, clamp8(v));
    store<u8>(d + 3, clamp8(y1));
  }
}

export function bgraToRgba(inPtr: usize, outPtr: usize, w: i32, h: i32): void {
  const n = w * h * 4;
  for (let i = 0; i < n; i += 4) {
    const s = inPtr + <usize>i;
    const d = outPtr + <usize>i;
    store<u8>(d, load<u8>(s + 2));
    store<u8>(d + 1, load<u8>(s + 1));
    store<u8>(d + 2, load<u8>(s));
    store<u8>(d + 3, load<u8>(s + 3));
  }
}
