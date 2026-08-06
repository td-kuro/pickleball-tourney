# PickleRounds

*Fair pickleball rounds for social play and tournaments.*

A simple static web app for running a pickleball session — either a
competitive **Tournament Mode** or a casual **Social Play Mode**. Set up
players and courts, start matches, optionally enter scores round by round,
and track results — with fair bye rotation and matchup variety built in
for both modes.

The UI uses a pickleball-inspired **blue and green** theme (court blue for
primary actions/navigation, court green for "go" actions and wins), and
the header carries a simple pickleball-ball logo as the app's branding —
see "UI theme and branding" below.

Live demo (after deployment): `https://<github-username>.github.io/pickleball-tourney/`
(the GitHub repo is still named `pickleball-tourney` — see "Renaming the
repo to `pickle-rounds`" under "Deploying to GitHub Pages" below).

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

## Social Play session timing

Social Play Mode has a **Session Timing** section on the Setup screen,
which estimates how many rounds fit into your booked court time. It's a
*planning* tool — it doesn't run a live clock (see "Current limitations"
below) — but it turns "we booked 2 hours" into "that's about 10 rounds",
so you know what to expect before you start.

Three fields, each editable in minutes:

- **Session time** — the total booked court time. E.g. a 2-hour booking
  is `120`. Must be greater than 0. Default: `120`.
- **Game time** — how long each game/match takes. Must be between `8`
  and `12` minutes. Default: `10`.
- **Buffer time** — the changeover between games (grabbing a drink,
  switching courts, etc.). Suggested range is `1`–`2` minutes, but `0` is
  allowed. Default: `2`.

### How estimated rounds are calculated

```
round block time = game time + buffer time
estimated rounds = floor(session time / round block time)
remaining time    = session time − (estimated rounds × round block time)
```

**Example:** a 120-minute session with 10-minute games and a 2-minute
buffer gives a 12-minute round block, so `floor(120 / 12) = 10 rounds`
with `0` minutes remaining.

**Example with remainder:** the same 120-minute session with 10-minute
games but only a 1-minute buffer gives an 11-minute round block, so
`floor(120 / 11) = 10 rounds` with `10` minutes remaining.

The Setup screen shows this live as you adjust the fields, e.g. *"Based
on a 120-minute session, 10-minute games, and 2-minute buffers, you can
run approximately **10 rounds** with 0 minutes remaining."* **Start
Matches** is disabled (with a validation message) if the timing fields
are out of range or don't add up to at least one round.

### Round count and pre-generated rounds

Clicking **Start Matches** in Social Play Mode snapshots the estimated
round count for that session and immediately generates **every planned
round**, not just Round 1 — e.g. a 120-minute session at 10-minute games
and a 2-minute buffer generates all 10 rounds in one pass, each with its
own fair matchups and byes, using the same matchup-avoidance/bye-rotation
engine as before (see "How round generation works" below). This works
because the pairing engine only needs to know who played and who sat out
each round — not match results — so the whole session's schedule can be
planned upfront. Round 1 is marked **Current**; the rest are **Upcoming**.
Editing the timing fields afterward (from Setup) doesn't change an
in-progress session's plan.

The Current Round view (see "The Rounds tab" below) shows e.g. **"Round 3
of 10"**. Clicking **Next Round** marks the round you just finished
**Completed** and promotes the next pre-generated **Upcoming** round to
**Current** — instant, since its matchups already exist.

When you reach the estimated final round, a notice appears: *"This is
the estimated final round based on your session timing."* From that
round onward, **Next Round** is replaced with two options:

- **Finish Session** — jumps to Player Stats.
- **Generate Extra Round** — generates another round beyond the plan, if
  you still have court time; the same two options stay available after
  it, so you can add as many extra rounds as you like.

Tournament Mode doesn't show Session Timing or a round target — it isn't
time-boxed the same way, and rounds there are still generated one at a
time (gated on scores being entered), same as before.

## What it does

- **Setup screen** — the app's starting point every time: choose a Play
  Mode (and Social Scoring, if applicable), add players (with an optional
  rating), and configure the number of courts and match type (Singles or
  Doubles).
