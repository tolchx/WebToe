/**
 * GLSL compute shader strings for the POP (Particle Operator) WebGPU path.
 *
 * Each string is a complete GLSL compute shader that can be compiled to SPIR-V
 * and translated to WGSL for WebGPU.  The CPU-side fallback lives in ./ops.ts;
 * these shaders replace the JS path when the engine runs on WebGPU/WGSL.
 *
 * Conventions:
 *   - #version 430 (desktop GL compute — translated to WGSL at build time)
 *   - layout(local_size_x = 64) — 1-D workgroup
 *   - SSBOs for point buffers (P, N, v, Cd, uv) with std430 layout
 *   - Uniform block per shader owns its op-specific parameters
 *   - Global uniforms (time, frame, delta, seed) in a shared block
 */

// ---------------------------------------------------------------------------
// Shared preamble: global uniforms + buffer declarations
// ---------------------------------------------------------------------------

/** Global uniforms injected by the engine every frame. */
const GLOBALS = `// global POP uniforms
layout(std140, binding = 0) uniform Globals {
  float u_time;
  float u_delta;
  float u_frame;
  float u_padding0;
  vec2  u_res;
  vec2  u_padding1;
  float u_seed;
  float u_padding2[2];
};
`;

/** Standard SSBO for point data (positions). */
const P_BUFFER = `layout(std430, binding = 1) readonly buffer PointsIn {
  float data[];  // interleaved xyz per point, size = count * 3
} u_P_in;

layout(std430, binding = 2) buffer PointsOut {
  float data[];
} u_P_out;
`;

/** Optional normal / velocity buffer. */
const N_BUFFER = `layout(std430, binding = 3) buffer Normals {
  float data[];
} u_N;
`;

// ---------------------------------------------------------------------------
// Helper library included at the top of each shader
// ---------------------------------------------------------------------------

const COMMON_HELPERS = `
uint idx() { return gl_GlobalInvocationID.x; }

// Simple deterministic hash for point seeding
float hash1(float n) {
  return fract(sin(n * 127.1 + n * 311.7) * 43758.5453123);
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float hash3(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

// Smooth 3-D value noise (used by pop:noise)
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash3(i);
  float n100 = hash3(i + vec3(1, 0, 0));
  float n010 = hash3(i + vec3(0, 1, 0));
  float n110 = hash3(i + vec3(1, 1, 0));
  float n001 = hash3(i + vec3(0, 0, 1));
  float n101 = hash3(i + vec3(1, 0, 1));
  float n011 = hash3(i + vec3(0, 1, 1));
  float n111 = hash3(i + vec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z);
}
`;

// ---------------------------------------------------------------------------
// Individual compute shaders
// ---------------------------------------------------------------------------

/**
 * pop:sphere — generate points distributed on a sphere surface.
 * Each work item generates one point from per-invocation hash.
 */
export const sphereGlsl = `#version 430
${GLOBALS}
${COMMON_HELPERS}
layout(local_size_x = 64) in;
layout(std140, binding = 10) uniform SphereParams {
  float u_count;
  float u_radius;
  float u_pointSeed;
  float u_pad;
};
layout(std430, binding = 2) buffer PosOut { float data[]; } u_P;
layout(std430, binding = 4) buffer ColOut { float data[]; } u_Cd;

void main() {
  uint i = idx();
  float n = float(i);

  // Deterministic spherical distribution
  float theta = hash1(n * 1.371 + u_pointSeed * 7.13) * 6.2831853;
  float phi   = acos((hash1(n * 2.741 + u_pointSeed * 3.17) * 2.0 - 1.0) * 0.9999);

  float sx = sin(phi) * cos(theta);
  float sy = sin(phi) * sin(theta);
  float sz = cos(phi);

  u_P.data[i * 3]     = sx * u_radius;
  u_P.data[i * 3 + 1] = sy * u_radius;
  u_P.data[i * 3 + 2] = sz * u_radius;

  u_Cd.data[i * 4]     = (sx + 1.0) * 0.5;
  u_Cd.data[i * 4 + 1] = (sy + 1.0) * 0.5;
  u_Cd.data[i * 4 + 2] = (sz + 1.0) * 0.5;
  u_Cd.data[i * 4 + 3] = 1.0;
}
`;

