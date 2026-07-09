# Pickleball Tourney

A simple static web app for setting up a pickleball tournament: add players
with a name and skill rating, then (in a future update) generate rounds and
update them based on match results.

Live demo (after deployment): `https://<github-username>.github.io/pickleball-tourney/`

## What it does

- Lets you add, edit, and remove players with a name and rating.
- Saves the player list to your browser's `localStorage`, so it survives a
  page refresh.
- Provides placeholder sections for "Tournament Rules" and "Generate Rounds",
  ready to be built out once the tournament engine is implemented.

## Current features

- Add / edit / remove players (name + rating)
- Player list persisted in `localStorage`
- Placeholder "Tournament Rules" section
- Placeholder "Generate Rounds" section
- Placeholder types and a placeholder engine module for the future tournament
  logic (see [`src/types`](src/types/index.ts) and
  [`src/engine/tournamentEngine.ts`](src/engine/tournamentEngine.ts))

## Future features

- Configurable tournament rules (scoring format, number of courts, etc.)
- Automatic round/match generation from the player list
- Recording match results and updating standings
- Generating the next round based on previous results

## Project structure

```
src/
  types/               Shared TypeScript interfaces (Player, Match, Round, ...)
  engine/               Placeholder tournament logic, kept separate from the UI
  hooks/                useLocalStorage + usePlayers (state persisted to localStorage)
  components/           PlayerForm, PlayerList, RulesSection, RoundsSection
  App.tsx               Assembles the page from the components above
```

Business logic lives in `src/engine` and `src/hooks`, separate from the
components in `src/components`, so the tournament engine can be built out
later without rewriting the UI.

## Running locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Then open the URL printed in the terminal (usually `http://localhost:5173`).

## Building

```bash
npm run build
```

Output is written to `dist/`. You can preview the production build locally with:

```bash
npm run preview
```

## Deploying to GitHub Pages

This repo includes a GitHub Actions workflow
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) that builds
the app and deploys it to GitHub Pages on every push to `main`.

To enable it:

1. Push this repo to GitHub as `pickleball-tourney`.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Push to `main` (or run the workflow manually from the **Actions** tab).
5. Once the workflow finishes, your app will be live at:
   `https://<github-username>.github.io/pickleball-tourney/`

The Vite config ([`vite.config.ts`](vite.config.ts)) sets
`base: "/pickleball-tourney/"` so asset URLs resolve correctly under that
subpath — this must match the repository name if you rename it.
