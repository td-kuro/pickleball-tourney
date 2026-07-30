# Pickleball Tourney

A simple static web app for running a pickleball session — either a
competitive **Tournament Mode** or a casual **Social Play Mode**. Set up
players and courts, start matches, optionally enter scores round by round,
and track results — with fair bye rotation and matchup variety built in
for both modes.

Live demo (after deployment): `https://<github-username>.github.io/pickleball-tourney/`

## Tournament Mode vs. Social Play Mode

You choose a **Play Mode** on the Setup screen:

- **Tournament Mode** — competitive. Tracks total points, wins, and
  losses, and shows a ranked **Leaderboard**. Best for structured
  tournaments where the final standings matter. The current round can't
  advance until every match is scored.
- **Social Play Mode** — casual. Same fair rotation and pairing engine as
  Tournament Mode (see "How round generation works" below), but ranking is
  de-emphasised: results are shown as **Player Stats** instead of a
  leaderboard, players are listed in roster order rather than ranked, and
  you can move to the next round at any time — you're never blocked
  waiting on scores. Social Play also has its own **Scoring** setting (see
  below).

Both modes use exactly the same fairness rules for who plays, who sits
out, and who gets matched against whom — the difference is entirely in
whether/how scores and rankings are tracked and displayed.

### Social Play scoring options

When Social Play Mode is selected, pick one of three **Scoring** settings:

- **No Scoring** — generate rounds only. No score entry, no points, no
  leaderboard-style stats. Player Stats focuses on games played and byes
  (plus partners/opponents).
- **Track Scores Only** — score inputs appear on each match card and
  scores/total points are recorded, but players are never ranked
  competitively — Player Stats shows points as information, not a
  standing.
- **Track Scores and Wins** — scores, total points, wins, and losses are
  all tracked and shown in Player Stats — still presented as casual stats,
  deliberately not called a "Leaderboard".

## What it does

- **Setup screen** — the app's starting point every time: choose a Play
  Mode (and Social Scoring, if applicable), add players (with an optional
  rating), and configure the number of courts and match type (Singles or
  Doubles).
- **Start Matches** — once setup is valid, generates Round 1 and unlocks
  the Current Round, results, and Round History screens.
- **Current Round screen** — each court's match (with score entry, unless
  Social Play's "No Scoring" is active), plus who's on a bye this round. A
  badge shows which mode/scoring setting is active.
- **Leaderboard** (Tournament Mode) or **Player Stats** (Social Play) —
  see "Difference between Leaderboard and Player Stats" below.
- **Round History screen** — every round played so far, most recent
  first, with matches, scores (if tracked), and who was on a bye.
- Everything is saved to your browser's `localStorage`, so it survives a
  page refresh.

## Setup must be completed before matches start

