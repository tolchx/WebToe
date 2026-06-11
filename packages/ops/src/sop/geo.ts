/** SOP geometry kernels — pure TypeScript, typed-array-first, unit-tested.
 *  Builders return fresh GeometryData with a bumped version (VAO cache key). */
import type { GeometryData } from '@webtoe/core';

let nextVersion = 1;

export function makeGeo(g: Omit<GeometryData, 'version'>): GeometryData {
  return { ...g, version: nextVersion++ };
}

export function emptyGeo(): GeometryData {
  return makeGeo({ P: new Float32Array(0) });
}

export function asSop(out: import('@webtoe/core').OpOutput): GeometryData | null {
  return out && out.kind === 'sop' ? out.geo : null;
}

export function pointCount(g: GeometryData): number {
  return g.P.length / 3;
}

// ---------------------------------------------------------------- primitives

export function line(p1: [number, number, number], p2: [number, number, number], points: number): GeometryData {
  const n = Math.max(2, Math.round(points));
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    P[i * 3] = p1[0] + (p2[0] - p1[0]) * t;
    P[i * 3 + 1] = p1[1] + (p2[1] - p1[1]) * t;
    P[i * 3 + 2] = p1[2] + (p2[2] - p1[2]) * t;
  }
  return makeGeo({ P, lineStrips: [strip(0, n)] });
}

export function circle(radius: number, divisions: number, closed: boolean, plane: 'xy' | 'zx' | 'yz'): GeometryData {
  const n = Math.max(3, Math.round(divisions));
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const u = Math.cos(a) * radius, v = Math.sin(a) * radius;
    const o = i * 3;
    if (plane === 'xy') { P[o] = u; P[o + 1] = v; }
    else if (plane === 'zx') { P[o + 2] = u; P[o] = v; }
    else { P[o + 1] = u; P[o + 2] = v; }
  }
  const idx = closed
    ? new Uint32Array([...Array(n).keys(), 0])
    : strip(0, n);
  return makeGeo({ P, lineStrips: [idx] });
}

export function rectangleSop(w: number, h: number): GeometryData {
  const P = new Float32Array([-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0]);
  return makeGeo({ P, lineStrips: [new Uint32Array([0, 1, 2, 3, 0])] });
}

export function grid(rows: number, cols: number, w: number, h: number): GeometryData {
  const R = Math.max(2, Math.round(rows)), C = Math.max(2, Math.round(cols));
  const P = new Float32Array(R * C * 3);
  const uv = new Float32Array(R * C * 2);
  const N = new Float32Array(R * C * 3);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      P[i * 3] = (c / (C - 1) - 0.5) * w;
      P[i * 3 + 1] = (r / (R - 1) - 0.5) * h;
      uv[i * 2] = c / (C - 1);
      uv[i * 2 + 1] = r / (R - 1);
      N[i * 3 + 2] = 1;
    }
  }
  return makeGeo({ P, uv, N, triangles: gridTriangles(R, C) });
}

export function sphere(radius: number, rows: number, cols: number): GeometryData {
  const R = Math.max(3, Math.round(rows)), C = Math.max(3, Math.round(cols));
  const P = new Float32Array(R * C * 3);
  const N = new Float32Array(R * C * 3);
  const uv = new Float32Array(R * C * 2);
  for (let r = 0; r < R; r++) {
    const phi = (r / (R - 1)) * Math.PI;
    for (let c = 0; c < C; c++) {
      const theta = (c / (C - 1)) * Math.PI * 2;
      const i = r * C + c;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      P[i * 3] = nx * radius; P[i * 3 + 1] = ny * radius; P[i * 3 + 2] = nz * radius;
      N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz;
      uv[i * 2] = c / (C - 1); uv[i * 2 + 1] = r / (R - 1);
    }
  }
  return makeGeo({ P, N, uv, triangles: gridTriangles(R, C) });
}

