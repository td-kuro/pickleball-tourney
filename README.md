# PickleRounds

*Fair pickleball rounds for social play and tournaments.*

A simple static web app for running a pickleball session — a competitive
**Tournament Mode**, a casual **Social Play Mode**, or **5-Player King
Court Mode**, a structurally different ladder format where fixed 5-player
courts run 5-game cycles and players move between courts based on results
(see "5-Player King Court Mode" below). Set up players and courts, start
matches, optionally enter scores round by round, and track results — with
fair bye rotation and matchup variety built in for Tournament/Social Play.

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

**5-Player King Court Mode** is a third Play Mode, structurally separate
from both of the above — it doesn't use rounds, byes, or the
matchup-avoidance engine described here at all. See "5-Player King Court
Mode" below for its own complete write-up.

### Tournament Mode formats: Leaderboard vs. Pools & Knockout

When Tournament Mode is selected, a **Tournament Format** choice appears:

- **Leaderboard** — the tournament behaviour described above: rotating
  rounds, ranked by total points, wins, losses, and byes.
- **Pools & Knockout** — a structurally different, two-stage format: fixed
  **Teams** (one player each in Singles, two in Doubles) play a
  round-robin **Pool Stage**, then the top teams from each pool cross into
  a single-elimination **Knockout Stage** bracket. See "Pools & Knockout"
  below for the full breakdown — it's substantial enough to warrant its
  own section.

Once **Start Matches** is clicked, the Tournament Format toggle locks (it's
greyed out on the Setup screen) so a live pool/bracket can't be silently
swapped out from under itself — **Reset Tournament** unlocks it again.

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

## Pools & Knockout

A Tournament Mode format for running an actual bracketed event instead of
one long ranked leaderboard. It has its own data model entirely separate
from Leaderboard/Social Play's rotating rounds — **Teams** are persistent
for the whole tournament (not re-paired every round), and there's no bye
rotation, since every team's schedule is fixed for the whole pool stage.

### Team

- **Singles**: one team per player.
- **Doubles + Rotating Players** (Add Player): teams are auto-formed for
  this tournament only, by taking players two at a time in the order they
  appear in the player list (Player 1 & Player 2 are Team 1, Player 3 &
  Player 4 are Team 2, and so on). Reorder the player list on Setup first
  if you want specific pairings this way.
- **Doubles + Fixed Teams** (Add Team): your declared teams — names,
  pairings, and ratings — are used directly instead, no auto-pairing
  involved. See "Doubles: Rotating Players vs. Fixed Teams" below for how
  to set this up.

### Setup

Selecting **Pools & Knockout** adds a **Pools & Knockout Setup** section
with four fields, plus a live summary of how many teams/players that adds
up to:

- **Number of pools** — at least 1.
- **Teams per pool** — at least 2.
- **Times each team plays each other** — at least 1 (2 = every pool match
  is effectively played home-and-away).
- **Teams advancing per pool** — at least 1, and no more than teams per
  pool. The total across all pools (pools × teams advancing) must be at
  least 2, since that's who ends up in the knockout bracket.

Pools are filled automatically and evenly — teams are split into
consecutive chunks (Pool A gets the first `teamsPerPool` teams, Pool B the
next, and so on) rather than any interleaved or skill-balanced assignment.
There's no manual pool assignment yet (see "Current limitations").

Unlike the rest of the app, **Start Matches** here needs an *exact* player
count, not just "enough" — `pools × teams per pool × players per team`,
exactly. If you have too many or too few, the hint tells you exactly how
many you need and how many you have; extra/missing players aren't
silently handled.

### Pool Stage

Clicking **Start Matches** immediately generates every pool's full
round-robin schedule (all matches for all pools exist right away, similar
to how Social Play pre-generates its whole session — see above). Within a
pool, every team plays every other team once, repeated *times each team
plays each other* times. For a 4-team pool with that set to 1, that's the
6 matches T1–T2, T1–T3, T1–T4, T2–T3, T2–T4, T3–T4; set to 2 repeats the
same 6 matches twice.

The **Tournament** tab (Pools & Knockout's version of the Rounds tab) has
its own **Pool Stage** / **Knockout Bracket** toggle. Pool Stage shows
every pool as its own card: all of that pool's matches (with score entry,
same match card style as everywhere else in the app) and, underneath, that
pool's live standings table. There's no "current match" concept — every
pool match in every pool can be scored independently, any time, in any
order.

### Pool standings and advancement

