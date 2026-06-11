import type { Channel, ChannelSet } from '@webtoe/core';

export const CONTROL_RATE = 60;

export function channels(entries: [string, number][], rate = CONTROL_RATE): ChannelSet {
  return {
    kind: 'chop',
    rate,
    channels: entries.map(([name, v]) => ({ name, data: Float32Array.of(v) })),
  };
}

export function channel(cs: ChannelSet | null, key: string | number): Channel | null {
  if (!cs) return null;
  if (typeof key === 'number') return cs.channels[key] ?? null;
  return cs.channels.find((c) => c.name === key) ?? null;
}

export function sample(cs: ChannelSet | null, key: string | number, fallback = 0): number {
  const ch = channel(cs, key);
  if (!ch || ch.data.length === 0) return fallback;
  return ch.data[ch.data.length - 1];
}

export function asChop(out: import('@webtoe/core').OpOutput): ChannelSet | null {
  return out && out.kind === 'chop' ? out : null;
}
