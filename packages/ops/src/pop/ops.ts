/**
 * POP (Particle Operator) family — CPU-side point generators and modifiers.
 *
 * Each op outputs point-based GeometryData (P, v, Cd, N, uv) that feeds into
 * the SOP/geometry pipeline.  These ops work immediately under WebGL2 without
 * requiring WebGPU compute — typed-array fallback produces identical results.
 *
 * The WebGPU compute path lives in ./glsl.ts and replaces cook() when the
 * engine runs on a WebGPU backend.
 *
 * Conventions match those in ../sop/ops.ts and ../sop/geo.ts.
 */

import type { OpSpec, OpOutput, GeometryData } from '@webtoe/core';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

let _nextVersion = 1;

function bumpVersion(): number {
  return _nextVersion++;
}

/** Create a GeometryData with an auto-incremented VAO-cache version. */
function geo(g: Omit<GeometryData, 'version'>): GeometryData {
  return { ...g, version: bumpVersion() };
}

/** Empty point set. */
function empty(): GeometryData {
  return geo({ P: new Float32Array(0), renderPoints: true });
}

/** Pull a GeometryData out of an OpOutput (or null). */
function asGeo(out: OpOutput | undefined | null): GeometryData | null {
  return out && out.kind === 'sop' ? out.geo : null;
}

/** Number of points (P is interleaved xyz). */
function pointCount(g: GeometryData): number {
  return g.P.length / 3;
}

// ---------------------------------------------------------------------------
// point-generation seeds (deterministic, no external libs)
// ---------------------------------------------------------------------------

function hash3(px: number, py: number, pz: number): number {
  const s = Math.sin(px * 127.1 + py * 311.7 + pz * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Simple value-noise for noise-op displacement. */
function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let v = 0;
  const weigh = (dx: number, dy: number, dz: number, w: number) => {
    v += hash3(ix + dx, iy + dy, iz + dz) * w;
  };
  weigh(0, 0, 0, (1 - ux) * (1 - uy) * (1 - uz));
  weigh(1, 0, 0, ux * (1 - uy) * (1 - uz));
  weigh(0, 1, 0, (1 - ux) * uy * (1 - uz));
  weigh(1, 1, 0, ux * uy * (1 - uz));
  weigh(0, 0, 1, (1 - ux) * (1 - uy) * uz);
  weigh(1, 0, 1, ux * (1 - uy) * uz);
  weigh(0, 1, 1, (1 - ux) * uy * uz);
  weigh(1, 1, 1, ux * uy * uz);
  return v * 2 - 1;
}

// ---------------------------------------------------------------------------
// POP family constant (not yet in core Family union — cast for forward compat)
// ---------------------------------------------------------------------------
const F = 'POP' as unknown as import('@webtoe/core').Family;

// ---------------------------------------------------------------------------
// 8 POP operator specs
// ---------------------------------------------------------------------------

/** OP 1 — pop:sphere — points distributed on a sphere surface. */
const popSphere: OpSpec = {
  type: 'pop:sphere',
  family: F,
  label: 'sphere (POP)',
  inputs: { min: 0, max: 0 },
  params: [
    { key: 'count', type: 'int', default: 100, min: 1, max: 100000 },
    { key: 'radius', type: 'float', default: 0.5, min: 0, max: 10 },
    { key: 'seed', type: 'float', default: 1, min: 0, max: 100 },
  ],
  cook(ctx) {
    const count = Math.max(1, Math.round(ctx.paramNum('count')));
    const radius = ctx.paramNum('radius');
    const seed = ctx.paramNum('seed');

    const P = new Float32Array(count * 3);
    const N = new Float32Array(count * 3);
    const Cd = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
      // Deterministic random angles via sin/cos hash
      const hashA = (hash3(i + 1, seed, 0.1) * 2 - 1) * 0.9999; // avoid polar singularity
      const theta = hash3(i + 1, seed, 0.2) * Math.PI * 2;
      const phi = Math.acos(hashA);

      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.sin(phi) * Math.sin(theta);
      const nz = Math.cos(phi);

      P[i * 3]     = nx * radius;
      P[i * 3 + 1] = ny * radius;
      P[i * 3 + 2] = nz * radius;

      N[i * 3]     = nx;
      N[i * 3 + 1] = ny;
      N[i * 3 + 2] = nz;

      // Color based on position (rainbow-like)
      Cd[i * 4]     = (nx + 1) * 0.5;
      Cd[i * 4 + 1] = (ny + 1) * 0.5;
      Cd[i * 4 + 2] = (nz + 1) * 0.5;
      Cd[i * 4 + 3] = 1;
    }

    return { kind: 'sop', geo: geo({ P, N, Cd, renderPoints: true }) };
  },
};