The app always opens on the Setup screen — the **Current Round**,
**Leaderboard**/**Player Stats**, and **Round History** tabs are disabled
(greyed out, unclickable) until you've clicked **Start Matches** at least
once. This isn't just the tabs being hidden: the app also can't be steered
into those screens by any other means, since they only ever render once a
round actually exists, and a guard automatically snaps the view back to
Setup if it's ever showing a gated screen without one.

Setup is valid — and **Start Matches** becomes clickable — once:

- A Play Mode is selected (Tournament or Social Play).
- Match type is Singles or Doubles.
- Number of courts is at least 1.
- There are enough players for the match type (2+ for Singles, 4+ for
  Doubles).
- Every player has a name (rating is always optional).

If setup is incomplete, reopening the app always lands you back on Setup.
If you've already started a session, reopening the app takes you straight
back to the Current Round screen.

## Setup screen

- **Add Player** / **Players** — two columns on desktop, stacked on
  mobile. The player list is directly editable: click into any name or
  rating field and edit it in place — no separate "Edit" button.
- **Generate player slots** — instead of adding players one at a time,
  enter a number (e.g. `12`) and click **Generate Player Slots** to create
  that many rows at once, named "Player 1", "Player 2", etc. Fill in real
  names (and optional ratings) directly in the list afterward. You can
  still use the **Add Player** form above it to add one player at a time.
- **Session Setup** — Play Mode, Social Scoring (Social Play only),
  number of courts, and Singles/Doubles.
- **Start Matches** — disabled with an explanatory message until setup is
  valid; generates Round 1 and switches you to the Current Round screen.
  Once a session has started, this becomes a **Go to Current Round**
  shortcut instead, and you can still come back to Setup at any time (via
  the tab bar) to add a player or tweak settings — changes there only
  affect rounds generated *after* the change.

## Player ratings are optional

A player can be added (one at a time or via generated slots) without a
rating. An unrated player shows as **Unrated** instead of a number. In
Tournament Mode, rating is only used as a tie-breaker for leaderboard
sorting, and only when it's actually set — unrated players sort after
rated players in a tie, never ahead of them.

## Current Round screen

1. **Current Round** — each court's match. In Tournament Mode, or Social
   Play with a scoring option other than "No Scoring", there's a score
   input for both sides and saving a score shows the winner (highest
   score) right on the match card. With Social Play's "No Scoring", match
   cards just show who's playing — no inputs.
2. **Bye / Sitting Out This Round** — anyone not playing this round.

**Generate Next Round** is disabled in Tournament Mode until every match
in the current round has a saved score. Social Play never blocks on this
— you can move on whenever you're ready.

## Difference between Leaderboard and Player Stats

- **Leaderboard** (Tournament Mode only) — ranked. Shows rank #, player
  name, rating, total points, matches played, wins, losses, and byes;
  sorted by total points, then wins, then fewest byes, then rating. The
  top row is highlighted.
- **Player Stats** (Social Play only) — not ranked. Rows stay in the same
  order as your player list (no rank column, no sorting by performance).
  Always shows games played, byes, and opponents played against (plus
  partners, for Doubles). Total points appears only if scoring is enabled;
  wins/losses appear only with "Track Scores and Wins".

## Round History screen

A read-only log of every round so far, newest first: each match's court,
teams, and score (if scoring is enabled and it was entered), plus who was
on a bye that round. Useful for reviewing a whole session after the fact
in either mode.

## Resetting a tournament

Once a session has started, a **Reset Tournament** button appears next to
the tabs. It asks for confirmation, then clears all rounds and match
results and returns you to the Setup screen — your player list and
session settings (play mode, scoring, courts, match type) are kept, so you
can start again with the same group without re-entering everyone.

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

This is identical in Tournament and Social Play — both modes want fair
rotation and matchup variety; they just differ in whether the outcome is
scored/ranked. Each new round tries to give every player a **new**
opponent before repeating one, using the match history from all prior
rounds:

- **Singles**: players are paired up favoring whoever they've played the
  *fewest* times before. If a fully repeat-free pairing exists for the
  round, the app reliably finds it (verified: 6 players / 3 courts plays a
  complete repeat-free round robin in exactly 5 rounds). If a repeat is
  unavoidable, it picks the pairing with the lowest total number of prior
  meetings.
- **Doubles**: this happens in two steps — first players are grouped into
  2-player teams favoring new partners (avoiding repeat teams), then those
  teams are matched against each other favoring opponent pairs who've
  faced each other the fewest times (avoiding repeat opponents).

Under the hood this is a greedy pairing with random restarts (try several
orderings, keep whichever produces the fewest repeat meetings) rather than
a full optimal matching algorithm — simple to reason about, and it
performs well for the player counts this app is meant for. Match history
(who's played whom, who's partnered whom) isn't stored separately; it's
derived from the existing round-by-round match data, so there's a single
source of truth that's easy to extend later (e.g. factoring in rating
balance).

## How byes work

A bye means a player sits out for the round — no match, no points, no win
or loss recorded, just a tally of how many byes they've had. This applies
in both modes. When there are more players than court capacity, byes are
handed out fairly:

- The app tracks each player's total bye count across all rounds so far.
- When a round needs N players to sit out, it picks the N players with the
  **fewest** byes so far (ties broken by player-list order) —
  equivalently, players with more byes already "banked" are prioritized
  to play, and players who've played the most rounds relative to others
  are prioritized to sit out next.
- This means no one sits out a second time until everyone else has sat out
  once, and so on — an even rotation over the course of the session.

## How scoring works

**Tournament Mode:**

- Each match records a score for both sides. The side with the higher
  score is the winner; equal scores mean no winner is recorded.
- **Points are based on the score achieved, not just who won.** Every
  player on a side receives that side's full score added to their running
  total for every round they play — in Doubles, both teammates get the
  full team score (it isn't split between them).
- The leaderboard is sorted by total points (highest first), then wins
  (highest first), then byes (**lowest** first), then rating (highest
  first).

**Social Play Mode**, depending on the Scoring setting:

- *No Scoring*: no score entry, no points, no wins/losses.
- *Track Scores Only*: scores and total points are recorded the same way
  as Tournament Mode, but never used to rank players.
- *Track Scores and Wins*: scores, points, wins, and losses are all
  recorded — shown as casual Player Stats, not a competitive ranking.

## Validation

- A Play Mode must be selected (Tournament or Social Play).
- Match type must be selected (Singles or Doubles).
- Number of courts must be at least 1.
- Singles requires at least 2 players; Doubles requires at least 4.
- Every player needs a name (rating is optional — leave it blank).
- If a rating is entered, it must be a valid, non-negative number.
- Match scores must be valid, non-negative numbers, whenever scoring is
  enabled for the current mode. In Social Play's "No Scoring", no score
  entry is required or possible.
- **Start Matches** is disabled, with a message explaining why, until all
  of the above are satisfied.
- **Generate Next Round** is disabled in Tournament Mode until every match
  in the current round has a saved score. Social Play never requires this.

## Current limitations

- Matchup-avoidance pairing is a greedy heuristic with random restarts,
  not a guaranteed-optimal matching — for larger or unusual player counts
  it may occasionally settle for a repeat when a cleverer arrangement
  could have avoided one.
- Pairing doesn't yet factor in player rating (no skill-balancing).
- There's no way to edit or regenerate a past round once it's created.
- Removing a player who has already played doesn't rewrite their match
  history — their past matches/byes stay in the data, but they drop off
  the current player list and show as "Unknown player" in Round History.
- Partners/opponents in Player Stats are shown as plain name lists, which
  can get long in a big, long-running session.
- No import/export — data lives only in the current browser's
  `localStorage`.

## Future features

- Rating-aware pairing (balance skill level across courts).
- Editing/regenerating rounds.
- Exporting session results.
- Configurable tournament rules beyond courts/match type.

## Project structure

```
src/
  types.ts                 Shared TypeScript interfaces (Player, Match, Round, PlayMode, ...)
  utils/tournament.ts      Pure logic: pairing, bye rotation, validation, stats, mode helpers
  hooks/                   useLocalStorage, usePlayers, useTournament (state persisted to localStorage)
  components/              PlayerForm, PlayerList, TournamentSetup, RoundView, ByeList,
                            Leaderboard, PlayerStats, RoundHistory
  App.tsx                  Setup / Current Round / results / history views, tab gating, and layout
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
