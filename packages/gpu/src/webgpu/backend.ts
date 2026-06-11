import type {
  GpuFacade, NodeInst, ShaderSources, TextureHandle, TexturePassSpec,
} from '@webtoe/core';

/**
 * WebGPU implementation of the pass contract — v1 ships pilot coverage to
 * prove the contract is backend-neutral (PLAN §4); full TOP parity is M7.
 *
 * Uniform packing rule (binding 1): op uniforms sorted by name, each padded
 * to one vec4<f32> (scalar→x, vec2→xy, vec3/4→xyzw). Binding 0 is globals
 * { res: vec4f, time: vec4f }. Inputs: sampler at 2, textures at 3+i.
 * WGSL op shaders declare matching structs; a unit test enforces presence.
 *
 * Known v1 limits: readPixels returns empty (GPU readback is async — thumbs
 * are disabled on this backend until M7), media upload supported.
 */

interface Target {
  curr: GPUTexture;
  prev: GPUTexture;
  w: number;
  h: number;
  currHandle: TextureHandle;
  prevHandle: TextureHandle;
  seeded: boolean;
}

const FORMAT: GPUTextureFormat = 'rgba8unorm';
const MAX_INPUTS = 4;

const BLIT_WGSL = `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = p[i] * 0.5 + 0.5;
  o.uv.y = 1.0 - o.uv.y;
  return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv);
}`;

const PASS_VERT_WGSL = `
struct Globals { res: vec4f, time: vec4f }
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = p[i] * 0.5 + 0.5;
  return o;
}`;

let nextHandleId = 1_000_000; // distinct range from webgl2 for debuggability

export class WebGPUBackend implements GpuFacade {
  readonly name = 'webgpu' as const;
  private time = 0;
  private readonly sources = new Map<string, ShaderSources>();
  private readonly pipelines = new Map<string, GPURenderPipeline>();
  private readonly targets = new Map<string, Target>();
  private readonly textures = new Map<number, GPUTexture>();
  private readonly mediaTargets = new Map<string, { tex: GPUTexture; handle: TextureHandle; w: number; h: number }>();
  private blitPipeline: GPURenderPipeline | null = null;

  private constructor(
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly canvasFormat: GPUTextureFormat,
    private readonly sampler: GPUSampler,
  ) {}

