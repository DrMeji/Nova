import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  // Relative base so the production bundle loads correctly from
  // the file:// protocol inside the Electron desktop app.
  base: './',
  plugins: [
    react(),
    // Electron loads index.html via file:// — crossorigin on module/CSS
    // tags can leave a blank (black) window in packaged builds.
    {
      name: 'NOVA-strip-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin(?:="[^"]*")?/gi, '');
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    watch: {
      // Installer binaries in release/ are often locked during publish and crash Vite's watcher.
      ignored: ['**/release/**', '**/.tmp*/**'],
    },
  },
});
