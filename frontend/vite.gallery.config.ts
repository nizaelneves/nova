import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A separate build for the animation gallery (gallery.html): one chunk, with everything inlined later by scripts/build-gallery.mjs
// into a single HTML file. It is not part of the app's own build.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  plugins: [react()],
  build: {
    outDir: '../.gallery-build',
    emptyOutDir: true,
    target: ['es2020', 'chrome87', 'edge88', 'firefox78', 'safari14'],
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rolldownOptions: { input: path.resolve(import.meta.dirname, process.env.GALLERY_ENTRY ?? 'gallery.html'), output: { format: 'iife', codeSplitting: false } },
  },
});
