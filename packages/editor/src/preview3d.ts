/** Auto-orbit preview scene for SOP geometry (node thumbnails + viewer). */
import { mat4, type GeometryData, type MaterialSpec, type ScenePassSpec } from '@webtoe/core';

export function previewSpec(geo: GeometryData, seconds: number): ScenePassSpec {
  // bounding sphere
  let cx = 0, cy = 0, cz = 0;
  const n = geo.P.length / 3;
  for (let i = 0; i < geo.P.length; i += 3) {
    cx += geo.P[i]; cy += geo.P[i + 1]; cz += geo.P[i + 2];
  }
  if (n) { cx /= n; cy /= n; cz /= n; }
  let r = 0.001;
  for (let i = 0; i < geo.P.length; i += 3) {
    r = Math.max(r, Math.hypot(geo.P[i] - cx, geo.P[i + 1] - cy, geo.P[i + 2] - cz));
  }

  const az = seconds * 0.6;
  const dist = r * 2.6;
  const eye: [number, number, number] = [
    cx + Math.cos(az) * dist,
    cy + dist * 0.45,
    cz + Math.sin(az) * dist,
  ];
  const view = mat4.lookAt(eye, [cx, cy, cz]);
  const proj = mat4.perspective(40, 16 / 9, Math.max(dist / 1000, 0.001), dist * 10);

  const material: MaterialSpec = geo.triangles?.length
    ? { shading: 'lit', color: [0.78, 0.8, 0.85, 1], roughness: 0.55, metallic: 0.05 }
    : geo.lineStrips?.length
      ? { shading: 'line', color: [0.95, 0.95, 1, 1], pointSize: 2 }
      : { shading: 'points', color: [0.95, 0.95, 1, 1], pointSize: 3 };

  return {
    camera: { view, proj },
    lights: [
      { kind: 'directional', color: [1, 1, 1], intensity: 0.9, position: [0, 0, 0], direction: [-eye[0] + cx, -eye[1] + cy, -eye[2] + cz] },
      { kind: 'ambient', color: [1, 1, 1], intensity: 0.25, position: [0, 0, 0], direction: [0, 0, -1] },
    ],
    draws: [{ geo, geoKey: 'preview', model: mat4.identity(), material }],
    output: { width: 512, height: 288 },
    clear: [0.09, 0.09, 0.12, 1],
  };
}
