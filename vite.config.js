import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: process.env.SINGLE ? 'dist-single' : 'dist',
    copyPublicDir: !process.env.SINGLE,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: { main: 'index.html' },
      output: process.env.SINGLE ? { inlineDynamicImports: true } : { manualChunks: { three: ['three'], rapier: ['@dimforge/rapier3d-compat'], supabase: ['@supabase/supabase-js'] } },
    },
  },
  server: { host: true, port: 5173 },
});
