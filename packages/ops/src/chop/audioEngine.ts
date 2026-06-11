/**
 * Singleton WebAudio engine manager.
 *
 * Owns one AudioContext (lazy-created), manages AnalyserNode instances
 * by string id, caches decoded AudioBuffers, and provides a simple
 * pipeline for playback and analysis.  All methods are no-ops when the
 * Web Audio API is unavailable (SSR / headless).
 */

const SAMPLE_RATE = 44_100;

interface AudioNodeChain {
  source: AudioBufferSourceNode | MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  biquad: BiquadFilterNode | null;
  gain: GainNode | null;
}

type BiquadType = BiquadFilterType;

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function hasAudio(): boolean {
  return (
    typeof window !== 'undefined' &&
    (typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined')
  );
}

function makeCtx(): AudioContext | null {
  if (!hasAudio()) return null;
  const ACtor = AudioContext ?? (window as any).webkitAudioContext;
  try {
    return new ACtor();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Singleton engine                                                   */
/* ------------------------------------------------------------------ */

class AudioEngine {
  private ctx: AudioContext | null = null;
  /** Cached decoded audio buffers keyed by URL. */
  private buffers = new Map<string, AudioBuffer>();
  /** Per-id node chains for active audio pipelines. */
  private chains = new Map<string, AudioNodeChain>();
  /** Gain nodes shared for file-playback pipelines. */
  private masterGain: GainNode | null = null;

  // ── context ────────────────────────────────────────────────────

  getContext(): AudioContext | null {
    if (!this.ctx) {
      const c = makeCtx();
      if (c) {
        this.ctx = c;
        this.masterGain = c.createGain();
        this.masterGain.gain.value = 1;
        this.masterGain.connect(c.destination);
      }
    }
    // resume if suspended (browser autoplay policy)
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // ── file loading ───────────────────────────────────────────────

  async loadFile(url: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(url);
    if (cached) return cached;

    const ctx = this.getContext();
    if (!ctx) return null;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      this.buffers.set(url, audioBuf);
      return audioBuf;
    } catch {
      return null;
    }
  }

  clearCache(): void {
    this.buffers.clear();
  }

  // ── analyser creation ──────────────────────────────────────────

  createAnalyser(id: string, fftSize = 2048): AnalyserNode | null {
    const ctx = this.getContext();
    if (!ctx) return null;

    // dispose existing analyser if any
    this.disposeChain(id);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.8;

    const chain: AudioNodeChain = { source: null, analyser, biquad: null, gain: null };
    this.chains.set(id, chain);
    return analyser;
  }

  // ── biquad filter ──────────────────────────────────────────────

  createBiquad(
    id: string,
    type: BiquadType = 'lowpass',
    frequency = 1000,
    q = 1,
  ): BiquadFilterNode | null {
    const ctx = this.getContext();
    if (!ctx) return null;

    this.disposeChain(id);
    const biquad = ctx.createBiquadFilter();
    biquad.type = type;
    biquad.frequency.value = frequency;
    biquad.Q.value = q;

    const chain: AudioNodeChain = { source: null, analyser: null, biquad, gain: null };
    this.chains.set(id, chain);
    return biquad;
  }

  // ── data extraction from analyser ──────────────────────────────

  /** Frequency-domain FFT data (0 … 255 mapped to 0…1 per bin). */
  getSpectrum(id: string): Float32Array | null {
    const chain = this.chains.get(id);
    if (!chain?.analyser) return null;
    const buf = new Float32Array(chain.analyser.frequencyBinCount);
    chain.analyser.getFloatFrequencyData(buf);
    // Convert dBFS (-140..0) to 0..1
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.max(0, (buf[i] + 140) / 140);
    }
    return buf;
  }

  /** Time-domain waveform data (-1..1). */
  getTimeDomain(id: string): Float32Array | null {
    const chain = this.chains.get(id);
    if (!chain?.analyser) return null;
    const buf = new Float32Array(chain.analyser.fftSize);
    chain.analyser.getFloatTimeDomainData(buf);
    return buf;
  }

  // ── playback ───────────────────────────────────────────────────

  /**
   * Start playing a decoded buffer through the chain identified by `id`.
   * An analyser or biquad must have been created first for this id.
   */
  startFile(
    id: string,
    buffer: AudioBuffer,
    loop = false,
    gain = 1,
  ): AudioBufferSourceNode | null {
    const ctx = this.getContext();
    if (!ctx) return null;

    // stop any existing source for this id
    this.stopSource(id);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;

    // wire: source → gain → [biquad] → [analyser] → masterGain → destination
    let node: AudioNode = source;

    const chain = this.chains.get(id);
    if (chain) {
      chain.source = source;
      // per-pipeline gain
      const g = ctx.createGain();
      g.gain.value = gain;
      node.connect(g);
      node = g;
      chain.gain = g;

      if (chain.biquad) {
        node.connect(chain.biquad);
        node = chain.biquad;
      }
      if (chain.analyser) {
        node.connect(chain.analyser);
        node = chain.analyser;
      }
    }

    node.connect(this.masterGain ?? ctx.destination);
    source.start(0);
    return source;
  }

  /** Stop the source node for a given chain id. */
  stopSource(id: string): void {
    const chain = this.chains.get(id);
    if (chain?.source) {
      try {
        chain.source.stop();
      } catch {
        // already stopped
      }
      chain.source = null;
    }
  }

  // ── convenience: RMS from analyser ──────────────────────────────

  getRms(id: string): number {
    const td = this.getTimeDomain(id);
    if (!td) return 0;
    let sumSq = 0;
    for (let i = 0; i < td.length; i++) sumSq += td[i] * td[i];
    return Math.sqrt(sumSq / td.length);
  }

  getPeak(id: string): number {
    const td = this.getTimeDomain(id);
    if (!td) return 0;
    let peak = 0;
    for (let i = 0; i < td.length; i++) {
      const a = Math.abs(td[i]);
      if (a > peak) peak = a;
    }
    return peak;
  }

  // ── disposal ───────────────────────────────────────────────────

  private disposeChain(id: string): void {
    const ch = this.chains.get(id);
    if (!ch) return;
    if (ch.source) {
      try {
        ch.source.stop();
      } catch { /* ok */ }
    }
    // disconnect nodes
    if (ch.analyser) ch.analyser.disconnect();
    if (ch.biquad) ch.biquad.disconnect();
    if (ch.gain) ch.gain.disconnect();
    this.chains.delete(id);
  }

  dispose(): void {
    for (const id of [...this.chains.keys()]) this.disposeChain(id);
    if (this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.buffers.clear();
  }
}

/* ------------------------------------------------------------------ */
/*  Module-level singleton                                             */
/* ------------------------------------------------------------------ */

let instance: AudioEngine | null = null;

/** Get or create the singleton AudioEngine (lazy init). */
export function audioEngine(): AudioEngine {
  if (!instance) instance = new AudioEngine();
  return instance;
}

/** For testing / teardown. */
export function resetAudioEngine(): void {
  instance?.dispose();
  instance = null;
}

export type { BiquadType };
export { SAMPLE_RATE };