  static async create(canvas: HTMLCanvasElement): Promise<WebGPUBackend> {
    if (!('gpu' in navigator)) throw new Error('WebGPU is not available in this browser');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('no WebGPU adapter');
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('no webgpu canvas context');
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format: canvasFormat, alphaMode: 'opaque' });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    return new WebGPUBackend(device, context, canvasFormat, sampler);
  }

  setTime(seconds: number): void {
    this.time = seconds;
  }

  registerShader(id: string, sources: ShaderSources): void {
    if (!this.sources.has(id)) this.sources.set(id, sources);
  }

  runPass(node: NodeInst, spec: TexturePassSpec, slot = 'main'): TextureHandle {
    const t = this.ensureTarget(node, slot, spec.output.width, spec.output.height);
    const pipeline = this.pipeline(spec.shaderId, spec.inputs.length);

    // pack uniforms: globals at offset 0, sorted vec4-padded op uniforms at 256
    // (uniform buffer offsets must be 256-aligned)
    const keys = Object.keys(spec.uniforms).sort();
    const opsBytes = Math.max(16, keys.length * 16);
    const ubo = this.device.createBuffer({
      size: 256 + opsBytes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const globals = new Float32Array([t.w, t.h, 0, 0, this.time, 0, 0, 0]);
    this.device.queue.writeBuffer(ubo, 0, globals);
    const ops = new Float32Array(opsBytes / 4);
    keys.forEach((k, i) => {
      const v = spec.uniforms[k];
      const arr = typeof v === 'number' ? [v] : v;
      ops.set(arr.slice(0, 4), i * 4);
    });
    this.device.queue.writeBuffer(ubo, 256, ops);

    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: ubo, offset: 0, size: 32 } },
      { binding: 1, resource: { buffer: ubo, offset: 256, size: opsBytes } },
      { binding: 2, resource: this.sampler },
    ];
    for (let i = 0; i < MAX_INPUTS; i++) {
      const input = spec.inputs[i] ?? null;
      const tex = input ? this.textures.get(input.id) : null;
      entries.push({ binding: 3 + i, resource: (tex ?? this.dummyTexture()).createView() });
    }
    const bindGroup = this.device.createBindGroup({ layout: this.sharedLayout(), entries });

    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: t.prev.createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);

    const oldCurr = t.curr, oldCurrHandle = t.currHandle;
    t.curr = t.prev;
    t.currHandle = t.prevHandle;
    t.prev = oldCurr;
    t.prevHandle = oldCurrHandle;
    t.seeded = true;
    return t.currHandle;
  }

  previousFrame(node: NodeInst): TextureHandle | null {
    const t = this.targets.get(`${node.id}:main`);
    return t?.seeded ? t.prevHandle : null;
  }

  uploadMedia(node: NodeInst, source: TexImageSource, flipY = true): TextureHandle {
    const w = (source as { videoWidth?: number }).videoWidth
      ?? (source as { naturalWidth?: number }).naturalWidth
      ?? (source as { width: number }).width;
    const h = (source as { videoHeight?: number }).videoHeight
      ?? (source as { naturalHeight?: number }).naturalHeight
      ?? (source as { height: number }).height;
    const key = `${node.id}:media`;
    let m = this.mediaTargets.get(key);
    if (!m || m.w !== w || m.h !== h) {
      if (m) {
        m.tex.destroy();
        this.textures.delete(m.handle.id);
      }
      const tex = this.device.createTexture({
        size: [w, h],
        format: FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      const handle = { id: nextHandleId++, width: w, height: h };
      this.textures.set(handle.id, tex);
      m = { tex, handle, w, h };
      this.mediaTargets.set(key, m);
    }
    this.device.queue.copyExternalImageToTexture(
      { source: source as GPUCopyExternalImageSource, flipY },
      { texture: m.tex },
      [w, h],
    );
    return m.handle;
  }

  blitToCanvas(tex: TextureHandle): void {
    if (!this.blitPipeline) {
      const mod = this.device.createShaderModule({ code: BLIT_WGSL });
      this.blitPipeline = this.device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: mod, entryPoint: 'vs' },
        fragment: { module: mod, entryPoint: 'fs', targets: [{ format: this.canvasFormat }] },
        primitive: { topology: 'triangle-list' },
      });
    }
    const src = this.textures.get(tex.id);
    if (!src) return;
    const bindGroup = this.device.createBindGroup({
      layout: this.blitPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: src.createView() },
      ],
    });
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: { r: 0.07, g: 0.07, b: 0.09, a: 1 },
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.blitPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  readPixels(): Uint8ClampedArray {
    // GPU readback is async; thumbnails on webgpu land with M7
    return new Uint8ClampedArray(0);
  }

  releaseNode(node: NodeInst): void {
    for (const [key, t] of this.targets) {
      if (key.startsWith(`${node.id}:`)) {
        t.curr.destroy();
        t.prev.destroy();
        this.textures.delete(t.currHandle.id);
        this.textures.delete(t.prevHandle.id);
        this.targets.delete(key);
      }
    }
    const m = this.mediaTargets.get(`${node.id}:media`);
    if (m) {
      m.tex.destroy();
      this.textures.delete(m.handle.id);
      this.mediaTargets.delete(`${node.id}:media`);
    }
  }

  dispose(): void {
    for (const t of this.targets.values()) {
      t.curr.destroy();
      t.prev.destroy();
    }
    for (const m of this.mediaTargets.values()) m.tex.destroy();
    this.targets.clear();
    this.mediaTargets.clear();
    this.textures.clear();
    this.device.destroy();
  }

  // ---------------------------------------------------------------- private

  private dummy: GPUTexture | null = null;
  private layout: GPUBindGroupLayout | null = null;

  /** One shared layout for all op pipelines; shaders may use a subset. */
  private sharedLayout(): GPUBindGroupLayout {
    if (!this.layout) {
      const entries: GPUBindGroupLayoutEntry[] = [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ];
      for (let i = 0; i < MAX_INPUTS; i++) {
        entries.push({ binding: 3 + i, visibility: GPUShaderStage.FRAGMENT, texture: {} });
      }
      this.layout = this.device.createBindGroupLayout({ entries });
    }
    return this.layout;
  }

  private dummyTexture(): GPUTexture {
    if (!this.dummy) {
      this.dummy = this.device.createTexture({
        size: [1, 1],
        format: FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
    }
    return this.dummy;
  }

  private ensureTarget(node: NodeInst, slot: string, w: number, h: number): Target {
    const W = Math.max(1, Math.round(w));
    const H = Math.max(1, Math.round(h));
    const key = `${node.id}:${slot}`;
    let t = this.targets.get(key);
    if (t && (t.w !== W || t.h !== H)) {
      t.curr.destroy();
      t.prev.destroy();
      this.textures.delete(t.currHandle.id);
      this.textures.delete(t.prevHandle.id);
      t = undefined;
    }
    if (!t) {
      const make = () =>
        this.device.createTexture({
          size: [W, H],
          format: FORMAT,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
      const curr = make();
      const prev = make();
      const currHandle = { id: nextHandleId++, width: W, height: H };
      const prevHandle = { id: nextHandleId++, width: W, height: H };
      this.textures.set(currHandle.id, curr);
      this.textures.set(prevHandle.id, prev);
      t = { curr, prev, w: W, h: H, currHandle, prevHandle, seeded: false };
      this.targets.set(key, t);
    }
    return t;
  }

  private pipeline(shaderId: string, _inputCount: number): GPURenderPipeline {
    let p = this.pipelines.get(shaderId);
    if (p) return p;
    const src = this.sources.get(shaderId);
    if (!src?.wgsl) throw new Error(`no WGSL source registered for shader '${shaderId}' (webgpu backend)`);
    const mod = this.device.createShaderModule({ code: PASS_VERT_WGSL + '\n' + src.wgsl });
    const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.sharedLayout()] });
    p = this.device.createRenderPipeline({
      layout,
      vertex: { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });
    this.pipelines.set(shaderId, p);
    return p;
  }
}
