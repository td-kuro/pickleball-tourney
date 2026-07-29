# Pickleball Tourney

A simple static web app for running a pickleball tournament: set up players
and courts, start matches, enter scores round by round, and track a live
leaderboard — with fair bye rotation and matchup variety built in.

Live demo (after deployment): `https://<github-username>.github.io/pickleball-tourney/`

## What it does

- **Setup screen** — add, edit, and remove players (name + rating), and
  configure the number of courts and match type (Singles or Doubles).
- **Start Matches** — once setup is valid, generates Round 1 and switches
  you to the Current Round screen.
- **Current Round screen** — shows each court's match with score entry,
  who's on a bye this round, and a live leaderboard.
- Everything is saved to your browser's `localStorage`, so it survives a
  page refresh — including which screen you were on.

## Setup screen

The app opens on the setup screen (unless a tournament is already in
progress). It has:

- **Add Player** / **Players** — two columns on desktop, stacked on mobile.
- **Tournament Setup** — number of courts and Singles/Doubles.
- **Start Matches** — validates that setup is valid (see Validation below),
  generates Round 1, and takes you to the Current Round screen. Once a
  tournament has started, this becomes a **Go to Current Round** shortcut
  instead, and you can still come back to Setup at any time (via the tab
  bar) to add a player or tweak settings — changes there only affect
  rounds generated *after* the change.

## Current Round screen

Two columns on desktop (stacked on mobile, in this order):

1. **Current Round** — each court's match, with a score input for both
   sides. Saving a score shows the winner (highest score) right on the
   match card.
2. **Bye / Sitting Out This Round** — anyone not playing this round.
3. **Leaderboard** — shown beside the round on desktop, below it on
   mobile.

**Generate Next Round** is disabled until every match in the current round
has a saved score (see Validation).

## Match types

- **Singles** — each court needs 2 players, Player A vs Player B.
- **Doubles** — each court needs 4 players, grouped into two 2-player
  teams, Team A vs Team B.

The number of courts times the players-per-court determines how many
players can play each round — e.g. 3 courts in Singles fits 6 players per
round, 3 courts in Doubles fits 12 players per round. Any players beyond
that (or left over because they don't fill a complete court) sit out on a
**bye** for the round.

## How round generation works (matchup avoidance)

Each new round tries to give every player a **new** opponent before
repeating one, using the match history from all prior rounds:

- **Singles**: players are paired up favoring whoever they've played the
  *fewest* times before. If a fully repeat-free pairing exists for the
  round, the app reliably finds it (verified: 6 players / 3 courts plays a
  complete repeat-free round robin in exactly 5 rounds). If a repeat is
  unavoidable, it picks the pairing with the lowest total number of prior
  meetings.
- **Doubles**: this happens in two steps — first players are grouped into
  2-player teams favoring new teammates (avoiding repeat teams), then
  those teams are matched against each other favoring opponent pairs
  who've faced each other the fewest times (avoiding repeat opponents).

Under the hood this is a greedy pairing with random restarts (try several
orderings, keep whichever produces the fewest repeat meetings) rather than
a full optimal matching algorithm — simple to reason about, and it
performs well for the player counts this app is meant for. Match history
(who's played whom, who's been teammates) isn't stored separately; it's
derived from the existing round-by-round match data, so there's a single
source of truth that's easy to extend later (e.g. factoring in rating
balance).

## How byes work

A bye means a player sits out for the round — no match, no points, no win
or loss recorded, just a tally of how many byes they've had. When there
are more players than court capacity, byes are handed out fairly:

- The app tracks each player's total bye count across all rounds so far.
- When a round needs N players to sit out, it picks the N players with the
  **fewest** byes so far (ties broken by player-list order) — equivalently,
  players with more byes already "banked" are prioritized to play.
- This means no one sits out a second time until everyone else has sat out
  once, and so on — an even rotation over the course of the tournament.

## How scoring and points work

- Each match records a score for both sides (Player/Team A and
  Player/Team B). The side with the higher score is the winner; equal
  scores mean no winner is recorded for that match.
- **Points are based on the score achieved, not just who won.** Every
  player on a side receives that side's full score added to their running
  total for every round they play — in Doubles, both teammates get the
  full team score (it isn't split between them).
- The leaderboard shows, per player: rating, total points, matches played,
  wins, losses, and byes — sorted by total points (highest first), then
  wins (highest first), then byes (**lowest** first), then rating
  (highest first).

## Validation

- Number of courts must be at least 1.
- Player rating must be a valid, non-negative number.
- Singles requires at least 2 players; Doubles requires at least 4.
- Match scores must be valid, non-negative numbers.
- **Start Matches** is disabled until setup is valid.
- **Generate Next Round** is disabled until every match in the current
  round has a saved score.

## Current limitations

- Matchup-avoidance pairing is a greedy heuristic with random restarts,
  not a guaranteed-optimal matching — for larger or unusual player counts
  it may occasionally settle for a repeat when a cleverer arrangement
  could have avoided one.
- Pairing doesn't yet factor in player rating (no skill-balancing).
- There's no way to edit or regenerate a past round once it's created.
- Removing a player who has already played doesn't rewrite their match
  history — their past matches/byes stay in the data, but they drop off
  the leaderboard and show as "Unknown player" in past rounds.
- No import/export — data lives only in the current browser's
  `localStorage`.

## Future features

- Rating-aware pairing (balance skill level across courts).
- Editing/regenerating rounds.
- Exporting tournament results.
- Configurable tournament rules beyond courts/match type.

## Project structure

```
src/
  types.ts               Shared TypeScript interfaces (Player, Match, Round, ...)
  utils/tournament.ts    Pure tournament logic: pairing, bye rotation, validation, stats
  hooks/                 useLocalStorage, usePlayers, useTournament (state persisted to localStorage)
  components/            PlayerForm, PlayerList, TournamentSetup, RoundView, ByeList, Leaderboard
  App.tsx                Setup / Current Round views and layout
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
