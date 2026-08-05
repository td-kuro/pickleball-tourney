import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Must match the GitHub repo name so assets resolve correctly on GitHub Pages:
  // https://<username>.github.io/pickleball-tourney/
  // The app is branded PickleRounds, but the GitHub repo hasn't been renamed
  // from pickleball-tourney yet — once it's renamed to pickle-rounds, update
  // this to '/pickle-rounds/' (see "Renaming the repo" in README.md).
  base: '/pickleball-tourney/',
})
