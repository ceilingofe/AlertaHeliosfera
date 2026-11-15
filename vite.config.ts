import { defineConfig } from 'vite';

export default defineConfig({
  base: '/AlertaHeliosfera/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Separa el motor para cachearlo aparte del código del juego.
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
