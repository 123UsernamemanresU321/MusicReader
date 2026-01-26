import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for GitHub Pages - will be /<repo-name>/
  // Set via environment variable or default to '/' for local dev
  base: process.env.VITE_BASE_PATH || '/',
  
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  },
  
  server: {
    port: 3000,
    open: true
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: [
      '@supabase/supabase-js',
      'pdfjs-dist',
      'opensheetmusicdisplay',
      'jszip'
    ]
  }
});
