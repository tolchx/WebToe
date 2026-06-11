/**
 * WGSL pilot shaders (PLAN §4): constant, ramp, level — enough to prove the
 * pass contract is backend-neutral. Full parity is M7.
 *
 * Packing rule: binding 0 = Globals { res, time } (vec4 each); binding 1 =
 * op uniforms sorted by name, one vec4f per uniform (scalar in .x, vec2 in
 * .xy, color in .xyzw); binding 2 = sampler; bindings 3..6 = input textures.
 */

export const constantWgsl = `
struct Ops { u_color: vec4f }
@group(0) @binding(1) var<uniform> P: Ops;
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  return P.u_color;
}`;

export const rampWgsl = `
struct Ops { u_colora: vec4f, u_colorb: vec4f, u_phase: vec4f, u_type: vec4f }
@group(0) @binding(1) var<uniform> P: Ops;
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  var t: f32;
  if (P.u_type.x < 0.5) {
    t = in.uv.x;
  } else if (P.u_type.x < 1.5) {
    t = clamp(length(in.uv - 0.5) * 2.0, 0.0, 1.0);
  } else {
    t = atan2(in.uv.y - 0.5, in.uv.x - 0.5) / 6.28318530718 + 0.5;
  }
  t = fract(t + P.u_phase.x);
  return mix(P.u_colora, P.u_colorb, t);
}`;

export const levelWgsl = `
struct Ops { u_brightness: vec4f, u_contrast: vec4f, u_gamma: vec4f, u_invert: vec4f, u_opacity: vec4f }
@group(0) @binding(1) var<uniform> P: Ops;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var tex0: texture_2d<f32>;
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let c = textureSample(tex0, samp, in.uv);
  var rgb = c.rgb * P.u_brightness.x;
  rgb = (rgb - 0.5) * P.u_contrast.x + 0.5;
  rgb = pow(max(rgb, vec3f(0.0)), vec3f(1.0 / max(P.u_gamma.x, 1e-4)));
  rgb = mix(rgb, 1.0 - rgb, P.u_invert.x);
  return vec4f(rgb, c.a * P.u_opacity.x);
}`;

const NOISE_LIB_WGSL = `
fn hash3(p0: vec3f) -> f32 {
  var p = fract(p0 * vec3f(443.897, 441.423, 437.195));
  p = p + dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
fn vnoise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = hash3(i);
  let n100 = hash3(i + vec3f(1.0, 0.0, 0.0));
  let n010 = hash3(i + vec3f(0.0, 1.0, 0.0));
  let n110 = hash3(i + vec3f(1.0, 1.0, 0.0));
  let n001 = hash3(i + vec3f(0.0, 0.0, 1.0));
  let n101 = hash3(i + vec3f(1.0, 0.0, 1.0));
  let n011 = hash3(i + vec3f(0.0, 1.0, 1.0));
  let n111 = hash3(i + vec3f(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z);
}
fn fbm(p0: vec3f, harmonics: f32) -> f32 {
  var p = p0;
  var sum = 0.0;
  var amp = 0.5;
  var norm = 0.0;
  for (var o = 0; o < 8; o++) {
    if (f32(o) >= harmonics) { break; }
    sum = sum + vnoise(p) * amp;
    norm = norm + amp;
    amp = amp * 0.5;
    p = p * 2.03;
  }
  return select(0.0, sum / norm, norm > 0.0);
}`;

export const noiseWgsl = `${NOISE_LIB_WGSL}
struct Ops { u_exponent: vec4f, u_harmonics: vec4f, u_mono: vec4f, u_offset: vec4f, u_period: vec4f, u_speed: vec4f }
@group(0) @binding(0) var<uniform> G: Globals;
@group(0) @binding(1) var<uniform> P: Ops;
fn channel(p: vec3f, harmonics: f32, exponent: f32) -> f32 {
  return pow(clamp(fbm(p, harmonics), 0.0, 1.0), max(exponent, 1e-4));
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let uv = (in.uv + P.u_offset.xy) * max(G.res.x / G.res.y, 1.0);
  let p = vec3f(uv / max(P.u_period.x, 1e-4), G.time.x * P.u_speed.x);
  let h = P.u_harmonics.x;
  let e = P.u_exponent.x;
  let n = channel(p, h, e);
  var rgb = vec3f(n);
  if (P.u_mono.x < 0.5) {
    rgb = vec3f(n,
      channel(p + vec3f(13.7, 7.3, 5.1), h, e),
      channel(p + vec3f(29.1, 17.9, 11.3), h, e));
  }
  return vec4f(rgb, 1.0);
}`;

