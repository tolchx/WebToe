/** NDI In/Out TOPs — talk to the local WebToe NDI bridge over WebSocket.
 *  Browsers cannot join NDI networks directly (no mDNS/raw sockets, and the
 *  NDI SDK is closed-source); the bridge owns the NDI side with the user's
 *  own NDI runtime, this end does the pixels (WASM-accelerated). See
 *  docs/HANDOFF.md §8. NDI® is a trademark of Vizrt NDI AB.
 */
import type { OpSpec, TextureHandle } from '@webtoe/core';
import { videoKernels } from '../video/kernels';
import { decodeFrame, encodeFrame } from '../video/protocol';

interface LatestFrame {
  w: number;
  h: number;
  fourcc: 'RGBA' | 'UYVY' | 'BGRA';
  payload: Uint8Array;
  serial: number;
}

class BridgeClient {
  ws: WebSocket | null = null;
  status = 'connecting…';
  sources: string[] = [];
  private subs = new Map<string, LatestFrame | null>();
  private senders = new Set<string>();
  private serial = 0;
  private retry = 0;

  constructor(readonly url: string) {
    this.connect();
  }

  private connect(): void {
    try {
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => {
        this.status = 'connected';
        this.retry = 0;
        for (const source of this.subs.keys()) this.send({ type: 'subscribe', source });
        for (const name of this.senders) this.send({ type: 'send-open', name });
      };
      ws.onmessage = (e) => {
        if (typeof e.data === 'string') {
          const msg = JSON.parse(e.data) as { type: string; list?: string[]; source?: string };
          if (msg.type === 'sources') this.sources = msg.list ?? [];
          return;
        }
        const frame = decodeFrame(e.data as ArrayBuffer);
        if (!frame) return;
        // mock/bridge tags frames with the subscribed source via interleaving:
        // v1 keeps one stream per subscription; store under every active sub
        for (const key of this.subs.keys()) {
          this.subs.set(key, {
            w: frame.header.w, h: frame.header.h, fourcc: frame.header.fourcc,
            payload: frame.payload, serial: ++this.serial,
          });
        }
      };
      ws.onclose = () => {
        this.status = 'disconnected — is the bridge running? (npx webtoe-ndi-bridge --mock)';
        this.ws = null;
        const delay = Math.min(5000, 500 * 2 ** this.retry++);
        setTimeout(() => this.connect(), delay);
      };
      ws.onerror = () => { /* onclose follows */ };
    } catch (e) {
      this.status = (e as Error).message;
    }
  }

  private send(obj: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  subscribe(source: string): LatestFrame | null {
    if (!this.subs.has(source)) {
      this.subs.set(source, null);
      this.send({ type: 'subscribe', source });
    }
    return this.subs.get(source) ?? null;
  }

  openSender(name: string): void {
    if (!this.senders.has(name)) {
      this.senders.add(name);
      this.send({ type: 'send-open', name });
    }
  }

  sendFrame(w: number, h: number, fourcc: 'RGBA' | 'UYVY', payload: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeFrame({ w, h, fourcc, timestamp: performance.now() / 1000 }, payload));
    }
  }
}

const clients = new Map<string, BridgeClient>();

function client(url: string): BridgeClient {
  let c = clients.get(url);
  if (!c) {
    c = new BridgeClient(url);
    clients.set(url, c);
  }
  return c;
}

const F = 'TOP' as const;
const DEFAULT_URL = 'ws://127.0.0.1:9980';

export const ndiOps: OpSpec[] = [
  {
    type: 'top:ndiin',
    family: F,
    label: 'ndi in',
    inputs: { min: 0, max: 0 },
    alwaysCook: true,
    backends: ['webgl2', 'webgpu'],
    params: [
      { key: 'bridge', label: 'bridge url', type: 'string', default: DEFAULT_URL },
      { key: 'source', label: 'ndi source (blank = first)', type: 'string', default: '' },
    ],
    cook(ctx) {
      if (!ctx.gpu) {
        ctx.node.error = 'no GPU backend';
        return null;
      }
      const c = client(ctx.paramStr('bridge'));
      const source = ctx.paramStr('source') || c.sources[0] || 'default';
      const frame = c.subscribe(source);
      const st = ctx.node.state as { lastSerial?: number; tex?: TextureHandle; rgba?: Uint8ClampedArray };
      if (!frame) {
        ctx.node.error = `ndi: ${c.status}${c.sources.length ? ` · sources: ${c.sources.join(', ')}` : ''}`;
        return st.tex ? { kind: 'top', tex: st.tex } : null;
      }
      ctx.node.error = null;
      if (frame.serial !== st.lastSerial) {
        st.lastSerial = frame.serial;
        const k = videoKernels();
        const n = frame.w * frame.h * 4;
        if (!st.rgba || st.rgba.length !== n) st.rgba = new Uint8ClampedArray(n);
        if (frame.fourcc === 'UYVY') k.uyvyToRgba(frame.payload, st.rgba, frame.w, frame.h);
        else if (frame.fourcc === 'BGRA') k.bgraToRgba(frame.payload, st.rgba, frame.w, frame.h);
        else st.rgba.set(frame.payload.subarray(0, n));
        st.tex = ctx.gpu.uploadMedia(
          ctx.node,
          new ImageData(st.rgba as Uint8ClampedArray<ArrayBuffer>, frame.w, frame.h),
          false,
        );
      }
      return st.tex ? { kind: 'top', tex: st.tex } : null;
    },
  },

  {
    type: 'top:ndiout',
    family: F,
    label: 'ndi out',
    inputs: { min: 1, max: 1 },
    inputLabels: ['texture to send'],
    alwaysCook: true,
    backends: ['webgl2'],
    params: [
      { key: 'bridge', label: 'bridge url', type: 'string', default: DEFAULT_URL },
      { key: 'name', label: 'sender name', type: 'string', default: 'WebToe Out' },
      { key: 'active', type: 'toggle', default: true },
      { key: 'fps', label: 'send rate', type: 'float', default: 30, min: 1, max: 60 },
      { key: 'sendw', label: 'send width', type: 'int', default: 1280, min: 64, max: 1920 },
      { key: 'sendh', label: 'send height', type: 'int', default: 720, min: 64, max: 1080 },
    ],
    cook(ctx) {
      const input = ctx.inputs[0];
      const top = input && input.kind === 'top' ? input : null;
      if (!top || !ctx.gpu) return top;
      if (!ctx.paramBool('active')) return top;

      const st = ctx.node.state as { lastSend?: number };
      const interval = 1 / Math.max(1, ctx.paramNum('fps'));
      const now = ctx.time.seconds;
      if (st.lastSend !== undefined && now - st.lastSend < interval) return top;
      st.lastSend = now;

      const c = client(ctx.paramStr('bridge'));
      c.openSender(ctx.paramStr('name'));
      const w = Math.round(ctx.paramNum('sendw'));
      const h = Math.round(ctx.paramNum('sendh'));
      const px = ctx.gpu.readPixels(top.tex, w, h);
      if (px.length) {
        const buf = new Uint8Array(px.buffer.slice(0), px.byteOffset, px.byteLength);
        videoKernels().flipY(buf, w, h); // GL readback is bottom-up
        c.sendFrame(w, h, 'RGBA', buf);
      }
      return top; // passthrough so it can sit at the end of a chain
    },
  },
];