export function box(sx: number, sy: number, sz: number): GeometryData {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces: [number[], number[]][] = [
    [[0, 0, 1], [-hx, -hy, hz, hx, -hy, hz, hx, hy, hz, -hx, hy, hz]],
    [[0, 0, -1], [hx, -hy, -hz, -hx, -hy, -hz, -hx, hy, -hz, hx, hy, -hz]],
    [[1, 0, 0], [hx, -hy, hz, hx, -hy, -hz, hx, hy, -hz, hx, hy, hz]],
    [[-1, 0, 0], [-hx, -hy, -hz, -hx, -hy, hz, -hx, hy, hz, -hx, hy, -hz]],
    [[0, 1, 0], [-hx, hy, hz, hx, hy, hz, hx, hy, -hz, -hx, hy, -hz]],
    [[0, -1, 0], [-hx, -hy, -hz, hx, -hy, -hz, hx, -hy, hz, -hx, -hy, hz]],
  ];
  const P = new Float32Array(24 * 3);
  const N = new Float32Array(24 * 3);
  const tris: number[] = [];
  faces.forEach(([n, verts], f) => {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      P.set(verts.slice(v * 3, v * 3 + 3), i * 3);
      N.set(n, i * 3);
    }
    const b = f * 4;
    tris.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return makeGeo({ P, N, triangles: new Uint32Array(tris) });
}

export function tube(rad1: number, rad2: number, height: number, rows: number, cols: number): GeometryData {
  const R = Math.max(2, Math.round(rows)), C = Math.max(3, Math.round(cols));
  const P = new Float32Array(R * C * 3);
  const N = new Float32Array(R * C * 3);
  const uv = new Float32Array(R * C * 2);
  for (let r = 0; r < R; r++) {
    const t = r / (R - 1);
    const rad = rad1 + (rad2 - rad1) * t;
    const y = (t - 0.5) * height;
    for (let c = 0; c < C; c++) {
      const a = (c / (C - 1)) * Math.PI * 2;
      const i = r * C + c;
      P[i * 3] = Math.cos(a) * rad; P[i * 3 + 1] = y; P[i * 3 + 2] = Math.sin(a) * rad;
      N[i * 3] = Math.cos(a); N[i * 3 + 1] = 0; N[i * 3 + 2] = Math.sin(a);
      uv[i * 2] = c / (C - 1); uv[i * 2 + 1] = t;
    }
  }
  return makeGeo({ P, N, uv, triangles: gridTriangles(R, C) });
}

export function torus(rad1: number, rad2: number, rows: number, cols: number): GeometryData {
  const R = Math.max(3, Math.round(rows)), C = Math.max(3, Math.round(cols));
  const P = new Float32Array(R * C * 3);
  const N = new Float32Array(R * C * 3);
  for (let r = 0; r < R; r++) {
    const v = (r / (R - 1)) * Math.PI * 2;
    for (let c = 0; c < C; c++) {
      const u = (c / (C - 1)) * Math.PI * 2;
      const i = r * C + c;
      const cx = Math.cos(u) * rad1, cz = Math.sin(u) * rad1;
      P[i * 3] = cx + Math.cos(u) * rad2 * Math.cos(v);
      P[i * 3 + 1] = Math.sin(v) * rad2;
      P[i * 3 + 2] = cz + Math.sin(u) * rad2 * Math.cos(v);
      N[i * 3] = Math.cos(u) * Math.cos(v); N[i * 3 + 1] = Math.sin(v); N[i * 3 + 2] = Math.sin(u) * Math.cos(v);
    }
  }
  return makeGeo({ P, N, triangles: gridTriangles(R, C) });
}

// ---------------------------------------------------------------- operations

export function mergeGeos(list: GeometryData[]): GeometryData {
  const total = list.reduce((a, g) => a + pointCount(g), 0);
  const P = new Float32Array(total * 3);
  const hasN = list.some((g) => g.N), hasUv = list.some((g) => g.uv), hasCd = list.some((g) => g.Cd);
  const N = hasN ? new Float32Array(total * 3) : undefined;
  const uv = hasUv ? new Float32Array(total * 2) : undefined;
  const Cd = hasCd ? defaultCd(total) : undefined;
  const tris: number[] = [];
  const strips: Uint32Array[] = [];
  let renderPoints = false;
  let off = 0;
  for (const g of list) {
    const n = pointCount(g);
    P.set(g.P, off * 3);
    if (N && g.N) N.set(g.N, off * 3);
    if (uv && g.uv) uv.set(g.uv, off * 2);
    if (Cd && g.Cd) Cd.set(g.Cd, off * 4);
    if (g.triangles) for (const i of g.triangles) tris.push(i + off);
    if (g.lineStrips) for (const s of g.lineStrips) strips.push(s.map((i) => i + off) as Uint32Array);
    if (g.renderPoints) renderPoints = true;
    off += n;
  }
  return makeGeo({
    P, N, uv, Cd,
    triangles: tris.length ? new Uint32Array(tris) : undefined,
    lineStrips: strips.length ? strips : undefined,
    renderPoints,
  });
}

export function transformGeo(g: GeometryData, m: Float32Array): GeometryData {
  const n = pointCount(g);
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = g.P[i * 3], y = g.P[i * 3 + 1], z = g.P[i * 3 + 2];
    P[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    P[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    P[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  let N = g.N;
  if (N) {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = N[i * 3], y = N[i * 3 + 1], z = N[i * 3 + 2];
      const nx = m[0] * x + m[4] * y + m[8] * z;
      const ny = m[1] * x + m[5] * y + m[9] * z;
      const nz = m[2] * x + m[6] * y + m[10] * z;
      const l = Math.hypot(nx, ny, nz) || 1;
      out[i * 3] = nx / l; out[i * 3 + 1] = ny / l; out[i * 3 + 2] = nz / l;
    }
    N = out;
  }
  return makeGeo({ ...g, P, N });
}

export function copyToPoints(src: GeometryData, template: GeometryData): GeometryData {
  const tn = pointCount(template);
  const copies: GeometryData[] = [];
  for (let i = 0; i < tn; i++) {
    const tx = template.P[i * 3], ty = template.P[i * 3 + 1], tz = template.P[i * 3 + 2];
    const n = pointCount(src);
    const P = new Float32Array(n * 3);
    for (let p = 0; p < n; p++) {
      P[p * 3] = src.P[p * 3] + tx;
      P[p * 3 + 1] = src.P[p * 3 + 1] + ty;
      P[p * 3 + 2] = src.P[p * 3 + 2] + tz;
    }
    let Cd = src.Cd;
    if (template.Cd) {
      Cd = new Float32Array(n * 4);
      for (let p = 0; p < n; p++) Cd.set(template.Cd.subarray(i * 4, i * 4 + 4), p * 4);
    }
    copies.push(makeGeo({ ...src, P, Cd }));
  }
  return copies.length ? mergeGeos(copies) : emptyGeo();
}

/** Loft consecutive line strips with equal point counts into a quad mesh. */
export function skinStrips(g: GeometryData): GeometryData {
  const strips = g.lineStrips ?? [];
  if (strips.length < 2) return g;
  const count = strips[0].length;
  if (!strips.every((s) => s.length === count)) return g; // unmatched — passthrough
  const tris: number[] = [];
  for (let s = 0; s < strips.length - 1; s++) {
    const a = strips[s], b = strips[s + 1];
    for (let i = 0; i < count - 1; i++) {
      tris.push(a[i], b[i], b[i + 1], a[i], b[i + 1], a[i + 1]);
    }
  }
  const triangles = new Uint32Array(tris);
  const N = computeNormals(g.P, triangles);
  return makeGeo({ ...g, triangles, N, lineStrips: undefined });
}

export function computeNormals(P: Float32Array, triangles: Uint32Array): Float32Array {
  const N = new Float32Array(P.length);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t] * 3, b = triangles[t + 1] * 3, c = triangles[t + 2] * 3;
    const abx = P[b] - P[a], aby = P[b + 1] - P[a + 1], abz = P[b + 2] - P[a + 2];
    const acx = P[c] - P[a], acy = P[c + 1] - P[a + 1], acz = P[c + 2] - P[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    for (const v of [a, b, c]) { N[v] += nx; N[v + 1] += ny; N[v + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l; N[i + 1] /= l; N[i + 2] /= l;
  }
  return N;
}

/** Spatial value-noise displacement along a direction (or normals). */
export function noiseDisplace(
  g: GeometryData, amount: number, period: number, phase: number, seed: number,
  dir: [number, number, number],
): GeometryData {
  const n = pointCount(g);
  const P = new Float32Array(g.P);
  const useNormals = dir[0] === 0 && dir[1] === 0 && dir[2] === 0 && !!g.N;
  const p = Math.max(1e-4, period);
  for (let i = 0; i < n; i++) {
    const x = g.P[i * 3] / p, y = g.P[i * 3 + 1] / p, z = g.P[i * 3 + 2] / p;
    const v = noise3(x + phase, y + seed * 13.7, z + phase * 0.7) * amount;
    const dx = useNormals ? g.N![i * 3] : dir[0];
    const dy = useNormals ? g.N![i * 3 + 1] : dir[1];
    const dz = useNormals ? g.N![i * 3 + 2] : dir[2];
    P[i * 3] += dx * v; P[i * 3 + 1] += dy * v; P[i * 3 + 2] += dz * v;
  }
  return makeGeo({ ...g, P });
}

export function setColor(g: GeometryData, rgba: [number, number, number, number]): GeometryData {
  const n = pointCount(g);
  const Cd = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) Cd.set(rgba, i * 4);
  return makeGeo({ ...g, Cd });
}

export function boundingBox(g: GeometryData): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < g.P.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], g.P[i + a]);
      max[a] = Math.max(max[a], g.P[i + a]);
    }
  }
  if (!g.P.length) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