export const rectangleWgsl = `
struct Ops { u_bgcolor: vec4f, u_center: vec4f, u_color: vec4f, u_size: vec4f, u_softness: vec4f }
@group(0) @binding(0) var<uniform> G: Globals;
@group(0) @binding(1) var<uniform> P: Ops;
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let p = in.uv - P.u_center.xy;
  let d2 = abs(p) - P.u_size.xy * 0.5;
  let d = max(d2.x, d2.y);
  let aa = max(P.u_softness.x, 1.5 / G.res.y);
  let m = 1.0 - smoothstep(0.0, aa, d);
  return mix(P.u_bgcolor, P.u_color, m);
}`;

export const transformWgsl = `
struct Ops { u_extend: vec4f, u_pivot: vec4f, u_rotate: vec4f, u_scale: vec4f, u_translate: vec4f }
@group(0) @binding(1) var<uniform> P: Ops;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var tex0: texture_2d<f32>;
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  var uv = in.uv - P.u_pivot.xy - P.u_translate.xy;
  let a = radians(-P.u_rotate.x);
  let c = cos(a);
  let s = sin(a);
  uv = mat2x2f(vec2f(c, s), vec2f(-s, c)) * uv;
  let sc = P.u_scale.xy;
  uv = uv / (max(abs(sc), vec2f(1e-6)) * sign(sc + vec2f(1e-9)));
  uv = uv + P.u_pivot.xy;
  var inside = 1.0;
  let mode = P.u_extend.x;
  if (mode < 0.5) {
    uv = clamp(uv, vec2f(0.0), vec2f(1.0));
  } else if (mode < 1.5) {
    uv = fract(uv);
  } else if (mode < 2.5) {
    uv = abs(fract(uv * 0.5) * 2.0 - 1.0);
  } else {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { inside = 0.0; }
    uv = clamp(uv, vec2f(0.0), vec2f(1.0));
  }
  return textureSample(tex0, samp, uv) * inside;
}`;

export const monochromeWgsl = `
struct Ops { u_weights: vec4f }
@group(0) @binding(1) var<uniform> P: Ops;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var tex0: texture_2d<f32>;
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let c = textureSample(tex0, samp, in.uv);
  let w = P.u_weights.xyz;
  let lum = dot(c.rgb, w / max(w.x + w.y + w.z, 1e-6));
  return vec4f(vec3f(lum), c.a);
}`;

export const hsvadjustWgsl = `
struct Ops { u_hueoffset: vec4f, u_satmult: vec4f, u_valmult: vec4f }
@group(0) @binding(1) var<uniform> P: Ops;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var tex0: texture_2d<f32>;
fn rgb2hsv(c: vec3f) -> vec3f {
  let K = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4f(c.bg, K.wz), vec4f(c.gb, K.xy), step(c.b, c.g));
  let q = mix(vec4f(p.xyw, c.r), vec4f(c.r, p.yzx), step(p.x, c.r));
  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;
  return vec3f(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
fn hsv2rgb(c: vec3f) -> vec3f {
  let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let c = textureSample(tex0, samp, in.uv);
  var hsv = rgb2hsv(c.rgb);
  hsv.x = fract(hsv.x + P.u_hueoffset.x);
  hsv.y = clamp(hsv.y * P.u_satmult.x, 0.0, 1.0);
  hsv.z = hsv.z * P.u_valmult.x;
  return vec4f(hsv2rgb(hsv), c.a);
}`;

export const blurWgsl = `
struct Ops { u_dir: vec4f, u_size: vec4f }
@group(0) @binding(0) var<uniform> G: Globals;
@group(0) @binding(1) var<uniform> P: Ops;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var tex0: texture_2d<f32>;
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let radius = max(P.u_size.x, 0.0);
  if (radius < 0.01) { return textureSample(tex0, samp, in.uv); }
  let sigma = max(radius / 2.0, 0.5);
  let texel = P.u_dir.xy / G.res.xy;
  var sum = vec4f(0.0);
  var norm = 0.0;
  for (var i = -15; i <= 15; i++) {
    let x = f32(i);
    let w = select(0.0, exp(-(x * x) / (2.0 * sigma * sigma)), abs(x) <= radius);
    sum = sum + textureSample(tex0, samp, in.uv + texel * x) * w;
    norm = norm + w;
  }
  return sum / max(norm, 1e-6);
}`;

