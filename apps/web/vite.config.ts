import { defineConfig } from 'vite';

export default defineConfig({
  base: '/WebToe/',
  build: { target: 'es2022' },
  server: { port: 8643, strictPort: true },
});