Each pool has its own live-updating standings table: **W**, **L**, **PF**
(Points For — total points scored across the pool's matches), **PA**
(Points Against), and **+/-** (PF − PA). Ranking within a pool, applied in
order:

1. Most wins.
2. If tied, highest point difference (+/-).
3. If still tied, head-to-head result — whichever of the two tied teams
   won more of their matches against each other ranks higher. (This is a
   pairwise check between the two teams being compared, so a 3-way cyclic
   tie — A beat B, B beat C, C beat A — isn't specially unwound; it falls
   through to the next rule instead.)
4. If still tied, highest Points For.
5. If still tied, each team's original position in the pool (i.e. nothing
   changes — ties this deep are rare and this is a reasonable, simple
   fallback).

Once every pool match everywhere has a score, **Advance to Knockout**
becomes clickable. The top N teams from each pool (N = teams advancing per
pool) are marked **Qualified** in that pool's standings table.

### Knockout Stage

Clicking **Advance to Knockout** seeds every qualified team and builds the
entire bracket in one pass. Seeding: every pool's 1st-place finisher
first, sorted by wins/+/-/PF, then every pool's 2nd-place finisher the
same way, and so on — then the strongest seed plays the weakest, the
2nd-strongest plays the 2nd-weakest, and so on (seed 1 vs. seed 8, seed 2
vs. seed 7, ...).

If the number of qualified teams isn't a power of two, the bracket is
padded up to the next one with **byes**, given to the top seeds — a bye
means that team advances automatically with no match needed. Two teams
that both got a bye in the same first-round pairing get matched against
each other immediately, with no waiting required.

Round names depend on how many teams are in that round: 2 teams = **Final**,
4 = **Semifinals**, 8 = **Quarterfinals**, otherwise **Round of N**. The
**Knockout Bracket** view is a simple vertical list of rounds (not a
graphical bracket, so it stays readable on mobile) — each match shows both
teams, a score entry form once both teams are known, and a clear winner
label once scored. Unlike pool matches, knockout matches don't allow tied
scores — a winner is required to advance the bracket.

**3rd Place Match**: once there's a real Semifinals round, the two
semifinal losers play each other for 3rd place instead of being simply
eliminated — the Final decides 1st/2nd, the 3rd Place Match decides
3rd/4th. (The one exception: if a semifinal itself was a bye, that team
never had a real opponent to send to a 3rd-place match, so no 3rd Place
Match is created for that bracket — this only comes up with a small number
of qualified teams padded up to 4.)

### Final Results

The results tab (labelled **Final Results** instead of Leaderboard/Player
Stats) shows a friendly in-progress message until the Final — and the 3rd
Place Match, if there is one — are both scored. Once complete, it shows
Champion, Runner-up, 3rd Place, and 4th Place (when there is a 3rd Place
Match), followed by every pool's final standings and the full knockout
bracket read-only.

## 5-Player King Court Mode