// ---------------------------------------------------------------- internals

function strip(start: number, count: number): Uint32Array {
  const s = new Uint32Array(count);
  for (let i = 0; i < count; i++) s[i] = start + i;
  return s;
}

function gridTriangles(R: number, C: number): Uint32Array {
  const tris = new Uint32Array((R - 1) * (C - 1) * 6);
  let o = 0;
  for (let r = 0; r < R - 1; r++) {
    for (let c = 0; c < C - 1; c++) {
      const i = r * C + c;
      tris[o++] = i; tris[o++] = i + C; tris[o++] = i + C + 1;
      tris[o++] = i; tris[o++] = i + C + 1; tris[o++] = i + 1;
    }
  }
  return tris;
}

function defaultCd(n: number): Float32Array {
  const Cd = new Float32Array(n * 4);
  Cd.fill(1);
  return Cd;
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (const [dx, dy, dz, w] of [
    [0, 0, 0, (1 - ux) * (1 - uy) * (1 - uz)], [1, 0, 0, ux * (1 - uy) * (1 - uz)],
    [0, 1, 0, (1 - ux) * uy * (1 - uz)], [1, 1, 0, ux * uy * (1 - uz)],
    [0, 0, 1, (1 - ux) * (1 - uy) * uz], [1, 0, 1, ux * (1 - uy) * uz],
    [0, 1, 1, (1 - ux) * uy * uz], [1, 1, 1, ux * uy * uz],
  ] as const) {
    v += hash3(ix + dx, iy + dy, iz + dz) * w;
  }
  return v * 2 - 1;
}
