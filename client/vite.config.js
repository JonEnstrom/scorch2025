// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,            // enable websockets
        changeOrigin: true,  // often needed for virtual hosted sites
      },
      '/create-game': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/games': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/lobby-players': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/init-player': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});