A third **Play Mode**, structurally separate from Tournament and Social
Play — it has its own data model entirely (courts, cycles, and games, not
rounds/matches), its own `localStorage` keys, its own navigation tabs
(**Setup**, **King Court**, **Standings**, **Cycle History** — Rounds/
Leaderboard/Player Stats aren't shown), and its own **Reset King Court**
button. Select it from **Play Mode** on the Setup screen.

It models a "king of the court" ladder night: fixed **courts of exactly 5
players**, each running an independent **cycle** of 5 doubles games, after
which players move up or down between courts based on how they did.

### The 5-game cycle

Every court's 5 players are assigned positions **A–E** (see "A–E
assignment" below), and every cycle follows this exact schedule — in each
game, 4 players (2 teams of 2) play doubles while 1 rests:

| Game | Team 1 | Team 2 | Rests |
| ---- | ------ | ------ | ----- |
| 1    | A + B  | C + D  | E     |
| 2    | A + C  | D + E  | B     |
| 3    | A + D  | B + E  | C     |
| 4    | A + E  | B + C  | D     |
| 5    | B + D  | C + E  | A     |

This exact pattern is a complete round robin for 5 players: the 5 `rest`
slots are all different players (everyone rests exactly once), and the 10
team pairings across the 5 games (2 per game) are precisely the 10 unique
pairs of 5 players — so **everyone partners with everyone else exactly
once** per cycle, and everyone plays 4 of the 5 games.

All courts play through the same game number together — Cycle 1/Game 1 on
every court, then Cycle 1/Game 2 on every court, and so on through Game 5
— rather than each court running its own cycle independently, so the host
can call out "Game 3" once for the whole session.

### A–E assignment

Because the rotation above is a *complete* round robin, every one of a
court's 5 players' 10 possible pairs partners exactly once **within a
cycle no matter which physical player is "A" vs. "E"** — that part is
already guaranteed by the pattern itself, not something the A–E order can
improve on. What the A–E order *does* control is which numbered game (1–5)
each pairing/rest falls in. King Court uses each player's prior partner
history (built from every game played across every earlier cycle) to
choose an A–E order that front-loads fresher pairings into earlier games
and pushes already-frequent pairings later — a modest, honest lever given
that constraint, not a claim that it can avoid a repeat pairing outright
(see `assignPlayersToLetters` in
[`src/utils/kingCourt.ts`](src/utils/kingCourt.ts) for the exact
approach). Cycle 1 has no history yet, so its A–E order falls back to
plain seeding order.

### Scoring and point differential

Each game gets a **Team 1** and **Team 2** score; the higher score wins.
Both players on the winning team get **+1 win**; both on the losing team
get **+1 loss**; the resting player gets nothing for that game. Point
differential is the losing/winning **margin**, applied per player, summed
across every game they played that cycle (and across the whole session on
the Standings tab) — e.g. an 11–7 win gives both winners `+4` and both
losers `-4`; the resting player gets `0`. Equal scores record no winner
and no win/loss/differential for anyone that game (same "no winner on a
tie" rule as Tournament/Social Play match cards).

### Cycle standings and ties

After every court's Game 5 is scored, that court's 5 players are ranked:

1. Most **wins** this cycle.
2. If tied, highest **point differential** this cycle.
3. If still tied on both, a manual tiebreak.

Players tied on both wins and point differential are flagged **Tied** on
the Movement Preview screen (see below), with a simple reorder control
(↑/↓ buttons, then **Apply Tiebreak Order**) so the organiser can set the
final order themselves before confirming — the automatic rules genuinely
can't break a real tie, so this is deliberately a manual step rather than
an arbitrary tiebreak.

### Court movement

After standings, each player's next-cycle court is decided by rank:

- **1st & 2nd** move up one court.
- **3rd** stays on the same court.
- **4th & 5th** move down one court.

**Top court**: there's nowhere higher, so 1st & 2nd simply stay too — the
top court keeps its 1st, 2nd, and 3rd place finishers (3 players), and
receives the 1st & 2nd place finishers promoted from the court below (2
players) to refill the other 2 slots. **Bottom court**: symmetric — 4th &
5th simply stay (nowhere lower to go), the bottom court keeps its 3rd,
4th, and 5th place finishers, and receives the 4th & 5th place finishers
demoted from the court above.

The **Movement Preview** screen (shown automatically once every court has
finished Game 5) lists every player's rank, win/loss record, point
differential, and a direction icon (⬆️ up / ➖ stay / ⬇️ down), with a
per-player **court override dropdown** in case the organiser wants to send
someone to a different court than the computed one — the host may know a
player's true level better than one cycle's results show. Clicking **Move
Players & Start Next Cycle** applies every court's movement at once and
immediately generates the next cycle: each court's new group of 5 (some
combination of stayers and promoted/demoted players, per the rules above)
becomes a fresh A–E assignment and a fresh 5-game rotation, using the
accumulated partner history across the whole session so far (see "A–E
assignment" above).

### Manual seeding

Before Cycle 1, the **Court Seeding** section (on the Setup tab, below
King Court Setup) lets the organiser place every player onto a starting
court — e.g. seed your strongest 5 players onto the top court, next
strongest onto the court below, and so on. **Higher court number means a
stronger court** (Court 6 is the strongest of 6 courts, Court 1 the
weakest). Each unassigned player gets a "move to court" dropdown, and
every already-placed player gets the same dropdown (plus an "Unassign"
option) so seeding can be freely rearranged before starting. **Start
Cycle 1** stays disabled until every player is assigned and every court
has exactly 5.

### Setup and validation

- **Number of players**, **number of courts**, player **names**, and an
  optional **rating** per player (rating isn't used by any King Court
  logic yet — see "Current limitations" below).
- Total players must **exactly** equal `courts × 5` — e.g. 6 courts needs
  exactly 30 players, 4 courts needs exactly 20. This isn't a minimum like
  other modes; too many or too few players both block starting, with a
  message showing exactly how many you have vs. need.
- Every player needs a name before seeding.
- Court Seeding additionally requires every player assigned to a court and
  every court to have exactly 5, before **Start Cycle 1** unlocks.
- Once Cycle 1 has started, the roster, court count, and seeding all lock
  (mirroring Tournament Format locking once Start Matches is clicked
  elsewhere in the app) — **Reset King Court** is the only way back to an
  editable roster.

### App flow

```
Setup players → Seed players into courts → Start Cycle 1
  → Game 1 (enter scores for every court) → Next Game
  → Game 2 → Next Game → Game 3 → Next Game → Game 4 → Next Game
  → Game 5 → Finish Cycle
  → standings calculated → Movement Preview → Move Players & Start Next Cycle
  → Cycle 2 (repeats indefinitely)
```

The **King Court** tab shows, for the cycle's current game and every
court at once: court number, team 1, team 2, who's resting, a score input
for each team, and the winner once both scores are in. **Next Game**
(or **Finish Cycle** on Game 5) is disabled until every court's current
game is scored. There's no fixed number of cycles — the session just
keeps generating a new cycle each time movement is confirmed, for as long
as the host wants to keep playing.

### Standings and Cycle History tabs

- **Standings** — a **Session Stats** table (every player's cumulative
  wins, losses, point differential, games played, and games rested across
  the whole session, plus their current court, ranked by wins then point
  differential), and a **Cycle N Standings** section below it with each
  court's live current-cycle table (updates as scores come in, even
  mid-cycle).
- **Cycle History** — every *completed* cycle (i.e. one where movement has
  already been confirmed), most recent first, showing each court's final
  rank, record, and which court each player moved to. Read-only.

### Resetting King Court

Once a King Court session has started, the reset button (labelled
**Reset King Court** instead of Reset Tournament/Reset Social Play) asks
for confirmation, then clears the player roster, court seeding, every
cycle/game/score/standing/movement record, and resets Play Mode back to
Tournament Mode — the same full-wipe, "back to a blank Setup screen"
behaviour as Reset Tournament/Reset Social Play elsewhere in the app.

### Current limitations (King Court-specific)

- **A–E assignment can't reduce partnerships within a single cycle** —
  see "A–E assignment" above: every pair of a court's 5 players partners
  exactly once per cycle no matter the letter order, so partner history
  only influences *which game* a pairing falls in, not whether cross-cycle
  repeats happen. If the same 5 players end up regrouped on a court in a
  later cycle (most likely on a single-court session, where the same 5
  players are stuck together every cycle), the same 10 pairings simply
  repeat — there's no way around that with this rotation format.
- **Player rating isn't used anywhere in King Court** — it's collected on
  the Setup screen (for the organiser's own reference when manually
  seeding) but doesn't factor into seeding suggestions, A–E assignment, or
  movement.
- **No mid-cycle manual court moves** — the organiser can freely re-seed
  before Cycle 1, and override any player's destination court on the
  Movement Preview screen before confirming, but there's no way to pull a
  player onto a different court in the middle of an in-progress cycle
  (e.g. after Game 2) without a full Reset King Court.
- **No in-court slot reordering during seeding** — Court Seeding lets you
  move a player to a different court, but not reorder players within a
  court, since A–E assignment is chosen automatically from partner history
  rather than from seeding order.
- Manual tiebreak ordering applies for that cycle's movement only — it
  isn't remembered as a standing preference for future ties between the
  same two players.
- Removing/editing players isn't possible once Cycle 1 has started (the
  whole roster locks) — use Reset King Court to start over with a
  different roster.



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