- **Start Matches** — once setup is valid, generates the round schedule
  (Round 1 only in Tournament Mode; the full planned schedule in Social
  Play — see "Round count and pre-generated rounds" above) and unlocks the
  **Rounds** and results tabs.
- **Rounds tab** — **Current Round** (each court's match, with score entry
  unless Social Play's "No Scoring" is active, plus who's on a bye) and
  **All Rounds** (the full round-by-round schedule, each marked Completed,
  Current, or Upcoming). See "The Rounds tab" below.
- **Leaderboard** (Tournament Mode) or **Player Stats** (Social Play) —
  see "Difference between Leaderboard and Player Stats" below.
- Everything is saved to your browser's `localStorage`, so it survives a
  page refresh.

## Setup must be completed before matches start

The app always opens on the Setup screen — the **Rounds** and
**Leaderboard**/**Player Stats** tabs are disabled (greyed out,
unclickable) until you've clicked **Start Matches** at least once. This
isn't just the tabs being hidden: the app also can't be steered into
those screens by any other means, since they only ever render once a
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
back to the Rounds tab (defaulting to Current Round).

## Setup screen

- **Add Player** / **Players** — two columns on desktop, stacked on
  mobile. The player list is directly editable: click into any name or
  rating field and edit it in place — no separate "Edit" button. Each row
  also has its own **Remove** button for removing one player at a time.
- **Generate player slots** — instead of adding players one at a time,
  enter a number (e.g. `12`) and click **Generate Player Slots** to create
  that many rows at once, named "Player 1", "Player 2", etc. Fill in real
  names (and optional ratings) directly in the list afterward. You can
  still use the **Add Player** form above it to add one player at a time.
- **Remove All Players** — appears next to the "Players" heading whenever
  there's at least one player. Asks for confirmation ("Are you sure you
  want to remove all players?"), then clears the entire roster — names,
  ratings, IDs, and any unfilled generated slots — in one action instead
  of removing rows one by one. This only touches the player list: Play
  Mode, Social Scoring, Session Timing, courts, and match type are left
  exactly as they were. If a session is already in progress, existing
  rounds keep referring to the removed players (shown as "Unknown
  player" — see "Current limitations" below), same as removing a single
  player.
- **Session Setup** — Play Mode, Social Scoring (Social Play only),
  Session Timing (Social Play only — see "Social Play session timing"
  above), number of courts, and Singles/Doubles.
- **Start Matches** — disabled with an explanatory message until setup is
  valid; generates the round schedule and switches you to the Rounds tab
  (Current Round view). Once a session has started, this becomes a **Go to
  Rounds** shortcut instead, and you can still come back to Setup at any
  time (via the tab bar) to add a player or tweak settings. In Tournament
  Mode, changes there only affect rounds generated *after* the change,
  same as before. In Social Play, the full schedule is already generated,
  so settings changes don't retroactively rewrite it — they only apply if
  you later generate an extra round beyond the plan.

## Player ratings are optional

A player can be added (one at a time or via generated slots) without a
rating. An unrated player shows as **Unrated** instead of a number. In
Tournament Mode, rating is only used as a tie-breaker for leaderboard
sorting, and only when it's actually set — unrated players sort after
rated players in a tie, never ahead of them.

## The Rounds tab

Once a session has started, the **Rounds** tab holds a small **Current
Round** / **All Rounds** toggle at the top — a segmented control, not a
separate page, so switching between them is instant and never loses your
place. It always opens on **Current Round**, whichever way you got there
(clicking the tab, **Go to Rounds**, or reopening the app mid-session).

### Current Round

1. **Current Round** — each court's match. In Tournament Mode, or Social
   Play with a scoring option other than "No Scoring", there's a score
   input for both sides and saving a score shows the winner (highest
   score) right on the match card. With Social Play's "No Scoring", match
   cards just show who's playing — no inputs. In Social Play Mode, the
   heading also shows the round count against the session's estimated
   total, e.g. "Round 3 of 10" (see "Social Play session timing" above).
2. **Bye / Sitting Out This Round** — anyone not playing this round.

**Next Round** is disabled in Tournament Mode until every match in the
current round has a saved score. Social Play never blocks on this — you
can move on whenever you're ready. Once a Social Play session reaches its
estimated final round, this button is replaced by **Finish Session** and
**Generate Extra Round**.

### All Rounds

The full round-by-round schedule, in order, each one badged with its
status:

- **Completed** — a round you've moved past. Shown exactly as recorded:
  every match's court, teams, and score/winner (if scoring is enabled and
  was entered), plus who was on a bye. Read-only — there's no way to edit
  a score from this view; score entry only happens on the Current Round
  view.
- **Current** — the active round, highlighted in green, matching what's
  shown on the Current Round view (including any scores already saved).
- **Upcoming** — a round that hasn't been reached yet. In Social Play,
  these already have their real matchups and byes, pre-generated at Start
  Matches (see "Round count and pre-generated rounds" above) — no scores,
  since they haven't been played. In Tournament Mode, upcoming rounds
  don't exist yet (rounds are generated one at a time), so you'll only
  ever see Completed and Current here.

If no rounds exist yet, it shows a friendly empty state instead — in
practice this only happens for a moment, since Start Matches always
generates at least Round 1 immediately.

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

## Resetting a session

Once a session has started, a reset button appears next to the tabs,
labelled for whichever mode is active — **Reset Social Play** in Social
Play Mode, **Reset Tournament** in Tournament Mode. It asks for
confirmation (*"Are you sure you want to reset Social Play?"* /
*"...reset the tournament?"* — "This will clear all players, rounds,
scores, and stats."), then wipes the entire session and returns you to a
blank Setup screen:

- The player list — names, ratings, IDs, generated slots — same as
  **Remove All Players** above.
- Every setting — Play Mode, Social Scoring, courts, match type, and
  Session Timing — back to its default, not just left as-is.
- All rounds (planned, current, and completed), the estimated/planned
  round count, and every match result.
- Leaderboard / Player Stats, since those are always computed from the
  current players and rounds — once both are cleared, there's nothing left
  to show.

This is a full wipe, not a "keep my group, start a new round" reset —
there's no way to reset rounds/scores while keeping the player list; use
individual **Remove**/editing on the Setup screen instead if you want to
keep players between sessions. Everything above is persisted to
`localStorage` via the same hooks that read it, so a reset is reflected
there immediately too — reloading the page after a reset won't bring any
of it back.

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
- In Social Play Mode, Session Timing must also be valid: session time
  greater than 0, game time between 8 and 12 minutes, buffer time 0 or
  greater, and the resulting estimated round count at least 1.
