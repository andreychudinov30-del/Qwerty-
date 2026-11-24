import { defineConfig } from 'vite';
export default defineConfig({
  root: __dirname,
  base: './',
  build: {
    target: 'es2020', minify: process.env.MIN ? 'esbuild' : false,
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 20000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  server: { host: true, port: 5180 },
});