export const compositeWgsl = `
struct Ops { u_count: vec4f, u_op: vec4f }
@group(0) @binding(1) var<uniform> P: Ops;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var tex0: texture_2d<f32>;
@group(0) @binding(4) var tex1: texture_2d<f32>;
@group(0) @binding(5) var tex2: texture_2d<f32>;
@group(0) @binding(6) var tex3: texture_2d<f32>;
fn blend(base: vec4f, layer: vec4f) -> vec4f {
  let op = P.u_op.x;
  if (op < 0.5)      { return vec4f(mix(base.rgb, layer.rgb, layer.a), max(base.a, layer.a)); }
  else if (op < 1.5) { return vec4f(base.rgb + layer.rgb, max(base.a, layer.a)); }
  else if (op < 2.5) { return vec4f(base.rgb * layer.rgb, base.a); }
  else if (op < 3.5) { return vec4f(1.0 - (1.0 - base.rgb) * (1.0 - layer.rgb), max(base.a, layer.a)); }
  else if (op < 4.5) { return vec4f(base.rgb - layer.rgb, base.a); }
  return vec4f(abs(base.rgb - layer.rgb), max(base.a, layer.a));
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  var c = textureSample(tex0, samp, in.uv);
  let l1 = textureSample(tex1, samp, in.uv);
  let l2 = textureSample(tex2, samp, in.uv);
  let l3 = textureSample(tex3, samp, in.uv);
  if (P.u_count.x > 1.5) { c = blend(c, l1); }
  if (P.u_count.x > 2.5) { c = blend(c, l2); }
  if (P.u_count.x > 3.5) { c = blend(c, l3); }
  return c;
}`;

export const displaceWgsl = `
struct Ops { u_offset: vec4f, u_weight: vec4f }
@group(0) @binding(1) var<uniform> P: Ops;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var tex0: texture_2d<f32>;
@group(0) @binding(4) var tex1: texture_2d<f32>;
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let d = (textureSample(tex1, samp, in.uv).rg - 0.5) * P.u_weight.x + P.u_offset.xy;
  return textureSample(tex0, samp, clamp(in.uv + d, vec2f(0.0), vec2f(1.0)));
}`;

export const edgeWgsl = `
struct Ops { u_compinput: vec4f, u_edgecolor: vec4f, u_strength: vec4f }
@group(0) @binding(0) var<uniform> G: Globals;
@group(0) @binding(1) var<uniform> P: Ops;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var tex0: texture_2d<f32>;
fn lum(uv: vec2f) -> f32 {
  return dot(textureSample(tex0, samp, uv).rgb, vec3f(0.299, 0.587, 0.114));
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let t = 1.0 / G.res.xy;
  let tl = lum(in.uv + vec2f(-t.x,  t.y)); let tc = lum(in.uv + vec2f(0.0,  t.y)); let tr = lum(in.uv + vec2f(t.x,  t.y));
  let ml = lum(in.uv + vec2f(-t.x,  0.0));                                          let mr = lum(in.uv + vec2f(t.x,  0.0));
  let bl = lum(in.uv + vec2f(-t.x, -t.y)); let bc = lum(in.uv + vec2f(0.0, -t.y)); let br = lum(in.uv + vec2f(t.x, -t.y));
  let gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  let gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  let e = clamp(length(vec2f(gx, gy)) * P.u_strength.x, 0.0, 1.0);
  let src = textureSample(tex0, samp, in.uv);
  let edges = P.u_edgecolor * e;
  if (P.u_compinput.x > 0.5) {
    return vec4f(mix(src.rgb, P.u_edgecolor.rgb, e), max(src.a, edges.a));
  }
  return edges;
}`;

export const placeholderWgsl = `
struct Ops { u_tint: vec4f }
@group(0) @binding(1) var<uniform> P: Ops;
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let d = fract((in.uv.x + in.uv.y) * 12.0);
  let band = step(0.5, d) * 0.08 + 0.06;
  return vec4f(vec3f(band) + P.u_tint.rgb * 0.15, 1.0);
}`;