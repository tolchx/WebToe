/** WebToe bridge frame protocol v1 (browser side).
 *  Binary frame = 24-byte header + payload. Control messages are JSON text.
 *  Keep in sync with packages/ndi-bridge/index.mjs (plain-JS twin). */

export const FRAME_MAGIC = 0x464e5457; // 'WTNF' little-endian
export const HEADER_BYTES = 24;

export interface FrameHeader {
  w: number;
  h: number;
  fourcc: 'RGBA' | 'UYVY' | 'BGRA';
  timestamp: number;
}

export function encodeFrame(h: FrameHeader, payload: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER_BYTES + payload.byteLength);
  const dv = new DataView(buf);
  dv.setUint32(0, FRAME_MAGIC, true);
  dv.setUint32(4, h.w, true);
  dv.setUint32(8, h.h, true);
  const cc = h.fourcc;
  for (let i = 0; i < 4; i++) dv.setUint8(12 + i, cc.charCodeAt(i));
  dv.setFloat64(16, h.timestamp, true);
  new Uint8Array(buf, HEADER_BYTES).set(payload);
  return buf;
}

export function decodeFrame(buf: ArrayBuffer): { header: FrameHeader; payload: Uint8Array } | null {
  if (buf.byteLength < HEADER_BYTES) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== FRAME_MAGIC) return null;
  const w = dv.getUint32(4, true);
  const h = dv.getUint32(8, true);
  const fourcc = String.fromCharCode(dv.getUint8(12), dv.getUint8(13), dv.getUint8(14), dv.getUint8(15)) as FrameHeader['fourcc'];
  const timestamp = dv.getFloat64(16, true);
  return { header: { w, h, fourcc, timestamp }, payload: new Uint8Array(buf, HEADER_BYTES) };
}
