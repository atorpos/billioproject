import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.API_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev requests to /api are proxied to the Express server, so the browser only
    // ever talks to one origin and there is no CORS configuration to get wrong.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
});
