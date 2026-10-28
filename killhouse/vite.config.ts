import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained index.html (JS + CSS inlined) so the game can be opened
// straight from a phone's file browser or any static host with no server setup.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    chunkSizeWarningLimit: 2048,
  },
});
