#!/usr/bin/env node
/**
 * webtoe-ndi-bridge — NDI ⇄ WebSocket bridge for the browser ops.
 *
 *   node index.mjs --mock              # zero-NDI test-pattern source + frame sink
 *   node index.mjs                     # real NDI via optional 'grandiose' + user-installed NDI runtime
 *   options: --port 9980  --mock-name "WebToe Mock"
 *
 * Protocol v1 (keep in sync with packages/ops/src/video/protocol.ts):
 *   text JSON control: {type:'hello'|'sources'|'subscribe'|'send-open', ...}
 *   binary frames: 24B header [magic 'WTNF', u32 w, u32 h, fourcc, f64 ts] + payload
 *
 * NDI® is a trademark of Vizrt NDI AB. This bridge bundles nothing of the
 * NDI SDK; real mode loads 'grandiose' (which the USER installs along with
 * the NDI runtime) — the same own-tooling pattern WebToe uses for toeexpand.
 */
import { WebSocketServer } from 'ws';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const MOCK = args.includes('--mock');
const PORT = Number(flag('port', 9980));
const MOCK_NAME = flag('mock-name', 'WebToe Mock (Pattern)');

const MAGIC = 0x464e5457; // 'WTNF'

function encodeFrame(w, h, fourcc, tsSec, payload) {
  const buf = Buffer.alloc(24 + payload.length);
  buf.writeUInt32LE(MAGIC, 0);
  buf.writeUInt32LE(w, 4);
  buf.writeUInt32LE(h, 8);
  buf.write(fourcc, 12, 4, 'ascii');
  buf.writeDoubleLE(tsSec, 16);
  payload.copy ? payload.copy(buf, 24) : Buffer.from(payload).copy(buf, 24);
  return buf;
}

function decodeFrame(buf) {
  if (buf.length < 24 || buf.readUInt32LE(0) !== MAGIC) return null;
  return {
    w: buf.readUInt32LE(4),
    h: buf.readUInt32LE(8),
    fourcc: buf.toString('ascii', 12, 16),
    ts: buf.readDoubleLE(16),
    payload: buf.subarray(24),
  };
}

// ---------------------------------------------------------------- mock source

function makeMockFrame(w, h, t) {
  // animated UYVY test pattern: hue-cycling vertical bars + moving diagonal
  const buf = Buffer.alloc(w * h * 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x += 2) {
      const phase = (x / w + t * 0.1) % 1;
      const diag = ((x + y + t * 120) % 160) < 80 ? 30 : 0;
      const Y = 60 + 150 * phase + diag;
      const U = 128 + 100 * Math.sin(phase * Math.PI * 2 + t);
      const V = 128 + 100 * Math.cos(phase * Math.PI * 2 + t * 0.7);
      const o = (y * w + x) * 2;
      buf[o] = U; buf[o + 1] = Math.min(235, Y); buf[o + 2] = V; buf[o + 3] = Math.min(235, Y);
    }
  }
  return buf;
}

// ---------------------------------------------------------------- real NDI (optional)

let grandiose = null;
if (!MOCK) {
  try {
    grandiose = (await import('grandiose')).default ?? (await import('grandiose'));
  } catch {
    console.error('[bridge] grandiose not installed — falling back to --mock behavior.');
    console.error('[bridge] for real NDI: install the NDI runtime, then `npm i grandiose` in packages/ndi-bridge');
  }
}

const wss = new WebSocketServer({ port: PORT });
console.log(`[bridge] listening on ws://127.0.0.1:${PORT} ${MOCK || !grandiose ? '(mock mode)' : '(NDI mode)'}`);

let framesReceivedFromBrowser = 0;

wss.on('connection', (ws) => {
  const subs = new Set();
  let mockTimer = null;
  let receiver = null;
  let sender = null;
  const t0 = Date.now();

  const sendJson = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
  sendJson({ type: 'hello', version: 1, mode: MOCK || !grandiose ? 'mock' : 'ndi' });

  const announceSources = async () => {
    if (grandiose && !MOCK) {
      try {
        const found = await grandiose.find({ showLocalSources: true }, 1500);
        sendJson({ type: 'sources', list: found.map((s) => s.name) });
        return;
      } catch { /* fall through */ }
    }
    sendJson({ type: 'sources', list: [MOCK_NAME] });
  };
  void announceSources();

  const startMockStream = () => {
    if (mockTimer) return;
    const w = 640, h = 360;
    mockTimer = setInterval(() => {
      if (ws.readyState !== 1) return;
      const t = (Date.now() - t0) / 1000;
      ws.send(encodeFrame(w, h, 'UYVY', t, makeMockFrame(w, h, t)));
    }, 33);
  };

  const startNdiReceive = async (sourceName) => {
    try {
      const found = await grandiose.find({ showLocalSources: true }, 1500);
      const src = found.find((s) => s.name === sourceName) ?? found[0];
      if (!src) throw new Error('no NDI sources found');
      receiver = await grandiose.receive({ source: src, colorFormat: grandiose.COLOR_FORMAT_RGBX_RGBA });
      const pump = async () => {
        while (ws.readyState === 1 && receiver) {
          try {
            const v = await receiver.video(1000);
            ws.send(encodeFrame(v.xres, v.yres, 'RGBA', Date.now() / 1000, v.data));
          } catch { /* timeout — keep pumping */ }
        }
      };
      void pump();
    } catch (e) {
      console.error('[bridge] receive failed:', e.message, '— mock stream instead');
      startMockStream();
    }
  };

  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'subscribe' && !subs.has(msg.source)) {
        subs.add(msg.source);
        console.log(`[bridge] subscribe: ${msg.source}`);
        if (grandiose && !MOCK) void startNdiReceive(msg.source);
        else startMockStream();
      } else if (msg.type === 'send-open') {
        console.log(`[bridge] sender open: ${msg.name}`);
        if (grandiose && !MOCK && !sender) {
          grandiose.send({ name: msg.name, clockVideo: false })
            .then((s) => { sender = s; })
            .catch((e) => console.error('[bridge] sender failed:', e.message));
        }
      }
      return;
    }
    const frame = decodeFrame(data);
    if (!frame) return;
    framesReceivedFromBrowser++;
    if (framesReceivedFromBrowser % 60 === 1) {
      console.log(`[bridge] ← browser frame #${framesReceivedFromBrowser} ${frame.w}x${frame.h} ${frame.fourcc}`);
    }
    if (sender) {
      void sender.video({
        type: 'video', xres: frame.w, yres: frame.h,
        frameRateN: 30000, frameRateD: 1001, fourCC: grandiose.FOURCC_RGBA,
        lineStrideBytes: frame.w * 4, data: Buffer.from(frame.payload),
      }).catch(() => {});
    }
  });

  ws.on('close', () => {
    if (mockTimer) clearInterval(mockTimer);
    receiver = null;
  });
});
