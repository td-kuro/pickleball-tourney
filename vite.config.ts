import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Must match the GitHub repo name so assets resolve correctly on GitHub Pages:
  // https://<username>.github.io/pickleball-tourney/
  base: '/pickleball-tourney/',
})