- **Setup screen** — the app's starting point every time: choose Singles
  or **Doubles** (the default), a Play Mode (and Tournament Format, or
  Social Scoring, whichever applies), Doubles Setup if applicable (Add
  Player/Rotating Players, or Add Team/Fixed Teams), the number of
  courts, and add players or teams (with an optional rating).
- **Start Matches** — once setup is valid, generates the schedule (Round 1
  only for Tournament Mode's Leaderboard format; the full planned schedule
  in Social Play — see "Round count and pre-generated rounds" above; the
  full pool-stage schedule for Pools & Knockout — see "Pools & Knockout"
  above) and unlocks the middle and results tabs.
- **Rounds tab** (Leaderboard/Social Play) — **Current Round** (each
  court's match, with score entry unless Social Play's "No Scoring" is
  active, plus who's on a bye) and **All Rounds** (the full round-by-round
  schedule, each marked Completed, Current, or Upcoming). See "The Rounds
  tab" below. Pools & Knockout has its own **Tournament** tab instead —
  see "Pools & Knockout" above.
- **Leaderboard** (Tournament Mode's Leaderboard format), **Player Stats**
  (Social Play), or **Final Results** (Pools & Knockout) — see
  "Difference between Leaderboard and Player Stats" below and "Pools &
  Knockout" above.
- Everything is saved to your browser's `localStorage`, so it survives a
  page refresh.
- **5-Player King Court Mode** — a structurally separate ladder format
  with its own **Setup** (including **Court Seeding**), **King Court**,
  **Standings**, and **Cycle History** tabs — see "5-Player King Court
  Mode" below for the full write-up.

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
- Match type is Singles or Doubles (and, for Doubles, a Doubles Setup mode
  is selected).
- Number of courts is at least 1.
- There are enough players for the match type (2+ for Singles, 4+ for
  Doubles + Rotating Players, 2+ teams for Doubles + Fixed Teams) — or,
  for Pools & Knockout, *exactly* enough (see "Pools & Knockout" above).
- Every player has a name (rating is always optional) — or, for Doubles +
  Fixed Teams, every team has both player names filled in.

If setup is incomplete, reopening the app always lands you back on Setup.
If you've already started a session, reopening the app takes you straight
back to the Rounds tab (defaulting to Current Round).

This section covers Tournament and Social Play's **Start Matches** flow.
5-Player King Court Mode has its own separate setup, seeding, and
**Start Cycle 1** gating — see "5-Player King Court Mode" below.

## Setup screen

The Setup screen asks for things in this order, since later choices
depend on earlier ones:

1. **Match Type** — Singles or **Doubles** (the default). This is
   deliberately the very first decision: it decides whether a "Doubles
   Setup" choice appears at all (see step 4).
2. **Play Mode** — Tournament Mode or Social Play Mode.
3. **Tournament Format** (Tournament Mode only) — Leaderboard or Pools &
   Knockout, plus Pools & Knockout Setup if that's selected. See "Pools &
   Knockout" above.
4. **Doubles Setup** (Doubles only) — **Add Player** (Rotating Players) or
   **Add Team** (Fixed Teams). See "Doubles: Rotating Players vs. Fixed
   Teams" below — this is the biggest fork in the setup flow.
5. **Number of Courts**.
6. **Player or Team setup** — whichever roster the previous step selected:
   - **Add Player** / **Players** — two columns on desktop, stacked on
     mobile. The player list is directly editable: click into any name or
     rating field and edit it in place — no separate "Edit" button. Each
     row also has its own **Remove** button. **Generate player slots**
     creates several unnamed rows at once (e.g. `12`) to fill in
     afterward, instead of adding players one at a time. **Remove All
     Players** (next to the "Players" heading, once there's at least one)
     asks for confirmation, then clears the entire roster — names,
     ratings, IDs, and unfilled slots — in one action.
   - **Add Team** / **Teams** — same directly-editable-list philosophy,
     one row per fixed team (team name, both player names, rating).
     **Remove All Teams** is the Add Team equivalent of Remove All
     Players.
   - Either way, this only touches the roster itself: Play Mode,
     Tournament Format, Doubles Setup, Social Scoring, Session Timing,
     courts, and match type are left exactly as they were. If a session
     is already in progress, existing rounds keep referring to removed
     players/teams (shown as "Unknown player"/"Unknown team" — see
     "Current limitations" below).
7. **Scoring** and **Session Timing** (Social Play only — see "Social Play
   session timing" above).
8. **Start Matches** — disabled with an explanatory message until setup is
   valid; generates the schedule and switches you to the middle tab. Once
   a session has started, this becomes a **Go to Rounds**/**Go to
   Tournament** shortcut instead, and you can still come back to Setup at
   any time (via the tab bar) to add a player/team or tweak settings —
   except **Tournament Format**, which locks once started (Reset unlocks
   it again; **Doubles Setup**, courts, and match type stay editable, same
   as before, though switching Doubles Setup mid-session doesn't rebuild
   an already-generated schedule). In Tournament Mode's Leaderboard
   format, changes there only affect rounds generated *after* the change,
   same as before. In Social Play, the full schedule is already
   generated, so settings changes don't retroactively rewrite it — they
   only apply if you later generate an extra round beyond the plan. Pools
   & Knockout's pool schedule is likewise fixed once generated.

## Doubles: Rotating Players vs. Fixed Teams

When Match Type is Doubles, **Doubles Setup** picks one of two ways
partners are decided — internally, this is the `doublesPairingMode`
setting (`rotating-players` or `fixed-teams`):

- **Add Player** (Rotating Players) — the original behaviour, and the
  default. Partners *and* opponents are re-formed every round for fair
  variety (see "How round generation works" below). Best for Social Play
  where partners rotate.
- **Add Team** (Fixed Teams) — partners are pre-declared and stay
  together for the whole tournament/session; only the *opponent* rotates.
  Best for practising with a regular partner, or a doubles tournament
  where pairs are fixed in advance.

### Add Team

Each team has: a name (optional — auto-generated from the two player
names if left blank, e.g. **"Thai / Alex"**), Player 1, Player 2 (both
required), and an optional rating. Like the player list, the team list is
directly editable in place, and **Remove All Teams** clears the whole
roster in one action. Under the hood, adding a team also creates its two
players — Add Team's roster is entirely separate from Add Player's, so
switching between the two never loses either one; whichever mode isn't
currently selected simply isn't shown.

### How Fixed Teams round generation works

Structurally, rotating *which team plays which team* is the same problem
as Singles' player rotation — favour opponents faced the fewest times,
with a fair bye rotation — just with a 2-player Team as the competitor
instead of a lone player. So Fixed Teams reuses the same matchup-avoidance
algorithm described in "How round generation works" below, applied to
teams instead of players, rather than re-forming partnerships every round.

**Byes**: whenever there are more teams than court capacity (1 doubles
court = 2 teams = 4 players), byes go to whole teams first — both players
sit out together, chosen by fewest team byes so far, so no team sits out
twice before every other team has had a turn. If the math ever calls for
only a single leftover player slot rather than a whole team's worth, that
team is recorded as **temporarily split** (one player sits out, the other
still plays) rather than a normal bye — but note: because every fixed
team has exactly 2 players and a court always seats exactly 2 whole teams,
this situation is provably impossible under the app's own validation
rules today. The "split" bookkeeping (`Round.splitTeamIds`) exists and is
documented in code (`createFixedTeamRound` in
[`src/utils/tournament.ts`](src/utils/tournament.ts)) so the behaviour is
correct if that assumption is ever relaxed, but you won't see it triggered
in practice — see "Current limitations" below.

### Tournament Mode

Fixed teams are the competitor: matches are Team A vs. Team B, scores and
wins/losses apply to the team, and the results tab becomes the **Team
Leaderboard** — ranked by wins, then point difference (PF − PA), then
Points For, same tie-break spirit as Pools & Knockout's pool standings.
Match cards (Current Round, All Rounds) show both players' names side by
side (e.g. "Thai & Alex"), same as any other doubles match — see "Current
limitations" for why the *declared team name* doesn't appear there too.

### Social Play Mode

Fixed pairings here are for practice, not competitive ranking — the
results tab becomes **Dedicated Pairing Stats**: the same team-vs-team
rotation and bye rules as Tournament Mode, but rows are shown in
team-creation order rather than ranked, and points/wins only appear if
Social Play's Scoring setting actually tracks them (same rules as regular
Player Stats — see "Difference between Leaderboard and Player Stats"
below).

### Pools & Knockout

Selecting Add Team before switching Tournament Format to Pools & Knockout
uses your declared teams **directly** — team names, pairings, and
ratings all carry through to the pools and the bracket — instead of
Pools & Knockout's usual behaviour of auto-pairing consecutive players
into teams for the tournament (which is what still happens for Singles,
or Doubles + Rotating Players). Team count (not player count) is what
gets validated against the pool configuration in this case.

## Player ratings are optional

A player can be added (one at a time or via generated slots) without a
rating. An unrated player shows as **Unrated** instead of a number. In
Tournament Mode, rating is only used as a tie-breaker for leaderboard
sorting, and only when it's actually set — unrated players sort after
rated players in a tie, never ahead of them.

## The Rounds tab

This section covers Leaderboard and Social Play, which share the same
rotating-round model — Pools & Knockout's equivalent **Tournament** tab
works completely differently; see "Pools & Knockout" above.

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

This covers the results tab for Tournament Mode's Leaderboard format and
for Social Play — Pools & Knockout's results tab is **Final Results**
instead, covered in "Pools & Knockout" above.

- **Leaderboard** (Tournament Mode's Leaderboard format) — ranked. Shows
  rank #, player name, rating, total points, matches played, wins, losses,
  and byes; sorted by total points, then wins, then fewest byes, then
  rating. The top row is highlighted.
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
*"...reset the tournament?"* — "This will clear all players, teams,
rounds, scores, and stats."), then wipes the entire session and returns
you to a blank Setup screen:

- The player list — names, ratings, IDs, generated slots — same as
  **Remove All Players** above.
- The fixed-team list and its embedded players — same as **Remove All
  Teams** above.
- Every setting — Play Mode, Tournament Format, Doubles Setup (Pairing
  Mode), Social Scoring, Pools & Knockout Setup, courts, and match type —
  back to its default, not just left as-is.
- All rounds (planned, current, and completed), the estimated/planned
  round count, and every match result.
- Leaderboard / Player Stats / Team Leaderboard / Dedicated Pairing
  Stats, since those are always computed from the current
  players/teams and rounds — once those are cleared, there's nothing
  left to show.
- For Pools & Knockout specifically: every team, pool, pool match, pool
  leaderboard, the knockout bracket, and every final placement — these
  live in a completely separate part of `localStorage` from
  rounds/players, but the same reset clears them too.

**5-Player King Court Mode** has its own separate reset — see "Resetting
King Court" under "5-Player King Court Mode" above — since it doesn't use
rounds/players in the same shape as Tournament/Social Play (though it
does share and also clear the same player roster).

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
  teams, Team A vs Team B, either re-formed every round (**Rotating
  Players**) or fixed for the whole tournament/session (**Fixed Teams**)
  — see "Doubles: Rotating Players vs. Fixed Teams" above.

The number of courts times the players-per-court determines how many
players can play each round — e.g. 3 courts in Singles fits 6 players per
round, 3 courts in Doubles fits 12 players per round (or, for Fixed
Teams, 3 courts fits 6 teams). Any players/teams beyond that (or left
over because they don't fill a complete court) sit out on a **bye** for
the round.

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
- Singles requires at least 2 players; Doubles + Rotating Players requires
  at least 4; Doubles + Fixed Teams requires at least 2 teams, each with
  both player names filled in (team name and rating are optional).
- Every player needs a name (rating is optional — leave it blank).
- If a rating is entered, it must be a valid, non-negative number.
- Match scores must be valid, non-negative numbers, whenever scoring is
  enabled for the current mode. In Social Play's "No Scoring", no score
  entry is required or possible.
- In Social Play Mode, Session Timing must also be valid: session time
  greater than 0, game time between 8 and 12 minutes, buffer time 0 or
  greater, and the resulting estimated round count at least 1.
- In Pools & Knockout: number of pools at least 1; teams per pool at least
  2; times each team plays each other at least 1; teams advancing per pool
  at least 1 and no more than teams per pool; at least 2 teams total
  advancing to knockout; and — for Singles or Doubles + Rotating Players —
  the player count must exactly match `pools × teams per pool × players
  per team`, or — for Doubles + Fixed Teams — the declared team count must
  exactly match `pools × teams per pool`. Not just "enough" either way.
- **Start Matches** is disabled, with a message explaining why, until all
  of the above are satisfied. In Social Play, this also means the session
  timing must produce at least 1 estimated round — a session too short for
  even one round block won't start.
- **Next Round** is disabled in Tournament Mode's Leaderboard format until
  every match in the current round has a saved score. Social Play never
  requires this.
- **Advance to Knockout** (Pools & Knockout) is disabled until every match
  in every pool has a score. Knockout match scores can't be tied — a
  winner is required to advance the bracket.
- **Reset Social Play** / **Reset Tournament** and **Remove All Players**
  each ask for confirmation before clearing anything — see "Resetting a
  session" and "Setup screen" above.
- **5-Player King Court Mode** (see its own section above for details):
  number of courts at least 1; total players must exactly equal
  `courts × 5`; every player needs a name; every player must be assigned
  to a court, and every court must have exactly 5 players, before Cycle 1
  can start. **Reset King Court** also asks for confirmation.

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
- **Doubles + Fixed Teams** specifically:
  - Match cards (Current Round, All Rounds, the Bye list) show both
    players' names (e.g. "Thai & Alex"), not the declared team name (e.g.
    "The Smashers") — those views work directly off player names and
    weren't changed to also look up team names. The Team
    Leaderboard/Dedicated Pairing Stats view does show team names.
  - The single-player "split team" bye case (see "Doubles: Rotating
    Players vs. Fixed Teams" above) is implemented and documented but
    provably never triggers given the current validation rules (every
    team always has exactly 2 players).
  - There's no way to edit a team's pairing after matches have started
    other than a full **Reset Tournament**/**Reset Social Play**.
- **Pools & Knockout** specifically:
  - Pool assignment is automatic and even only (consecutive chunks into
    Pool A, Pool B, ...) — no manual assignment and no support for uneven
    pool sizes yet. Team count must exactly match `pools × teams per pool`.
  - For Singles or Doubles + Rotating Players, teams are just consecutive
    pairs from the player list, auto-formed for that tournament only — use
    Doubles + Fixed Teams (Add Team) if you want to declare pairings
    yourself; those carry through to pools and the bracket directly.
  - Pool matches are assigned a court number by cycling 1..courts, but
    aren't scheduled into synchronised "rounds" across courts the way
    Leaderboard/Social rounds are — every pool match is just independently
    scoreable at any time, so there's no live view of "what's being played
    on Court 2 right now" across pools.
  - The head-to-head pool tie-break is a pairwise check between the two
    teams being compared; a 3-way cyclic tie isn't specially unwound and
    falls through to the next rule (Points For, then original order).
  - No 3rd Place Match is created if a semifinal itself was a bye (that
    team never had a real opponent to send there) — only comes up with a
    small number of qualified teams.
  - Once **Start Matches** is clicked, the whole pool schedule and, later,
    the bracket are fixed — there's no way to regenerate either without a
    full **Reset Tournament**.
- **5-Player King Court Mode** — see "Current limitations (King
  Court-specific)" under "5-Player King Court Mode" above; it has its own
  separate list (A–E assignment's mathematical limits, no rating-based
  seeding, no mid-cycle manual court moves, roster locks once Cycle 1
  starts, and more).

## Future features

- Rating-aware pairing (balance skill level across courts).
- Editing/regenerating rounds.
- Exporting session results.
- Pools & Knockout: manual/drag-and-drop pool assignment, uneven pool
  sizes, rating-aware seeding, and a proper graphical bracket view.
- Doubles + Fixed Teams: show declared team names (not just player names)
  in match cards and the bye list; edit a pairing without a full reset.
- Configurable tournament rules beyond courts/match type.
- 5-Player King Court Mode: rating-aware court seeding suggestions,
  mid-cycle manual court moves, drag-and-drop Court Seeding, remembering
  manual tiebreak preferences, and support for court sizes other than 5.

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
  types.ts                  Shared TypeScript interfaces (Player, Match, Round, PlayMode,
                             SessionTiming, Team, DoublesPairingMode, Pool,
                             KnockoutBracket, TeamStats, King Court's
                             KingCourtCycle/KingCourtGame/KingCourtStanding/
                             KingCourtMovement/... ...)
  utils/tournament.ts       Pure logic: pairing, bye rotation, validation, stats, mode
                             helpers, session timing (Leaderboard/Social Play — both
                             Rotating Players and, via createFixedTeamRound/
                             computeTeamStats, Fixed Teams)
  utils/poolsKnockout.ts    Pure logic: team formation, pool assignment, round-robin
                             match generation, pool standings/tie-breaks, knockout
                             seeding/byes/bracket progression (Pools & Knockout)
  utils/kingCourt.ts        Pure logic: the 5-game rotation, A-E assignment, game/cycle
                             scoring, standings + ties, movement preview, and the next
                             cycle's court assignments (5-Player King Court Mode)
  hooks/                    useLocalStorage, usePlayers, useTeams (Add Team roster —
                             see RosterSetup), useTournament (Leaderboard/Social Play
                             state), usePoolsKnockout (Pools & Knockout state),
                             useKingCourt (King Court state) — all persisted to
                             localStorage
  components/                PlayerForm, PlayerList, TeamForm, TeamList, RosterSetup
                             (picks between the two), TournamentSetup,
                             SocialSessionSetup, RoundsPage, CurrentRoundView,
                             AllRoundsView, ByeList, Leaderboard, PlayerStats,
                             FixedTeamResults, PickleballLogo (Leaderboard/Social
                             Play); PoolsKnockoutPage, PoolStageView, PoolLeaderboard,
                             KnockoutBracketView, FinalResults (Pools & Knockout);
                             KingCourtSetup, CourtSeeding, KingCourtView,
                             KingCourtGameCard, KingCourtStandings,
                             KingCourtMovementPreview, KingCourtCycleHistory (King
                             Court — reuses PlayerForm/PlayerList directly for its
                             roster rather than duplicating them)
  App.tsx                   Setup / middle-tab / results views, tab gating, and layout
                             — routes between the Leaderboard/Social Play components,
                             the Pools & Knockout ones, and the King Court ones
                             depending on settings.playMode
```

Business logic lives in `src/utils` and `src/hooks`, separate from the
components in `src/components`, so the pairing/scoring rules can evolve
later without rewriting the UI. Pools & Knockout and King Court are both
self-contained additions alongside the original Leaderboard/Social Play
code (each with its own utils file, its own hook, its own components, its
own `localStorage` keys) rather than a rewrite of it — King Court shares
only the `Player` type and `usePlayers` roster (and UI/CSS building
blocks) with the rest of the app; everything else about it (settings,
state, logic) is independent.

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