/** OP 2 — pop:grid — grid of points in XY plane. */
const popGrid: OpSpec = {
  type: 'pop:grid',
  family: F,
  label: 'grid (POP)',
  inputs: { min: 0, max: 0 },
  params: [
    { key: 'rows', type: 'int', default: 10, min: 1, max: 500 },
    { key: 'cols', type: 'int', default: 10, min: 1, max: 500 },
    { key: 'sizex', type: 'float', default: 1, min: 0, max: 8 },
    { key: 'sizey', type: 'float', default: 1, min: 0, max: 8 },
  ],
  cook(ctx) {
    const rows = Math.max(1, Math.round(ctx.paramNum('rows')));
    const cols = Math.max(1, Math.round(ctx.paramNum('cols')));
    const sx = ctx.paramNum('sizex');
    const sy = ctx.paramNum('sizey');
    const n = rows * cols;

    const P = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const Cd = new Float32Array(n * 4);

    const rMax = rows - 1, cMax = cols - 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const u = rMax > 0 ? r / rMax : 0.5;
        const v = cMax > 0 ? c / cMax : 0.5;
        P[i * 3]     = (v - 0.5) * sx;
        P[i * 3 + 1] = (u - 0.5) * sy;
        P[i * 3 + 2] = 0;
        uv[i * 2]     = v;
        uv[i * 2 + 1] = u;
        Cd[i * 4]     = v;
        Cd[i * 4 + 1] = u;
        Cd[i * 4 + 2] = 0.5 + 0.5 * Math.sin(u * v * Math.PI * 2);
        Cd[i * 4 + 3] = 1;
      }
    }

    return { kind: 'sop', geo: geo({ P, uv, Cd, renderPoints: true }) };
  },
};

/** OP 3 — pop:particle — birth + lifecycle: generates P, v, Cd attributes. */
const popParticle: OpSpec = {
  type: 'pop:particle',
  family: F,
  label: 'particle',
  inputs: { min: 1, max: 1 },
  alwaysCook: true,
  params: [
    { key: 'count', type: 'int', default: 200, min: 1, max: 100000 },
    { key: 'lifespan', type: 'float', default: 2, min: 0.1, max: 60 },
    { key: 'speed', type: 'float', default: 0.1, min: 0, max: 10 },
    { key: 'spread', type: 'float', default: 0.3, min: 0, max: 5 },
    { key: 'seed', type: 'float', default: 1, min: 0, max: 100 },
  ],
  cook(ctx) {
    const count = Math.max(1, Math.round(ctx.paramNum('count')));
    const lifespan = ctx.paramNum('lifespan');
    const speed = ctx.paramNum('speed');
    const spread = ctx.paramNum('spread');
    const seed = ctx.paramNum('seed');
    const t = ctx.time.seconds;

    const n = count;
    const P = new Float32Array(n * 3);
    const Cd = new Float32Array(n * 4);
    // Store per-particle age as a single-component "v" array (we reuse v for age).
    // N is repurposed here as the velocity direction.
    const vel = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      const age = ((t + i * 0.037) % lifespan) / lifespan; // 0→1 over lifespan
      // Birth position near origin with spread
      const bx = (hash3(i, seed, 0.1) * 2 - 1) * spread;
      const by = (hash3(i, seed, 0.2) * 2 - 1) * spread;
      const bz = (hash3(i, seed, 0.3) * 2 - 1) * spread;
      // Velocity direction (random)
      const vx = (hash3(i, seed, 0.4) * 2 - 1);
      const vy = (hash3(i, seed, 0.5) * 2 - 1) * 0.5 + 0.5; // bias upward
      const vz = (hash3(i, seed, 0.6) * 2 - 1);
      const vl = Math.hypot(vx, vy, vz) || 1;
      const dx = vx / vl, dy = vy / vl, dz = vz / vl;

      const offset = age * speed;
      P[i * 3]     = bx + dx * offset;
      P[i * 3 + 1] = by + dy * offset;
      P[i * 3 + 2] = bz + dz * offset;

      vel[i * 3]     = dx * speed;
      vel[i * 3 + 1] = dy * speed;
      vel[i * 3 + 2] = dz * speed;

      // Fade alpha with age
      Cd[i * 4]     = 0.6 + 0.4 * Math.sin(i * 0.1);
      Cd[i * 4 + 1] = 0.3 + 0.7 * (1 - age);
      Cd[i * 4 + 2] = 0.8 + 0.2 * Math.cos(i * 0.07);
      Cd[i * 4 + 3] = Math.max(0, 1 - age);
    }

    // Encode velocity as N so the renderer can use it for motion vectors etc.
    return { kind: 'sop', geo: geo({ P, N: vel, Cd, renderPoints: true }) };
  },
};

