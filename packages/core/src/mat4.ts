/** Minimal column-major 4×4 matrix math for the 3D pipeline — zero-dep. */

export type Mat4 = Float32Array;

export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4, out = new Float32Array(16)): Mat4 {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/** TRS with pivot (TD-style: translate ∘ pivot ∘ rotZYX ∘ scale ∘ -pivot). */
export function compose(
  t: [number, number, number],
  rDeg: [number, number, number],
  s: [number, number, number],
  pivot: [number, number, number] = [0, 0, 0],
): Mat4 {
  const [rx, ry, rz] = rDeg.map((d) => (d * Math.PI) / 180);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz·Ry·Rx (TD default rord xyz applies X then Y then Z)
  const r00 = cz * cy, r01 = cz * sy * sx - sz * cx, r02 = cz * sy * cx + sz * sx;
  const r10 = sz * cy, r11 = sz * sy * sx + cz * cx, r12 = sz * sy * cx - cz * sx;
  const r20 = -sy, r21 = cy * sx, r22 = cy * cx;
  const m = new Float32Array(16);
  // M = T(t+p) · R · S · T(-p)
  m[0] = r00 * s[0]; m[1] = r10 * s[0]; m[2] = r20 * s[0];
  m[4] = r01 * s[1]; m[5] = r11 * s[1]; m[6] = r21 * s[1];
  m[8] = r02 * s[2]; m[9] = r12 * s[2]; m[10] = r22 * s[2];
  m[15] = 1;
  const px = pivot[0], py = pivot[1], pz2 = pivot[2];
  m[12] = t[0] + px - (m[0] * px + m[4] * py + m[8] * pz2);
  m[13] = t[1] + py - (m[1] * px + m[5] * py + m[9] * pz2);
  m[14] = t[2] + pz2 - (m[2] * px + m[6] * py + m[10] * pz2);
  return m;
}

export function perspective(fovYDeg: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(((fovYDeg * Math.PI) / 180) / 2);
  const m = new Float32Array(16);
  m[0] = f / Math.max(aspect, 1e-6);
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function orthographic(width: number, aspect: number, near: number, far: number): Mat4 {
  const h = width / Math.max(aspect, 1e-6);
  const m = new Float32Array(16);
  m[0] = 2 / width;
  m[5] = 2 / h;
  m[10] = 2 / (near - far);
  m[14] = (far + near) / (near - far);
  m[15] = 1;
  return m;
}

export function lookAt(eye: [number, number, number], target: [number, number, number], up: [number, number, number] = [0, 1, 0]): Mat4 {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx;
  m[4] = xy; m[5] = yy; m[6] = zy;
  m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

/** Invert a rigid TR matrix (rotation + translation, uniform-ish scale ignored). */
export function invertRigid(m: Mat4): Mat4 {
  const o = new Float32Array(16);
  o[0] = m[0]; o[1] = m[4]; o[2] = m[8];
  o[4] = m[1]; o[5] = m[5]; o[6] = m[9];
  o[8] = m[2]; o[9] = m[6]; o[10] = m[10];
  o[12] = -(m[0] * m[12] + m[1] * m[13] + m[2] * m[14]);
  o[13] = -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]);
  o[14] = -(m[8] * m[12] + m[9] * m[13] + m[10] * m[14]);
  o[15] = 1;
  return o;
}

export function transformPoint(m: Mat4, p: [number, number, number]): [number, number, number] {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
