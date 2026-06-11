import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE || '/webtoe/',
  build: { target: 'es2022' },
  server: {
    port: 8643,
    strictPort: true,
  },
  plugins: [
    {
      name: 'webtoe-mcp-bridge',
      configureServer(server) {
        const mcpRoot = resolve(__dirname, '..', '..',
          '..', 'Touchdesigner_MCP', 'Main', 'mcp', 'dist');
        const bridgePath = resolve(mcpRoot, 'webtoeBridgeServer.js');
        let bridgeProcess: ReturnType<typeof spawn> | null = null;

        // Spawn the MCP bridge on startup
        try {
          bridgeProcess = spawn('node', [bridgePath], {
            stdio: 'pipe',
            env: { ...process.env, WEBTOE_PORT: '3001' },
          });
          bridgeProcess.stdout?.on('data', (data: Buffer) => {
            console.log(`[mcp-bridge] ${data.toString().trim()}`);
          });
          bridgeProcess.stderr?.on('data', (data: Buffer) => {
            console.error(`[mcp-bridge] ${data.toString().trim()}`);
          });
          bridgeProcess.on('error', (err: Error) => {
            console.warn('[mcp-bridge] could not start:', err.message);
            console.warn('[mcp-bridge] AI chat disabled. Install dependencies at:');
            console.warn(`  ${mcpRoot}`);
          });
          bridgeProcess.on('exit', (code: number | null) => {
            if (code !== null && code !== 0) {
              console.warn(`[mcp-bridge] exited with code ${code}`);
            }
          });
          console.log('[mcp-bridge] started on http://localhost:3001');
        } catch (e) {
          console.warn('[mcp-bridge] failed to start — AI chat unavailable');
        }

        // Proxy /api/* requests to the MCP bridge
        server.middlewares.use('/api', (req, res, next) => {
          if (!bridgeProcess || bridgeProcess.killed) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'MCP bridge not running' }));
            return;
          }

          const http = require('node:http');
          const options = {
            hostname: 'localhost',
            port: 3001,
            path: req.url,
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
          };

          const proxyReq = http.request(options, (proxyRes: any) => {
            let body = '';
            proxyRes.on('data', (chunk: Buffer) => { body += chunk; });
            proxyRes.on('end', () => {
              res.writeHead(proxyRes.statusCode || 200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              });
              res.end(body);
            });
          });

          proxyReq.on('error', () => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bridge unreachable' }));
          });

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk; });
            req.on('end', () => { proxyReq.end(body); });
          } else {
            proxyReq.end();
          }
        });

        // Cleanup on server close
        server.httpServer?.on('close', () => {
          if (bridgeProcess && !bridgeProcess.killed) {
            bridgeProcess.kill();
            console.log('[mcp-bridge] stopped');
          }
        });
      },
    },
  ],
});