/**
 * pop:grid — generate a structured grid of points in XY plane.
 */
export const gridGlsl = `#version 430
${GLOBALS}
${COMMON_HELPERS}
layout(local_size_x = 64) in;
layout(std140, binding = 10) uniform GridParams {
  float u_rows;
  float u_cols;
  float u_sizex;
  float u_sizey;
};
layout(std430, binding = 2) buffer PosOut { float data[]; } u_P;
layout(std430, binding = 5) buffer UvOut { float data[]; } u_uv;
layout(std430, binding = 4) buffer ColOut { float data[]; } u_Cd;

void main() {
  uint i = idx();
  float cols = u_cols;
  float rows = u_rows;
  uint r = i / uint(cols);
  uint c = i % uint(cols);

  if (r >= uint(rows)) return;

  float u = r / max(rows - 1.0, 1.0);
  float v = c / max(cols - 1.0, 1.0);

  u_P.data[i * 3]     = (v - 0.5) * u_sizex;
  u_P.data[i * 3 + 1] = (u - 0.5) * u_sizey;
  u_P.data[i * 3 + 2] = 0.0;

  u_uv.data[i * 2]     = v;
  u_uv.data[i * 2 + 1] = u;

  u_Cd.data[i * 4]     = v;
  u_Cd.data[i * 4 + 1] = u;
  u_Cd.data[i * 4 + 2] = 0.5 + 0.5 * sin(u * v * 6.2831853);
  u_Cd.data[i * 4 + 3] = 1.0;
}
`;

/**
 * pop:particle — birth + lifecycle: generates / updates P, v, Cd each frame.
 * Per-point lifespan cycling drives position from birth-point along its velocity.
 */
export const particleGlsl = `#version 430
${GLOBALS}
${COMMON_HELPERS}
layout(local_size_x = 64) in;
layout(std140, binding = 10) uniform ParticleParams {
  float u_count;
  float u_lifespan;
  float u_speed;
  float u_spread;
};
layout(std430, binding = 2) buffer PosOut { float data[]; } u_P;
layout(std430, binding = 3) buffer VelOut { float data[]; } u_vel;
layout(std430, binding = 4) buffer ColOut { float data[]; } u_Cd;

void main() {
  uint i = idx();
  float n = float(i);

  // Per-particle seed derived from index + global seed
  float s0 = hash1(n * 1.137 + u_seed);
  float s1 = hash1(n * 3.271 + u_seed * 2.0);
  float s2 = hash1(n * 5.913 + u_seed * 3.0);
  float s3 = hash1(n * 7.421 + u_seed * 4.0);

  // Birth position
  float bx = (s0 * 2.0 - 1.0) * u_spread;
  float by = (s1 * 2.0 - 1.0) * u_spread;
  float bz = (s2 * 2.0 - 1.0) * u_spread;

  // Velocity direction
  float vx = s0 * 2.0 - 1.0;
  float vy = (s1 * 2.0 - 1.0) * 0.5 + 0.5;
  float vz = s2 * 2.0 - 1.0;
  float vl = length(vec3(vx, vy, vz)) + 1e-8;
  vec3 dir = vec3(vx, vy, vz) / vl;

  // Age cycles over lifespan
  float age = fract((u_time + n * 0.037) / max(u_lifespan, 0.1));

  vec3 pos = vec3(bx, by, bz) + dir * age * u_speed;

  u_P.data[i * 3]     = pos.x;
  u_P.data[i * 3 + 1] = pos.y;
  u_P.data[i * 3 + 2] = pos.z;

  u_vel.data[i * 3]     = dir.x * u_speed;
  u_vel.data[i * 3 + 1] = dir.y * u_speed;
  u_vel.data[i * 3 + 2] = dir.z * u_speed;

  u_Cd.data[i * 4]     = 0.6 + 0.4 * sin(n * 0.1);
  u_Cd.data[i * 4 + 1] = 0.3 + 0.7 * (1.0 - age);
  u_Cd.data[i * 4 + 2] = 0.8 + 0.2 * cos(n * 0.07);
  u_Cd.data[i * 4 + 3] = max(0.0, 1.0 - age);
}
`;

