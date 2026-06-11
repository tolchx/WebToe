/**
 * Audio CHOP operators.
 *
 * Four operators that bridge WebAudio API into the CHOP channel system:
 *   - audiofilein    load & play audio files (HTTP fetch → decode → playback)
 *   - audiodevicein  live microphone input
 *   - audiospectrum  FFT frequency-bin output from any audio source
 *   - audiobandeq    biquad filter with configurable type, frequency, Q, gain
 *
 * Each source operator (audiofilein, audiodevicein) registers an analyser
 * pipeline in the shared AudioEngine.  The analysis operators
 * (audiospectrum, audiobandeq) reference a source by node path.
 */

import type { OpSpec, ChannelSet } from '@webtoe/core';
import { channels, CONTROL_RATE } from './data';
import { audioEngine } from './audioEngine';

const F = 'CHOP' as const;

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Derive a stable id for a node's audio pipeline.
 * Uses the unique node path so multiple instances stay independent.
 */
function audioId(ctx: { node: { path?: string; uid?: number } }): string {
  return ctx.node.path ?? `audio_${ctx.node.uid ?? 0}`;
}

/**
 * Resolve a source node by relative path from the current node.
 * Returns the node's stored analyser id or null.
 */
function resolveSourceAnalyserId(ctx: {
  engine: { graph: { resolve(path: string, from: unknown): unknown } };
  node: unknown;
}, sourcePath: string): string | null {
  const target = ctx.engine.graph.resolve(sourcePath, ctx.node);
  if (!target || typeof target !== 'object') return null;
  const st = (target as any).state as Record<string, unknown> | undefined;
  if (!st || typeof st.analyserId !== 'string') return null;
  return st.analyserId as string;
}

/* ------------------------------------------------------------------ */
/*  OpSpec: audiofilein                                                */
/* ------------------------------------------------------------------ */

const audiofilein: OpSpec = {
  type: 'chop:audiofilein',
  family: F,
  label: 'audio file in',
  inputs: { min: 0, max: 0 },
  alwaysCook: true,
  params: [
    { key: 'url', type: 'string', default: '' },
    { key: 'play', type: 'toggle', default: false },
    { key: 'loop', type: 'toggle', default: false },
    { key: 'gain', type: 'float', default: 1, min: 0, max: 10 },
  ],
  cook(ctx) {
    const st = ctx.node.state as Record<string, unknown>;
    const aid = audioId(ctx);

    // On play rising edge → load & start
    const shouldPlay = ctx.paramBool('play');
    const wasPlaying = (st._playing as boolean) ?? false;

    if (shouldPlay && !wasPlaying) {
      const url = ctx.paramStr('url').trim();
      if (url) {
        const eng = audioEngine();
        eng.createAnalyser(aid, 2048);
        eng.loadFile(url).then((buf) => {
          if (buf) {
            eng.startFile(aid, buf, ctx.paramBool('loop'), ctx.paramNum('gain'));
          }
        }).catch(() => {});
      }
      st._playing = true;
    } else if (!shouldPlay && wasPlaying) {
      audioEngine().stopSource(aid);
      st._playing = false;
    }

    // Update gain live
    if (shouldPlay) {
      const chain = (audioEngine() as any).chains?.get(aid);
      if (chain?.gain) {
        (chain.gain as GainNode).gain.value = ctx.paramNum('gain');
      }
    }

    // Read analyser data
    const eng = audioEngine();
    const rms = eng.getRms(aid);
    const peak = eng.getPeak(aid);
    const hasSignal = rms > 0.001;

    st.analyserId = aid;

    return channels([
      ['isPlaying', shouldPlay ? 1 : 0],
      ['rms', rms],
      ['peak', peak],
      ['hasSignal', hasSignal ? 1 : 0],
    ]);
  },
};

/* ------------------------------------------------------------------ */
/*  OpSpec: audiodevicein                                              */
/* ------------------------------------------------------------------ */