- **Start Matches** is disabled, with a message explaining why, until all
  of the above are satisfied. In Social Play, this also means the session
  timing must produce at least 1 estimated round — a session too short for
  even one round block won't start.
- **Next Round** is disabled in Tournament Mode until every match in the
  current round has a saved score. Social Play never requires this.
- **Reset Social Play** / **Reset Tournament** and **Remove All Players**
  each ask for confirmation before clearing anything — see "Resetting a
  session" and "Setup screen" above.

## Current limitations

- Session Timing is a planning estimate only — the app doesn't run a
  live countdown or clock, and it doesn't automatically move you to the
  next round or notify you when a game's time is up. It just calculates
  how many rounds should fit and tracks the round count against that
  estimate; enforcing an actual timer would be a separate feature.
- Matchup-avoidance pairing is a greedy heuristic with random restarts,
  not a guaranteed-optimal matching — for larger or unusual player counts
  it may occasionally settle for a repeat when a cleverer arrangement
  could have avoided one.
- Pairing doesn't yet factor in player rating (no skill-balancing).
- There's no way to edit or regenerate a past round once it's created.
- Removing a player who has already played doesn't rewrite their match
  history — their past matches/byes stay in the data, but they drop off
  the current player list and show as "Unknown player" in All Rounds.
- Partners/opponents in Player Stats are shown as plain name lists, which
  can get long in a big, long-running session.
- No import/export — data lives only in the current browser's
  `localStorage`.

## Future features

