import { defineConfig } from 'vite';

export default defineConfig({
  base: '/AlertaHeliosfera/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