const audiodevicein: OpSpec = {
  type: 'chop:audiodevicein',
  family: F,
  label: 'audio device in',
  inputs: { min: 0, max: 0 },
  alwaysCook: true,
  params: [
    { key: 'active', type: 'toggle', default: false },
    { key: 'deviceid', type: 'string', default: '' },
  ],
  cook(ctx) {
    const st = ctx.node.state as Record<string, unknown>;
    const aid = audioId(ctx);
    const eng = audioEngine();
    const active = ctx.paramBool('active');
    const wasActive = (st._micActive as boolean) ?? false;

    if (active && !wasActive) {
      // Start microphone input
      eng.createAnalyser(aid, 2048);
      const constraints: MediaStreamConstraints = { audio: true };
      const devId = ctx.paramStr('deviceid').trim();
      if (devId) {
        (constraints.audio as MediaTrackConstraints) = { deviceId: devId };
      }

      navigator.mediaDevices?.getUserMedia(constraints)
        .then((stream) => {
          const ctxWa = eng.getContext();
          if (!ctxWa) return;
          const src = ctxWa.createMediaStreamSource(stream);
          // Wire: source → analyser → masterGain
          const analyserNode = (eng as any).chains?.get(aid)?.analyser;
          if (analyserNode) src.connect(analyserNode as AudioNode);
          (analyserNode as AudioNode).connect(ctxWa.destination);

          // Store stream ref for cleanup
          st._micStream = stream;
        })
        .catch(() => {
          // permission denied or no mic
          st._micActive = false;
        });
      st._micActive = true;
    } else if (!active && wasActive) {
      // Cleanup mic
      const stream = st._micStream as MediaStream | undefined;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        st._micStream = undefined;
      }
      eng.stopSource(aid);
      st._micActive = false;
    }

    st.analyserId = aid;

    if (!active) {
      return channels([
        ['active', 0],
        ['rms', 0],
        ['peak', 0],
        ['hasSignal', 0],
      ]);
    }

    const rms = eng.getRms(aid);
    const peak = eng.getPeak(aid);

    return channels([
      ['active', 1],
      ['rms', rms],
      ['peak', peak],
      ['hasSignal', rms > 0.001 ? 1 : 0],
    ]);
  },
};

/* ------------------------------------------------------------------ */
/*  OpSpec: audiospectrum                                              */
/* ------------------------------------------------------------------ */

const audiospectrum: OpSpec = {
  type: 'chop:audiospectrum',
  family: F,
  label: 'audio spectrum',
  inputs: { min: 0, max: 0 },
  alwaysCook: true,
  params: [
    { key: 'source', type: 'string', default: '' },
    { key: 'bins', type: 'int', default: 64, min: 2, max: 512 },
  ],
  cook(ctx) {
    const sourcePath = ctx.paramStr('source').trim();
    if (!sourcePath) return channels([]);

    const aid = resolveSourceAnalyserId(ctx, sourcePath);
    if (!aid) return channels([]);

    const eng = audioEngine();
    const spectrum = eng.getSpectrum(aid);
    if (!spectrum || spectrum.length === 0) return channels([]);

    const binCount = Math.min(spectrum.length, Math.max(2, Math.round(ctx.paramNum('bins'))));
    const step = spectrum.length / binCount;
    const out: [string, number][] = [];

    for (let i = 0; i < binCount; i++) {
      const idx = Math.floor(i * step);
      const name = `freq${String(i).padStart(2, '0')}`;
      out.push([name, spectrum[idx] ?? 0]);
    }

    return channels(out);
  },
};

/* ------------------------------------------------------------------ */
/*  OpSpec: audiobandeq                                                */
/* ------------------------------------------------------------------ */

const audiobandeq: OpSpec = {
  type: 'chop:audiobandeq',
  family: F,
  label: 'audio band eq',
  inputs: { min: 0, max: 0 },
  alwaysCook: true,
  params: [
    { key: 'source', type: 'string', default: '' },
    {
      key: 'type',
      type: 'menu',
      default: 'lowpass',
      menu: ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'],
    },
    { key: 'frequency', type: 'float', default: 1000, min: 20, max: 20_000 },
    { key: 'q', type: 'float', default: 1, min: 0.01, max: 50 },
    { key: 'gain', type: 'float', default: 0, min: -40, max: 40 },
  ],
  cook(ctx) {
    const sourcePath = ctx.paramStr('source').trim();
    if (!sourcePath) return channels([]);

    const aid = resolveSourceAnalyserId(ctx, sourcePath);
    if (!aid) return channels([]);

    const eng = audioEngine();
    const type = ctx.paramStr('type') as BiquadFilterType;
    const freq = ctx.paramNum('frequency');
    const q = ctx.paramNum('q');
    const gainVal = ctx.paramNum('gain');

    // Create or update biquad on the source's chain
    // The engine's createBiquad creates a new chain — for bandeq we want
    // to insert a biquad BETWEEN the existing source and existing analyser.
    // We handle this by using a separate chain id scoped to this node.
    const bandEqId = `${aid}_beq_${audioId(ctx)}`;
    const biquad = eng.createBiquad(bandEqId, type, freq, q);
    if (biquad) {
      biquad.gain.value = gainVal;
    }

    // Read filtered output from the new analyser
    const rms = eng.getRms(bandEqId);
    const peak = eng.getPeak(bandEqId);

    return channels([
      ['rms', rms],
      ['peak', peak],
      ['frequency', freq],
      ['q', q],
      ['gain', gainVal],
    ]);
  },
};

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

export const audioOps: OpSpec[] = [
  audiofilein,
  audiodevicein,
  audiospectrum,
  audiobandeq,
];
