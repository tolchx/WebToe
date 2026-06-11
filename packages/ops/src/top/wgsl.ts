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
