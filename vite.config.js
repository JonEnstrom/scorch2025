// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      'three/addons': path.resolve('node_modules/three/examples/jsm')
    }
  },

  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['ammo.js']
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        game: path.resolve(__dirname, 'game.html'),
      },
      external: ['ammo.js']
    },
    commonjsOptions: {
      include: [/ammo\.js/, /node_modules/],
      transformMixedEsModules: true
    }
  },
  
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3003',
        ws: true,            // enable websockets
        changeOrigin: true,  // often needed for virtual hosted sites
      },
      '/create-game': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/games': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/lobby-players': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/init-player': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
});