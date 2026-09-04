import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// The version the app reports about itself.
//
// It is read from tauri.conf.json because that is already one of the two files
// a release edits, so there is nothing new to remember to bump — and a version
// nobody remembers to bump is worse than none, since it says the wrong thing
// confidently. package.json stays at 0.0.0, as it has for every release so far.
const appVersion = JSON.parse(
  readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8')
).version

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  }
})
