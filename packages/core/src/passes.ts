/**
 * Backend-agnostic GPU contract. `core` never imports WebGL or WebGPU types;
 * `@webtoe/gpu` implements this facade per backend. TOP ops describe their work
 * as TexturePassSpecs and the backend owns resources, pipelines and pooling.
 */
import type { NodeInst } from './node';

export interface TextureHandle {
  readonly id: number;
  readonly width: number;
  readonly height: number;
}

export type UniformValue = number | number[];

export interface TexturePassSpec {
  /** shader registered via GpuFacade.registerShader */
  shaderId: string;
  uniforms: Record<string, UniformValue>;
  inputs: (TextureHandle | null)[];
  output: { width: number; height: number };
}

export interface ShaderSources {
  /** WebGL2 GLSL 300 es fragment source */
  glsl?: string;
  /** WebGPU WGSL fragment source */
  wgsl?: string;
}

export type BackendName = 'webgl2' | 'webgpu';

export interface GpuFacade {
  readonly name: BackendName;
  registerShader(id: string, sources: ShaderSources): void;
  /** Run one fullscreen pass; output texture is pooled per (node, resolution). */
  runPass(node: NodeInst, spec: TexturePassSpec): TextureHandle;
  /** Previous-frame output of `node` (ping-pong) — feedback's escape hatch. */
  previousFrame(node: NodeInst): TextureHandle | null;
  /** Upload image/video/canvas pixels into node's pooled texture. */
  uploadMedia(node: NodeInst, source: TexImageSource, flipY?: boolean): TextureHandle;
  /** Draw a texture to the visible canvas (viewer). */
  blitToCanvas(tex: TextureHandle): void;
  /** Read back a small RGBA8 thumbnail (perf: throttled by caller). */
  readPixels(tex: TextureHandle, w: number, h: number): Uint8ClampedArray;
  /** Drop pooled resources owned by a deleted node. */
  releaseNode(node: NodeInst): void;
  dispose(): void;
}