/**
 * pop:noise — displace existing points along normals (or a fixed direction)
 * using 3-D value noise.
 */
export const noiseGlsl = `#version 430
${GLOBALS}
${COMMON_HELPERS}
layout(local_size_x = 64) in;
layout(std140, binding = 10) uniform NoiseParams {
  float u_amount;
  float u_frequency;
  float u_phase;
  float u_useNormals;
};
${P_BUFFER}
${N_BUFFER}

void main() {
  uint i = idx();
  vec3 p = vec3(
    u_P_in.data[i * 3],
    u_P_in.data[i * 3 + 1],
    u_P_in.data[i * 3 + 2]
  );
  vec3 freq = vec3(1.0) / max(u_frequency, 1e-4);

  float n = vnoise(p * freq + vec3(u_phase, u_seed * 13.7, u_phase * 0.7)) * u_amount;

  if (u_useNormals > 0.5 && u_N.data.length() > 0u) {
    vec3 norm = vec3(u_N.data[i * 3], u_N.data[i * 3 + 1], u_N.data[i * 3 + 2]);
    u_P_out.data[i * 3]     = p.x + norm.x * n;
    u_P_out.data[i * 3 + 1] = p.y + norm.y * n;
    u_P_out.data[i * 3 + 2] = p.z + norm.z * n;
  } else {
    u_P_out.data[i * 3]     = p.x + n;
    u_P_out.data[i * 3 + 1] = p.y + n * 0.5;
    u_P_out.data[i * 3 + 2] = p.z + n * 0.3;
  }
}
`;

/**
 * pop:force — apply a directional acceleration to every point.
 * Increments position by (forceDir * magnitude * delta) each frame.
 */
export const forceGlsl = `#version 430
${GLOBALS}
layout(local_size_x = 64) in;
layout(std140, binding = 10) uniform ForceParams {
  float u_dirx;
  float u_diry;
  float u_dirz;
  float u_magnitude;
};
${P_BUFFER}

void main() {
  uint i = idx();
  float len = length(vec3(u_dirx, u_diry, u_dirz));
  float l = len < 1e-8 ? 1.0 : len;
  vec3 f = vec3(u_dirx, u_diry, u_dirz) / l * u_magnitude;

  // Normalise to ~60 fps base
  float d = u_delta * 60.0;

  u_P_out.data[i * 3]     = u_P_in.data[i * 3]     + f.x * d;
  u_P_out.data[i * 3 + 1] = u_P_in.data[i * 3 + 1] + f.y * d;
  u_P_out.data[i * 3 + 2] = u_P_in.data[i * 3 + 2] + f.z * d;
}
`;

/**
 * pop:trail — replicates each input point `length` times with a spatial offset,
 * building per-point line strips and fade-colour.
 */
