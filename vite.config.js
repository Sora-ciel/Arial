import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  build: {
    rollupOptions: {
      // Packaging-only dependencies — not installed in the web build
      external: [
        '@tauri-apps/plugin-fs',
        '@capacitor/filesystem'
      ]
    }
  }
})