/** OP 4 — pop:noise — displaces incoming points with sin/cos-based pseudo-noise. */
const popNoise: OpSpec = {
  type: 'pop:noise',
  family: F,
  label: 'noise (POP)',
  inputs: { min: 1, max: 1 },
  alwaysCook: true,
  params: [
    { key: 'amount', type: 'float', default: 0.15, min: 0, max: 2 },
    { key: 'frequency', type: 'float', default: 1, min: 0.05, max: 10 },
    { key: 'phase', type: 'float', default: 0, min: 0, max: 100 },
    { key: 'seed', type: 'float', default: 1, min: 0, max: 100 },
    { key: 'useNormals', type: 'toggle', default: true },
  ],
  cook(ctx) {
    const src = asGeo(ctx.inputs[0]);
    if (!src) return { kind: 'sop', geo: empty() };

    const amount = ctx.paramNum('amount');
    const freq = ctx.paramNum('frequency');
    const phase = ctx.paramNum('phase');
    const seed = ctx.paramNum('seed');
    const useN = ctx.paramBool('useNormals') && !!src.N;

    const n = pointCount(src);
    const P = new Float32Array(src.P);
    const p = Math.max(1e-4, freq);

    for (let i = 0; i < n; i++) {
      const x = src.P[i * 3] / p, y = src.P[i * 3 + 1] / p, z = src.P[i * 3 + 2] / p;
      const nv = noise3(x + phase, y + seed * 13.7, z + phase * 0.7) * amount;

      if (useN) {
        P[i * 3]     += src.N![i * 3]     * nv;
        P[i * 3 + 1] += src.N![i * 3 + 1] * nv;
        P[i * 3 + 2] += src.N![i * 3 + 2] * nv;
      } else {
        P[i * 3]     += nv;
        P[i * 3 + 1] += nv * 0.5;
        P[i * 3 + 2] += nv * 0.3;
      }
    }

    return { kind: 'sop', geo: geo({ ...src, P }) };
  },
};

/** OP 5 — pop:force — applies directional force to P like a constant acceleration. */
const popForce: OpSpec = {
  type: 'pop:force',
  family: F,
  label: 'force (POP)',
  inputs: { min: 1, max: 1 },
  alwaysCook: true,
  params: [
    { key: 'dirx', type: 'float', default: 0, min: -1, max: 1 },
    { key: 'diry', type: 'float', default: 0, min: -1, max: 1 },
    { key: 'dirz', type: 'float', default: 0, min: -1, max: 1 },
    { key: 'magnitude', type: 'float', default: 0.1, min: 0, max: 5 },
  ],
  cook(ctx) {
    const src = asGeo(ctx.inputs[0]);
    if (!src) return { kind: 'sop', geo: empty() };

    const dx = ctx.paramNum('dirx');
    const dy = ctx.paramNum('diry');
    const dz = ctx.paramNum('dirz');
    const mag = ctx.paramNum('magnitude');
    const dt = ctx.time.delta;

    // Normalise direction
    const len = Math.hypot(dx, dy, dz) || 1;
    const fx = (dx / len) * mag;
    const fy = (dy / len) * mag;
    const fz = (dz / len) * mag;

    const n = pointCount(src);
    const P = new Float32Array(src.P);
    const d = dt * 60; // normalise to ~60 fps base

    for (let i = 0; i < n; i++) {
      P[i * 3]     += fx * d;
      P[i * 3 + 1] += fy * d;
      P[i * 3 + 2] += fz * d;
    }

    return { kind: 'sop', geo: geo({ ...src, P }) };
  },
};