- Rating-aware pairing (balance skill level across courts).
- Editing/regenerating rounds.
- Exporting session results.
- Configurable tournament rules beyond courts/match type.

## UI theme and branding

The app uses a pickleball-inspired **blue and green** colour palette,
applied consistently rather than hardcoded per element:

- **Court blue** is the primary/interactive colour — header accents,
  default buttons, active tabs, active toggle options, focus rings, the
  bye chip, and the Tournament Mode badge.
- **Court green** is reserved for "go" and positive states — the **Start
  Matches** and **Next Round** buttons, a saved match's winner highlight,
  the current round's highlight and status badge in All Rounds, the top
  row of the Leaderboard, and the Social Play Mode badge/toggle (so the
  blue/green pairing doubles as a visual cue for "Tournament vs.
  Social").
- Destructive actions deliberately break from blue/green with a red
  outline (filled only on hover, so they read as available but not
  alarming) — **Remove All Players**, the per-row **Remove** button, and
  the **Reset Social Play**/**Reset Tournament** button all share this
  style.

Both colours (plus their hover/tint/border shades) are defined once as CSS
custom properties in [`src/index.css`](src/index.css) (`--brand-blue`,
`--brand-green`, and the `--accent`/`--accent-2` aliases used throughout
[`src/App.css`](src/App.css)) with separate light/dark values, so the whole
theme can be re-tuned from one place.

The header carries a simple pickleball-ball logo/icon — a blue-to-green
circle with the small round holes a pickleball is known for, built as
inline SVG in [`src/components/PickleballLogo.tsx`](src/components/PickleballLogo.tsx)
(no image asset needed, so it stays crisp at any size and costs nothing
extra to host on GitHub Pages).

### Light / dark mode

The sun/moon button in the header switches between light and dark theme.
The first time you open the app it follows your OS/browser's preferred
colour scheme; once you use the toggle, your choice is remembered in
`localStorage` (`src/hooks/useTheme.ts`) and used on every visit after
that, regardless of the OS setting. A small inline script in
[`index.html`](index.html) applies the saved theme before the page paints,
so there's no flash of the wrong theme on load.

## Project structure

```
src/
  types.ts                 Shared TypeScript interfaces (Player, Match, Round, PlayMode, SessionTiming, ...)
  utils/tournament.ts      Pure logic: pairing, bye rotation, validation, stats, mode helpers, session timing
  hooks/                   useLocalStorage, usePlayers, useTournament (state persisted to localStorage)
  components/              PlayerForm, PlayerList, TournamentSetup, RoundsPage,
                            CurrentRoundView, AllRoundsView, ByeList, Leaderboard,
                            PlayerStats, PickleballLogo
  App.tsx                  Setup / Rounds / results views, tab gating, and layout
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

1. Push this repo to GitHub. The repo is currently named
   `pickleball-tourney`; the suggested name going forward is
   `pickle-rounds`, matching the **PickleRounds** app name — see
   "Renaming the repo to `pickle-rounds`" below if you're doing that now.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Push to `main` (or run the workflow manually from the **Actions** tab).
5. Once the workflow finishes, your app will be live at:
   `https://<github-username>.github.io/pickleball-tourney/`

The Vite config ([`vite.config.ts`](vite.config.ts)) sets
`base: "/pickleball-tourney/"` so asset URLs resolve correctly under that
subpath — this must match the repository name exactly.

### Renaming the repo to `pickle-rounds`

The app is branded **PickleRounds**, but the GitHub repository hasn't
been renamed yet — it's still `pickleball-tourney`, so the base path and
live demo URL above are unchanged for now. Once the repo is renamed to
`pickle-rounds` on GitHub:

1. Update `base` in [`vite.config.ts`](vite.config.ts) from
   `'/pickleball-tourney/'` to `'/pickle-rounds/'`.
2. Update the live demo URL at the top of this README and step 5 above to
   `https://<github-username>.github.io/pickle-rounds/`.
3. No other code changes are needed for the rename — GitHub Pages' base
   path just has to match the new repo name exactly, or asset URLs will
   404 after deployment.
