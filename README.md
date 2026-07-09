# Pickleball Tourney

A simple static web app for running a pickleball tournament: add players
with a name and skill rating, configure courts and match type, generate
rounds, enter scores, and track a live leaderboard.

Live demo (after deployment): `https://<github-username>.github.io/pickleball-tourney/`

## What it does

- Add, edit, and remove players with a name and rating.
- Configure the number of courts and match type (Singles or Doubles).
- Generate a round that assigns players to courts in order, leaving anyone
  who doesn't fit in the "Waiting / Not Playing This Round" list.
- Enter a score for each match; the app shows the winner and tracks points
  per player across all rounds.
- A leaderboard ranks players by total points, wins, and rating.
- Everything is saved to your browser's `localStorage`, so it survives a
  page refresh.

## Match types

- **Singles** — each court needs 2 players, Player A vs Player B.
- **Doubles** — each court needs 4 players, grouped into two 2-player
  teams, Team A vs Team B.

The number of courts times the players-per-court determines how many
players can play each round — e.g. 3 courts in Singles fits 6 players per
round, 3 courts in Doubles fits 12 players per round. Any players beyond
that sit out ("wait") for the round.

## How round generation works

Round generation is intentionally simple for now: players are assigned to
courts in the order they were added, filling one court at a time (pairs
for Singles, groups of 4 split into two teams of 2 for Doubles). Anyone
who doesn't fill a complete court waits out that round. More advanced
pairing (e.g. balancing by rating, avoiding repeat matchups, rotating who
sits out) can be layered on top of this later without changing the UI.

## How scoring and points work

- Each match records a score for both sides (Player/Team A and
  Player/Team B). The side with the higher score is the winner; equal
  scores mean no winner is recorded for that match.
- **Points are based on the score achieved, not just who won.** Every
  player on a side receives that side's full score added to their running
  total for every round they play — in Doubles, both teammates get the
  full team score (it isn't split between them).
- The leaderboard shows, per player: rating, total points, matches played,
  wins, and losses — sorted by total points (highest first), then wins,
  then rating.

## Current limitations

- Round pairing is simple ordered pairing, not skill-balanced or
  matchup-aware.
- There's no way to edit or regenerate a past round once it's created.
- No import/export — data lives only in the current browser's
  `localStorage`.

## Future features

- Configurable tournament rules (scoring format, rating-based pairing,
  avoiding repeat matchups, etc.)
- Editing/regenerating rounds
- Exporting tournament results

## Project structure

```
src/
  types.ts               Shared TypeScript interfaces (Player, Match, Round, ...)
  utils/tournament.ts    Pure tournament logic: pairing, validation, stats
  hooks/                 useLocalStorage, usePlayers, useTournament (state persisted to localStorage)
  components/            PlayerForm, PlayerList, TournamentSetup, RoundView, Leaderboard
  App.tsx                Assembles the page from the components above
```

Business logic lives in `src/utils` and `src/hooks`, separate from the
components in `src/components`, so the pairing/scoring rules can evolve
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