export const trailGlsl = `#version 430
${GLOBALS}
${COMMON_HELPERS}
layout(local_size_x = 64) in;
layout(std140, binding = 10) uniform TrailParams {
  float u_length;
  float u_spacing;
  float u_fade;
  float u_pad;
};
layout(std430, binding = 1) readonly buffer SrcPoints { float data[]; } u_src;
layout(std430, binding = 2) buffer DstPoints { float data[]; } u_dst;
layout(std430, binding = 4) buffer DstColors { float data[]; } u_dstCd;

void main() {
  uint i = idx();
  uint len = uint(max(u_length, 2.0));
  uint srcIdx = i / len;       // source point index
  uint copyId = i % len;       // which copy along the trail
  float t = float(copyId) / max(float(len - 1), 1.0);

  vec3 src = vec3(
    u_src.data[srcIdx * 3],
    u_src.data[srcIdx * 3 + 1],
    u_src.data[srcIdx * 3 + 2]
  );

  float ageOffset = float(copyId) * u_spacing;
  float wave = sin(float(srcIdx) * 0.1);

  u_dst.data[i * 3]     = src.x - ageOffset * (1.0 + wave);
  u_dst.data[i * 3 + 1] = src.y + sin(float(copyId) * 0.5) * 0.02;
  u_dst.data[i * 3 + 2] = src.z - ageOffset * (1.0 + cos(float(srcIdx) * 0.1));

  if (u_fade > 0.5) {
    u_dstCd.data[i * 4]     = 0.2 + 0.8 * (1.0 - t);
    u_dstCd.data[i * 4 + 1] = 0.1 + 0.4 * (1.0 - t);
    u_dstCd.data[i * 4 + 2] = 0.6 + 0.4 * (1.0 - t);
    u_dstCd.data[i * 4 + 3] = 1.0 - t;
  } else {
    u_dstCd.data[i * 4]     = 0.2 + 0.8 * (1.0 - t);
    u_dstCd.data[i * 4 + 1] = 0.1 + 0.4 * (1.0 - t);
    u_dstCd.data[i * 4 + 2] = 0.6 + 0.4 * (1.0 - t);
    u_dstCd.data[i * 4 + 3] = 1.0;
  }
}
`;

/**
 * pop:null — passthrough (identity copy).
 */
export const nullGlsl = `#version 430
${GLOBALS}
layout(local_size_x = 64) in;
${P_BUFFER}

void main() {
  uint i = idx();
  u_P_out.data[i * 3]     = u_P_in.data[i * 3];
  u_P_out.data[i * 3 + 1] = u_P_in.data[i * 3 + 1];
  u_P_out.data[i * 3 + 2] = u_P_in.data[i * 3 + 2];
}
`;

/**
 * pop:merge — concatenates points from up to 4 input buffers into one output.
 * Each source buffer has its own SSBO; a CPU-side pass metadata struct tells
 * the shader how many points each source contributes.
 */
export const mergeGlsl = `#version 430
${GLOBALS}
layout(local_size_x = 64) in;
layout(std140, binding = 10) uniform MergeMeta {
  uint u_src0_count;
  uint u_src1_count;
  uint u_src2_count;
  uint u_src3_count;
};
layout(std430, binding = 1) readonly buffer Src0 { float data[]; } u_s0;
layout(std430, binding = 2) readonly buffer Src1 { float data[]; } u_s1;
layout(std430, binding = 3) readonly buffer Src2 { float data[]; } u_s2;
layout(std430, binding = 4) readonly buffer Src3 { float data[]; } u_s3;
layout(std430, binding = 5) buffer Dst { float data[]; } u_dst;

void main() {
  uint i = idx();
  float v = 0.0;

  // Determine which source this invocation reads from (accumulative offsets)
  if (i < u_src0_count) {
    v = u_s0.data[i];
  } else if (i < u_src0_count + u_src1_count) {
    v = u_s1.data[i - u_src0_count];
  } else if (i < u_src0_count + u_src1_count + u_src2_count) {
    v = u_s2.data[i - u_src0_count - u_src1_count];
  } else {
    v = u_s3.data[i - u_src0_count - u_src1_count - u_src2_count];
  }
  u_dst.data[i] = v;
}
`;

// ---------------------------------------------------------------------------
// Index for backend lookup — keyed by POP operator type
// ---------------------------------------------------------------------------

export const popGlslShaders: Record<string, string> = {
  'pop:sphere':   sphereGlsl,
  'pop:grid':     gridGlsl,
  'pop:particle': particleGlsl,
  'pop:noise':    noiseGlsl,
  'pop:force':    forceGlsl,
  'pop:trail':    trailGlsl,
  'pop:null':     nullGlsl,
  'pop:merge':    mergeGlsl,
};
