import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { defineConfig } from 'vitest/config'

// `vite build --mode web-single` produces one self-contained index.html
// (used for the shareable web preview); the default build is split into
// cacheable assets for Tauri and Capacitor.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'web-single' ? [viteSingleFile()] : [])],
  // Relative base so the same build works in Tauri, Capacitor and any sub-path.
  base: './',
  assetsInclude: ['**/*.epub'],
  build: {
    target: 'es2022',
    outDir: mode === 'web-single' ? 'dist-single' : 'dist',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
}))