/** OP 6 — pop:trail — copies P multiple times with a position/age offset creating trail geometry. */
const popTrail: OpSpec = {
  type: 'pop:trail',
  family: F,
  label: 'trail (POP)',
  inputs: { min: 1, max: 1 },
  alwaysCook: true,
  params: [
    { key: 'length', type: 'int', default: 10, min: 2, max: 200 },
    { key: 'spacing', type: 'float', default: 0.02, min: 0, max: 1 },
    { key: 'fade', type: 'toggle', default: true },
  ],
  cook(ctx) {
    const src = asGeo(ctx.inputs[0]);
    if (!src) return { kind: 'sop', geo: empty() };

    const length = Math.max(2, Math.round(ctx.paramNum('length')));
    const spacing = ctx.paramNum('spacing');
    const doFade = ctx.paramBool('fade');
    const srcN = pointCount(src);

    const totalPts = srcN * length;
    const P = new Float32Array(totalPts * 3);
    const Cd = new Float32Array(totalPts * 4);
    const lineStrips: Uint32Array[] = [];
    const hasCd = !!src.Cd;

    for (let p = 0; p < srcN; p++) {
      const baseX = src.P[p * 3], baseY = src.P[p * 3 + 1], baseZ = src.P[p * 3 + 2];
      const strip = new Uint32Array(length);
      for (let k = 0; k < length; k++) {
        const idx = p * length + k;
        const t = k / (length - 1);
        // Trail points recede in x/z direction with age
        const ageOffset = k * spacing;
        P[idx * 3]     = baseX - ageOffset * (1 + Math.sin(p * 0.1));
        P[idx * 3 + 1] = baseY + Math.sin(k * 0.5) * 0.02;
        P[idx * 3 + 2] = baseZ - ageOffset * (1 + Math.cos(p * 0.1));

        strip[k] = idx;

        // Colour: copy source Cd if available, otherwise fade with age
        if (hasCd) {
          const sc = p * 4;
          Cd[idx * 4]     = src.Cd![sc];
          Cd[idx * 4 + 1] = src.Cd![sc + 1];
          Cd[idx * 4 + 2] = src.Cd![sc + 2];
          Cd[idx * 4 + 3] = doFade ? src.Cd![sc + 3] * (1 - t) : src.Cd![sc + 3];
        } else {
          Cd[idx * 4]     = 0.2 + 0.8 * (1 - t);
          Cd[idx * 4 + 1] = 0.1 + 0.4 * (1 - t);
          Cd[idx * 4 + 2] = 0.6 + 0.4 * (1 - t);
          Cd[idx * 4 + 3] = doFade ? 1 - t : 1;
        }
      }
      lineStrips.push(strip);
    }

    return {
      kind: 'sop',
      geo: geo({ P, Cd, lineStrips, renderPoints: true }),
    };
  },
};

/** OP 7 — pop:null — passthrough. */
const popNull: OpSpec = {
  type: 'pop:null',
  family: F,
  label: 'null (POP)',
  inputs: { min: 1, max: 1 },
  params: [],
  cook(ctx) {
    const g = asGeo(ctx.inputs[0]);
    if (!g) return null;
    return { kind: 'sop', geo: g };
  },
};

/** OP 8 — pop:merge — combines point sets from up to 4 inputs. */
const popMerge: OpSpec = {
  type: 'pop:merge',
  family: F,
  label: 'merge (POP)',
  inputs: { min: 1, max: 4 },
  params: [],
  cook(ctx) {
    const geos = ctx.inputs.map(asGeo).filter((g): g is GeometryData => !!g);
    if (!geos.length) return { kind: 'sop', geo: empty() };
    if (geos.length === 1) return { kind: 'sop', geo: geos[0] };

    const totalPts = geos.reduce((a, g) => a + pointCount(g), 0);
    const P = new Float32Array(totalPts * 3);
    const hasN = geos.some((g) => !!g.N);
    const hasUv = geos.some((g) => !!g.uv);
    const hasCd = geos.some((g) => !!g.Cd);
    const N = hasN ? new Float32Array(totalPts * 3) : undefined;
    const uv = hasUv ? new Float32Array(totalPts * 2) : undefined;
    const Cd = hasCd ? new Float32Array(totalPts * 4) : undefined;
    const strips: Uint32Array[] = [];
    let anyRenderPoints = false;
    let off = 0;

    for (const g of geos) {
      const n = pointCount(g);
      P.set(g.P, off * 3);
      if (N && g.N) N.set(g.N, off * 3);
      if (uv && g.uv) uv.set(g.uv, off * 2);
      if (Cd && g.Cd) Cd.set(g.Cd, off * 4);
      if (g.lineStrips) {
        for (const s of g.lineStrips) {
          const shifted = new Uint32Array(s.length);
          for (let k = 0; k < s.length; k++) shifted[k] = s[k] + off;
          strips.push(shifted);
        }
      }
      if (g.renderPoints) anyRenderPoints = true;
      off += n;
    }

    return {
      kind: 'sop',
      geo: geo({ P, N, uv, Cd, lineStrips: strips.length ? strips : undefined, renderPoints: anyRenderPoints }),
    };
  },
};

// ---------------------------------------------------------------------------
// exported array — imported by packages/ops/src/index.ts
// ---------------------------------------------------------------------------

export const popOps: OpSpec[] = [
  popSphere,
  popGrid,
  popParticle,
  popNoise,
  popForce,
  popTrail,
  popNull,
  popMerge,
];
