import { defineConfig } from 'vite';

// The preview host proxies the dev server through a generated domain, so Vite
// has to accept requests whose Host header is not localhost.
export default defineConfig({
  // relative asset paths so the built game also works from disk / any subfolder
  base: './',
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5173,
    // not strict: if the port is busy Vite picks the next free one instead of
    // refusing to start (it prints the URL it actually used)
    strictPort: false,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
