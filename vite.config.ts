import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// Build modes:
//   default       split assets for Tauri (Windows) and Capacitor (Android/iOS)
//   web-single    one self-contained index.html (shareable preview)
//   pages         installable web app (PWA) for GitHub Pages: manifest + offline service worker
const pwa = () =>
  VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'sw.ts',
    registerType: 'prompt',
    injectRegister: null,
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    },
    manifest: {
      id: './',
      name: 'Spubber',
      short_name: 'Spubber',
      description: 'Lectura rápida (RSVP) para tus libros EPUB',
      lang: 'es',
      dir: 'ltr',
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: 'any',
      background_color: '#14161b',
      theme_color: '#14161b',
      categories: ['books', 'education', 'productivity'],
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      // Android: "Share → Spubber" from WhatsApp, Files, Drive…
      share_target: {
        action: './share-target',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: { files: [{ name: 'books', accept: ['application/epub+zip', '.epub', 'application/octet-stream'] }] },
      },
    },
  })

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'web-single' ? [viteSingleFile()] : []), ...(mode === 'pages' ? [pwa()] : [])],
  define: {
    __PWA__: JSON.stringify(mode === 'pages'),
  },
  resolve: {
    alias: (mode === 'pages' ? {} : { 'virtual:pwa-register': fileURLToPath(new URL('./src/platform/pwa-register-stub.ts', import.meta.url)) }) as Record<string, string>,
  },
  // Relative base so the same build works in Tauri, Capacitor and any sub-path.
  base: './',
  assetsInclude: ['**/*.epub'],
  build: {
    target: 'es2022',
    outDir: mode === 'web-single' ? 'dist-single' : mode === 'pages' ? 'dist-pages' : 'dist',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
}))
