import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER = 'http://127.0.0.1:4757';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: true,
    proxy: {
      // changeOrigin rewrites Host to 127.0.0.1:4757, which the server's Host guard accepts.
      '/api': { target: SERVER, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
