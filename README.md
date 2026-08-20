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
- **Social Play Mode** — casual, with a **Social Format** choice of its
  own (see below):
  - **Standard Social Play** — the original behaviour: same fair rotation
    and pairing engine as Tournament Mode (see "How round generation
    works" below), but ranking is de-emphasised — results are shown as
    **Player Stats** instead of a leaderboard, players are listed in
    roster order rather than ranked, and you can move to the next round
    at any time. Has its own **Scoring** setting (see below).
  - **Dynamic Pairing Social** — a doubles-only, ranking-driven
    competitive social format: grading rounds establish a baseline
    ranking, then every round after that re-ranks players from their
    results and rebuilds courts/partners/opponents to keep matches
    competitive. See "Dynamic Pairing Social" below for the full
    write-up — it's substantial enough to warrant its own section, and
    structurally separate from Standard Social Play (own roster, own
    rounds, own `localStorage` keys).
  - **5-Player King Court** — shown here as a third Social Format for
    discoverability, but structurally its own thing — see below.

Standard Social Play and Tournament Mode use exactly the same fairness
rules for who plays, who sits out, and who gets matched against whom —
the difference is entirely in whether/how scores and rankings are tracked
and displayed. Dynamic Pairing Social and King Court each have their own
separate rules instead (see their own sections).

**5-Player King Court Mode** is structurally separate from everything
above — it doesn't use rounds, byes, or the matchup-avoidance engine
described here at all. Internally it's still its own `playMode` value
(`king-court-5`), not actually nested under `'social'` — selecting it from
the Social Format toggle just sets that value directly, so every
King-Court-specific behaviour described in "5-Player King Court Mode"
below is completely unaffected by where it sits in the Setup UI. See that
section for its own complete write-up.

### Tournament Mode formats: Leaderboard vs. Pools & Knockout

When Tournament Mode is selected, a **Tournament Format** choice appears:

- **Leaderboard** — the tournament behaviour described above: rotating
  rounds, ranked by total points, wins, losses, point differential, and
  byes. This format also has a **Pairing Style** choice (Balanced /
  Leaderboard-based / Random — see "Pairing Styles" below) and supports a
  mixed Doubles roster of individual players and fixed teams at the same
  time (see "Doubles: individual players, fixed teams, and mixed rosters"
  below).
- **Pools & Knockout** — a structurally different, two-stage format: fixed
  **Teams** (one player each in Singles, two in Doubles) play a
  round-robin **Pool Stage**, then the top teams from each pool cross into
  a single-elimination **Knockout Stage** bracket. See "Pools & Knockout"
  below for the full breakdown — it's substantial enough to warrant its
  own section.

### Pairing Styles (Leaderboard format only)

When Tournament Mode + Leaderboard format is selected, a **Pairing Style**
choice appears on Setup, controlling how each new round's matchups are
decided (bye rotation itself — who sits out — is unaffected by this
choice; only "who plays whom" changes):

- **Balanced** (the default) — the original behaviour: favour opponents
  and partners faced the fewest times so far, with a light nudge toward
  similar rating/current performance when there's a choice between
  otherwise-equally-fresh matchups. This is the same algorithm Social Play
  always uses (Social Play doesn't show this selector — it's Leaderboard
  format only).
- **Leaderboard-based** — pairs competitors with similar current ranking:
  1st vs. 2nd, 3rd vs. 4th, 5th vs. 6th, and so on. For rotating Doubles
  (individual players, no fixed team), ranking instead guides *team
  formation* — the strongest player is paired with the weakest as
  partners, and so on down the ranking, so temporary teams come out
  roughly balanced in strength rather than pitting the two best players
  against each other every round.
- **Random** — shuffles the field and pairs sequentially, still respecting
  court capacity and bye fairness. A lightweight safeguard swaps a
  matchup with its neighbour if it would otherwise exactly repeat the
  immediately preceding round's matchup — but unlike Balanced, this style
  doesn't search for a repeat-minimal arrangement across the whole round.

See `src/utils/pairing.ts` for the implementation — `pairUnitsByStyle`
(and `formPartnersByStyle` for the rotating-Doubles partner-forming step)
is the shared dispatcher every match type/roster shape routes through.

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

## Dynamic Pairing Social

A **Social Format** (Social Play Mode → Dynamic Pairing Social — see
above), not a Tournament Mode format: this is deliberately a *social*
competition, with the same "you can move on whenever you're ready" spirit
as Standard Social Play, just with a much more active pairing engine
behind it. **Doubles only** for this version — each active court seats 4
players — and structurally entirely separate from the rest of the app: its
own player roster, its own settings, its own round history, its own
`localStorage` keys (`pickleball-tourney:dp:*`), and its own logic file
(`src/utils/dynamicPairingSocial.ts`). It can't affect, and isn't affected
by, Standard Social Play, Tournament Mode, or King Court.

The goal: make matches progressively more competitive and balanced
through the session. A handful of **grading rounds** — all pre-generated
together at session start (see "Grading rounds are pre-generated up
front" below) — shuffle players at random to get real match data on the
board before anyone's ranked, then hand off to **Admin Skill Review**
(see below) for what the organiser can do once grading ends; every round
after that re-ranks players from their actual results so far, and
rebuilds courts, partners, and opponents around that ranking.

### Two independent systems: ranking and rest

This is the core design idea, and it's enforced structurally (they're
computed by separate functions that don't call each other):

- **Ranking** decides how competitive a court is — who's strong enough to
  play on Court 1 versus Court 6. It's entirely driven by game results
  (see "Ranking metrics" below).
- **Rest** decides who sits out this round. It's entirely driven by rest
  history — whoever has rested the fewest times so far, tie-broken by
  who's played the most rounds in a row without a break. A player's
  ranking — whether they're winning every game or losing every game — has
  **no influence** on how often they rest.

### Setup

Selecting Dynamic Pairing Social replaces the usual roster/court setup
with its own card:

- **Session name** — a free-text label (e.g. "Saturday Morning Social"),
  shown as the heading on the Session History tab.
- **Number of Courts** — the same clickable 1–6 + Other court selector
  used everywhere else in the app.
- **Players** — its own dedicated roster (separate from every other
  mode's), each with a name, an optional rating, and an optional
  **starting seed** (1 = strongest), used only as a ranking tiebreaker —
  grading rounds are randomized regardless of seed (see "Grading rounds
  are pre-generated up front" below). Once grading finishes, a **skill
  level** (also 1 = strongest) becomes assignable per player too — see
  "Admin Skill Review" below.
- **Grading rounds** — how many of the first rounds are grading rounds.
  Default: **3**.
- **Game format** — **Timed Round** (with a game duration in minutes) or
  **First to Score** (with a winning score) — for the organiser's
  reference; this version doesn't enforce either automatically (same
  "planning aid, not a live clock" spirit as Social Play's Session
  Timing).
- **Maximum court movement per round** — **Unrestricted**, **Max 1
  Court**, or **Max 2 Courts** (default: Max 1 Court) — see "Court
  movement limit" below.
- **Score confirmation** and **Manual overrides** — both shown as
  disabled placeholders for a future version; scores are final as entered
  for now, same as everywhere else in the app.

### Recommended setup and court capacity

Recommended starting point: **6 courts**, aiming for **24–30 players**
in attendance (24 active on court at once, the rest resting in fair
rotation).

Dynamic Pairing Social doesn't require the player count to be an exact
multiple of 4 — courts used and active players are calculated every
round from however many players are actually available:

```
Courts Used   = min(Available Courts, floor(Available Players / 4))
Active Players = Courts Used × 4
Resting Players = Available Players − Active Players
```

| Available players | Courts | Courts used | Active | Resting |
| ------------------ | ------ | ------------ | ------ | ------- |
| 24 | 6 | 6 | 24 | 0 |
| 25 | 6 | 6 | 24 | 1 |
| 27 | 6 | 6 | 24 | 3 |
| 30 | 6 | 6 | 24 | 6 |
| 22 | 6 | 5 | 20 | 2 (1 court unused) |
| 19 | 6 | 4 | 16 | 3 (2 courts unused) |

At least 4 available players are required to generate one match — with
fewer than that, **Start Matches**/**Generate Next Round** is disabled
with a clear message. See `calculateActiveCapacity`/`calculateCourtsUsed`
in `src/utils/dynamicPairingSocial.ts`.

### Court numbering is the reverse of King Court

**Court 1 is the strongest/highest court, Court 6 (or whichever is
highest) is the weakest** — the opposite convention from 5-Player King
Court Mode, where a *higher* court number can be the stronger one. Don't
mix the two up if you run both formats at the same venue.

### Grading rounds are pre-generated up front

The first N rounds (the **Grading rounds** setting, default 3) are
grading rounds, badged **Random Grading** on the Current Round/All Rounds
views. All N of them are generated together the moment you click **Start
Matches** — not one at a time — so the organiser can see the entire
planned grading schedule immediately under **All Rounds**, before a single
point has been played. See `generateInitialGradingRounds` in
`src/utils/dynamicPairingSocial.ts`.

Only Round 1 starts out playable (status **Current**); Rounds 2 and 3
start out **Upcoming** — their courts, partnerships, and resting players
are already decided (using the same rest/partner/opponent-variety rules
as always, projected across the whole batch — see "Rest management" and
"Court allocation and balanced partnerships" below), but score entry stays
locked to whichever round is currently **Current**. Completing a round's
scores and advancing (via the button on Current Round) flips the next
pre-generated round from Upcoming to Current — no new generation happens
until Round 4.

During every grading round:

- Courts and partnerships are assigned **at random** — not by starting
  seed, rating, or results — since there isn't enough game data yet to
  rank meaningfully, and skill levels aren't assignable yet either (see
  "Admin Skill Review" below).
- Every score is still recorded, and rests/partners/opponents are still
  tracked and rotated fairly — grading rounds are real matches, not
  throwaway ones.

Once all grading rounds are scored, the app hands off to **Admin Skill
Review** (see below) instead of immediately generating a next round; every
round from there on is badged **Dynamic Pairing** and uses the actual
calculated ranking to build courts and partnerships.

### Admin Skill Review

The moment the last grading round's scores are saved, **Current Round**
is replaced by an **Admin Skill Review** screen — a one-time checkpoint
between random grading and dynamic pairing. It's a derived state, not a
stored flag (see `isAwaitingSkillReview`), so refreshing mid-review lands
back here correctly with no extra bookkeeping.

The screen lists every player with their grading-round win/loss record,
plus a **skill level** input (1 = strongest) the organiser can optionally
fill in *after* actually watching players compete, rather than guessing
blind before a single point was played. Skill level is the same field
also editable from the Players list on the Setup tab once grading is
done (handy for adjusting it later); setting a value is entirely
optional — clicking **Confirm & Start Round N** works with any mix of
filled-in and blank skill levels, and that click is what generates the
first Dynamic Pairing round. **Round 4 (or whatever the next round number
is) cannot be generated any other way** — reaching and confirming this
screen is the one mandatory gate, even though the values themselves
aren't.

Skill level itself is purely a ranking **tiebreaker** — see step 5 in
"Ranking metrics" below. Actual results (win %, point differential,
points scored, head-to-head) always decide ranking first; skill level
only breaks ties between players, which is common right after grading
(small, often-equal win/loss records) and matters progressively less as
more games differentiate players. Unset players simply fall through to
the next tiebreaker (starting seed). See `sortPlayersByRanking` in
`src/utils/dynamicPairingSocial.ts`.

### Ranking metrics

Rankings use **per-game rates**, not raw totals, since rest means players
can end up with different numbers of games played. For each player:

- Games played, wins, losses, Points For (PF), Points Against (PA), point
  differential (PF − PA)
- **Win %** = wins ÷ games played
- **Average point differential** = total point differential ÷ games played
- **Average points scored** = total PF ÷ games played

All three rates default safely to `0` when games played is `0` — no
divide-by-zero. Ranking priority, applied in order:

1. Win %
2. Average point differential
3. Average points scored
4. Head-to-head result (only when the two tied players have actually
   played each other)
5. Skill level (only assignable once grading finishes — see "Admin Skill
   Review" above)
6. Starting seed
7. Previous rank (a stabiliser, so statistically-identical players don't
   flip-flop rank every round)
8. A **deterministic** tiebreaker (not `Math.random()` — it's a stable
   hash of the two player ids, so the Rankings table doesn't visibly
   reshuffle itself on every re-render for players who are still tied
   after everything else)

See `calculatePlayerRankings`/`sortPlayersByRanking` in
`src/utils/dynamicPairingSocial.ts`.

### Rest management

Rest counts are **global across the whole session** — they don't reset
when a player changes courts, and ranking has no influence on who rests
(see "Two independent systems" above). A resting player gets no win,
loss, points, or point differential that round; their existing stats are
otherwise untouched. Fair-rest selection, in order:

1. Fewest total rests so far.
2. Among those tied, whoever has played the most consecutive rounds in a
   row (they're "due").
3. Prefer someone who didn't rest last round, where possible.
4. A deterministic tiebreaker (same stable-hash approach as ranking).

Because rule 1 is reapplied fresh every round, the gap between the
most- and least-rested player never exceeds 1 — no separate enforcement
needed. See `selectRestingPlayers` in `src/utils/dynamicPairingSocial.ts`.

### Court allocation and balanced partnerships

Each round, after resting players are removed:

1. The remaining active players are sorted by current ranking.
2. They're split into consecutive groups of 4 — Court 1 gets ranks 1–4,
   Court 2 gets ranks 5–8, and so on down to the lowest active court.
3. Each group of 4 is split into balanced teams — by default the
   strongest plus the weakest of the four versus the middle two (e.g.
   rank 1 + rank 4 vs. rank 2 + rank 3), which is the most balanced
   possible split of a ranked quad.
4. If that split would repeat the previous round's partnership (or has a
   worse cumulative partner/opponent-repeat count), the app tries the
   other reasonable split — rank 1 + rank 3 vs. rank 2 + rank 4 — instead,
   as long as it doesn't sacrifice balance. Competitive balance always
   takes priority over variety when the two conflict.

Court groups are rebuilt from scratch every round — nothing about a
court's *group of 4* carries over, only each individual player's ranking
and rest history. See `allocatePlayersToCourts`/`createBalancedPartnerships`
in `src/utils/dynamicPairingSocial.ts`.

### Court movement limit

The **Maximum court movement per round** setting (Unrestricted / Max 1
Court / Max 2 Courts, default Max 1 Court) only applies once ranking
rounds start (grading rounds always allocate at random). It caps
how far a player's court can move from wherever they played last, so one
unusually big win or loss doesn't swing them several courts in one round
— rankings still correct themselves over time, just gradually. The
resolution when several players get clamped toward the same court is a
simple nearest-available-court search, not a globally optimal
re-assignment — see `applyCourtMovementLimit` in
`src/utils/dynamicPairingSocial.ts` and "Current limitations" below.

### Score entry and round processing

Each court gets a Team 1 / Team 2 score; the higher score wins (tied
scores are rejected — a winner is required). On save:

- Both winning players get **+1 win**, **PF += their score**,
  **PA += the opponent's score**, **point differential += the margin**.
- Both losing players get **+1 loss**, the same PF/PA tracking, and
  **point differential −= the margin**.

A round can't advance (**Generate Next Round** stays disabled) until
every court in it has a score. Once you do generate the next round, the
previous one **locks read-only** — its score inputs disable and it can
only be viewed, not edited, from All Rounds.

### Dynamic Pairing Social's own tabs

Once a session has started, the tab bar becomes **Rounds** / **Rankings**
/ **Resting Players** / **Session History** (instead of the usual
Rounds/Leaderboard pair):

- **Rounds** — the familiar **Current Round** / **All Rounds** toggle.
  Current Round shows the round number, a Random Grading/Dynamic Pairing
  phase badge, every court's Team 1 vs. Team 2 with score entry, who's
  resting, and a button to advance (its label adapts — "Continue to Round
  N" while activating a pre-generated grading round, "Continue to Admin
  Skill Review" after the last one, "Generate Next Round" from Round 4
  on). All Rounds is the read-only history, same spirit as the standard
  modes' All Rounds — but for Dynamic Pairing Social, it shows all 3 (or
  however many `gradingRounds` is set to) grading rounds immediately after
  Start Matches, including the ones that haven't been played yet (badged
  **Upcoming**, matchups visible, no scores). Once grading finishes,
  Current Round is temporarily replaced by **Admin Skill Review** — see
  above — until the organiser confirms it.
- **Rankings** — every field from "Ranking metrics" above, recalculated
  live as scores come in (including the still-open current round's
  already-entered scores), sorted by rank. Only counts rounds that have
  actually been played — pre-generated-but-Upcoming grading rounds are
  excluded until they're reached, so they can't inflate anyone's record
  early (see `playedDynamicPairingRounds`).
- **Resting Players** — total rests, last round rested, consecutive
  rounds played, and availability status per player — a fairness audit
  view, deliberately *not* sorted by ranking. Same Upcoming-round
  exclusion as Rankings above.
- **Session History** — the session's settings recap plus a compact
  round-by-round summary (courts, scored/total, resting count).

### Player availability

Each player has an **availability status**: **Available**, **Late**,
**Withdrawn**, or **Injured** (editable from the player row's dropdown on
Setup). Only **Available** players are considered for court/rest
selection — Withdrawn/Injured players are excluded from every future
round entirely. Existing rest counts are never reset just because
availability changes. (A `'resting'` status value also exists in the data
model for a player *currently* sitting out, but it's derived per round
from `restingPlayerIds` rather than something you set manually — the
dropdown only offers the four statuses above.) Handling a **Late**
arrival mid-round (e.g. holding them out of just their first round back)
is a placeholder for a future version — for now, marking someone Late
simply excludes them until you switch them back to Available.

### Resetting Dynamic Pairing Social

**Reset Dynamic Pairing Social** (shown instead of Reset Social
Play/Reset Tournament while this format is active) asks for confirmation,
then clears its player roster, settings, every round/score, and — since
rankings/rest history/partner history/opponent history are all derived
from `players` + `rounds` rather than stored separately (see "Two
independent systems" above and the rest of this section) — clearing
`rounds` clears all of those too. Like every other reset in this app,
it's a full wipe, not a "new round, same roster" reset.

### Current limitations (Dynamic Pairing Social-specific)

- **Doubles only** — there's no Singles option for this format yet.
- **Court movement limiting is a simple nearest-available-court search**,
  not a globally optimal re-assignment — see "Court movement limit"
  above. Good enough to keep movement gradual, not guaranteed-minimal.
- **Partnership variety only considers two splits** of each ranked group
  of 4 (1st+4th vs. 2nd+3rd, or 1st+3rd vs. 2nd+4th) — 1st+2nd vs. 3rd+4th
  is deliberately never used, since it's the least balanced possible
  split.
- **Score confirmation and manual overrides are placeholders** — scores
  are final as entered, and there's no way to manually edit a generated
  court/partnership yet.
- **No live game clock** for Timed Round game format — same "planning
  aid, not an enforced timer" limitation as Social Play's Session Timing.
- **Late arrivals** are all-or-nothing (Available or not) — there's no
  "hold out for just their first round back" flow yet.
- Ranking recomputes from full round history every time it's needed
  (O(rounds²) in the number of rounds played) — negligible for realistic
  session lengths, but not optimised for very long-running sessions.

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
  involved. See "Pools & Knockout keeps its own Doubles Setup toggle"
  below for how to set this up.

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

## Dynamic Team Qualifier

A third **Tournament Format**, alongside Leaderboard and Pools & Knockout.
Unlike Pools & Knockout's fixed pools, Dynamic Team Qualifier runs a
*dynamic* — results-based, not fixed-pool — qualifying stage: fixed
doubles teams play a fair rest rotation across a set number of qualifying
rounds, then the top 4 teams face off in a small Semis/Gold/Bronze medal
bracket. It's a completely separate data model from both Leaderboard and
Pools & Knockout (own roster, own settings, own rounds, own `localStorage`
keys, own logic file `utils/dynamicTeamQualifier.ts` and hook
`useDynamicTeamQualifier.ts`) — selecting it doesn't affect any other mode.

**Fixed-partner doubles only**: a *team* (two players, registered
together) is the ranking and pairing unit throughout — there's no
individual-player roster to fall back on, and partner changes lock once a
team has played its first completed match (emergency substitution with an
audit trail is a future placeholder — see "Current limitations" below).

### Setup

The **Dynamic Team Qualifier Setup** card configures: division/tournament
name, number of courts (the same clickable court-count picker used
everywhere else), a number-of-teams planning target, qualifying rounds,
game duration, result/movement buffer, and medal bracket scoring (first
to/win by/hard cap — only **Top 4** bracket size is supported in this
version). Every randomised decision in this mode (rest schedule
shuffling, Round 1-2 pairing, tiebreak ordering) is driven deterministically
by an internal random seed — the same seed always reproduces the same
schedule — but the seed's raw numeric value isn't shown or meant to be
read; see "Rest schedule preview" below for the actual, tangible way to
see (and reroll) what it produces.

Defaults mirror the reference scenario: **18 teams / 6 courts / 9
qualifying rounds**, which works out to each team playing **6 qualifying
games and resting 3 rounds**. The number-of-teams field is a planning
target only — the actual schedule is always generated from however many
teams are checked in and non-withdrawn when qualifying starts, spreading
rest quotas as evenly as possible (`floor`/`ceil` of the total rest slots
divided across the roster) for any other team count too.

### Team registration and check-in

The **Teams** card (combined registration + check-in, since there's
nothing to structurally distinguish "still registering" from "checking
teams in" before Round 1 starts) lets you add teams — two player names,
optional rating/DUPR, optional seed — and mark each as **Checked in**. A
team's display name is always derived from its two player names (e.g.
"Thai / Alex") rather than collected separately. **Or generate multiple
team slots** quickly creates several blank teams (e.g. "T05 Player 1"/"T05
Player 2") to fill in afterward, instead of adding one at a time. Team
codes (T01, T02, ...) are assigned automatically in registration order.
Only checked-in, non-withdrawn teams are counted and scheduled; **Start
Qualifying** stays disabled until at least 4 are checked in with both
player names filled in, with a clear validation message explaining why.
**Withdraw** is shown on each team row but disabled ("Coming later") —
see "Current limitations" below.

### Rest schedule preview

Once at least 4 teams are checked in, a **Rest Schedule Preview** card
shows exactly what **Start Qualifying** would produce right now: Round 1's
real court-by-court matchups (that round's pairing doesn't depend on any
results, so it's fully knowable ahead of time) plus every later round's
resting teams from the rest schedule. It's a genuine dry run — the same
`lockRosterAndStartQualifying` function Start Qualifying itself calls, just
not committed to state — so what you see here is exactly what you'll get.
**Shuffle Preview** rerolls the underlying random seed and recomputes it,
so you can see the actual matchups/rest lists change and keep trying until
you're happy, with nothing committed until you click **Start Qualifying**.

### Rest schedule

Clicking **Start Qualifying** locks the checked-in roster and generates
the *entire* qualifying-stage rest schedule up front, before Round 1
starts — every round's resting teams are decided all at once, not round
by round, so All Rounds can show the whole plan immediately (see "All
Rounds view" below). The schedule is validated against a set of fairness
invariants before the tournament is allowed to start:

- Every team's total rests are within 1 of every other team's (exactly
  equal when the numbers divide evenly, e.g. exactly 3 each for the
  18-team/6-court/9-round default).
- Every round has exactly the right number of resting teams (team count
  minus 2× courts used).
- No team rests in consecutive rounds.

Team strength never factors into rest selection — only how many times a
team has rested so far (fewest first) and whether it rested last round
(never twice in a row). If the generated schedule somehow fails
validation, qualifying doesn't start; a clear error is shown along with a
**Regenerate Rest Schedule & Retry** option, which rolls a fresh random
seed and tries again.

### Qualifying rounds and pairing

Round 1's pairings are generated immediately at start (seeded-random, since
there's no result data yet to pair on); Rounds 2 onward are generated one
at a time as each previous round is closed, since their pairing depends on
standings that don't exist until that point. **Rounds 1-2** use
seeded-random pairing; **Round 3 onward** orders active teams by
provisional standing and pairs the closest-performing teams that haven't
already played — a **hard rule, never relaxed**: no two teams face each
other twice during qualifying. The pairing algorithm is a readable greedy
matcher (walk the ranked list, pair each team with the nearest team it
hasn't played), retried with reshuffled ordering a bounded number of
times; if that still can't find a valid pairing, a simple **rest-slot
repair** is attempted (swap one resting team in for one scheduled-to-play
team and try again) before giving up and blocking round publication with
a clear warning — never silently creating a repeat matchup. A true
minimum-cost matching algorithm (e.g. the blossom algorithm) could replace
the greedy matcher for a more globally optimal pairing in a future
version — see the comments in `utils/dynamicTeamQualifier.ts`.

**Court allocation**: once pairs are formed, Court 1 always gets the
strongest available matchup (lowest combined standing rank), Court 2 the
next, and so on — the court number itself never awards ranking points.

**Scoring**: qualifying matches are timed (8-minute games by default), no
draws allowed — if a game is tied at time, the organiser enters the final
score directly *including* the golden point (e.g. an 8-8 tie that goes to
one more point becomes "9-8"), and ticks the **Golden point** checkbox as
a record-keeping marker. A **Forfeit** checkbox swaps score entry for a
plain winner pick. Every qualifying match's ranking contribution is
capped at **+7 for the winner / -7 for the loser** (the raw score is
still stored untouched — only this derived ranking figure is capped), so
one lopsided blowout can't dominate standings.

### Director Dashboard

Folded into the top of the **Current Round** view (rather than a separate
tab, since its whole job is to summarise and act on exactly that round):
current round number, active courts, missing scores, resting team count,
a live **Current Standings** preview, and the round-progression actions —
**Close Round** (enabled once every match has a result), **Generate Next
Round** (enabled once the round is closed; blocked with a clear warning if
pairing can't be resolved), **View All Rounds**, and — once every
qualifying round is locked — **Generate Medal Bracket**.

### Standings

Teams may have played a different number of games at any given point
(because of scheduled rests), so **Provisional Standings** (shown live
throughout qualifying) rank by **win % first**, not raw wins: win % →
opponent win % (a strength-of-schedule tie-break: the average win % of
every opponent faced so far) → total wins → capped point differential → a
stable deterministic tiebreak. A resting team keeps its ranking position
untouched — no win, loss, points, or differential change for a bye round.

Once every qualifying round is locked, **Final Standings** become
available with a different order, matching a genuine end-of-qualifying
ranking: total wins → opponent win % → **head-to-head** (only when a
*complete* mini round-robin exists among the exact set of tied teams —
e.g. two teams tied on both wins and opponent win % who played each other
directly; a 3+-way tie only uses head-to-head if every pair in the tied
group actually played each other, otherwise it's skipped entirely) →
capped point differential → total points scored → a stable deterministic
tiebreak standing in for a tournament-director draw. Final Standings are
only meaningful once every active team has completed all of its
qualifying games, which the app enforces automatically.

### Medal bracket

Generated from the top 4 Final Standings teams: **Semifinal 1** is Seed 1
vs. Seed 4, **Semifinal 2** is Seed 2 vs. Seed 3 — both playable at once
(independent courts, unlike a normal single-elimination bracket's strictly
sequential "one current match" convention). Once both semifinals are
complete, the winners move to the **Gold Match** and the losers to the
**Bronze Match**. Bracket games are first-to-11, win-by-2, hard cap at 15
by default (configurable in Setup); qualifying scores don't carry into the
bracket, and bracket rematches are allowed (no no-repeat rule here). Once
Gold and Bronze are both scored, **Final Results** shows Champion,
Runner-up, 3rd Place, and 4th Place.

### All Rounds view

The **Rounds** tab has the same **Current Round / All Rounds** toggle as
every other rotating-round mode. All Rounds is read-only (score entry
stays in Current Round) and shows every qualifying round generated so
far — including still-**Upcoming** rounds, whose resting teams are already
known from the rest schedule even before their pairings exist ("Pairings
will be generated after previous round results are locked"). Each round
shows its status (**Upcoming** / **Current** / **Completed** / **Locked**),
court assignments, scores, golden point flags, winners, and resting teams.
Once the medal bracket is generated, it appears as its own trailing
section with the same read-only treatment — Semifinals, Gold Match, Bronze
Match, each with scores, winners, and final placement once complete.

### Resetting

**Reset Dynamic Team Qualifier** clears every team, check-in status, the
rest schedule, every round/pairing/score, standings, the medal bracket,
and audit events.

### Current limitations (Dynamic Team Qualifier-specific)

- Only **Top 4** bracket size is supported — the medal bracket's
  Semifinal/Gold/Bronze shape is hardcoded to exactly 4 teams.
- **Withdraw Team**, injury retirement, late arrival, and a score
  correction workflow are all placeholders in this version — the
  underlying data model supports them (`DynamicTeam.withdrawn`,
  `AuditEvent`, ...), but the UI controls are disabled ("Coming later").
  Pre-tournament roster cleanup is available via **Remove** instead.
- The rest-slot repair (used when a round's pairing would otherwise force
  a repeat matchup) tries the first swap that works, not the swap that
  best preserves rest fairness — a smarter repair could replace this
  later.
- The qualifying pairing algorithm is a readable greedy matcher with
  retries, not a guaranteed-optimal matching — see "Qualifying rounds and
  pairing" above for where a minimum-cost matching algorithm could
  improve on it.
- No import/export — data lives only in the current browser's
  `localStorage`, same as every other mode.

## 5-Player King Court Mode

A third **Play Mode**, structurally separate from Tournament and Social
Play — it has its own data model entirely (courts, cycles, and games, not
rounds/matches), its own `localStorage` keys, its own navigation tabs
(**Setup**, **Rounds**, **Standings**, **Cycle History** — the standard
Leaderboard/Player Stats tab isn't shown), and its own **Reset King
Court** button. Select it from **Play Mode** on the Setup screen.

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
weakest).

Court Seeding uses **click-to-assign** rather than dropdowns: click a
player chip — in the Unassigned list, or already on a court — to select
it (it highlights), then click a court card, or one of its empty slots,
to place them there; clicking the court a player is already on, or the
same chip again, just deselects it. Each court card shows a live
**`X / 5 players`** count and reads visually as **Full** once it has 5.
Every filled slot has its own **×** button to unassign that player back
to Unassigned, and **↑ / ↓** buttons to reorder players within a court —
this affects Cycle 1's A-E letter assignment (see "A–E assignment"
above), since with no partner history yet, A-E order falls back to
exactly this seeding order. **Start Cycle 1** stays disabled until every
player is assigned and every court has exactly 5.

**Court capacity is enforced, not just validated at Start**: trying to
assign a 6th player to a court that already has 5 is blocked outright,
with an inline **"Court full. Each King Court court can only have 5
players."** message — it never silently fails or bumps an existing
player. Before Cycle 1 can start, every unfilled/overfull court is
called out by name (e.g. "Court 2 needs 1 more player"), and any
unassigned player blocks starting with "All players must be assigned to
a court."

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

The **Rounds** tab has its own **Current Round / All Rounds** toggle,
matching the one Tournament/Social Play use on their Rounds tab:

- **Current Round** shows, for the cycle's current game and every court at
  once: court number, team 1, team 2, who's resting, a score input for
  each team, and the winner once both scores are in. **Next Game** (or
  **Finish Cycle** on Game 5) is disabled until every court's current game
  is scored. Score entry only ever happens here. There's no fixed number
  of cycles — the session just keeps generating a new cycle each time
  movement is confirmed, for as long as the host wants to keep playing.
- **All Rounds** is the read-only counterpart: every King Court game
  generated so far, grouped by **Cycle**, each cycle showing Games 1
  through 5 in order. A "round" here is one game within a cycle (e.g.
  "Cycle 1, Game 3") — each game lists every court's matchup (team 1 vs.
  team 2, who's resting), the score and winner once entered, and a status
  badge: **Completed** (an earlier game this cycle), **Current** (the
  game the Current Round view is on), or **Upcoming** (a later game in
  this cycle, not reached yet). Future cycles are never pre-generated —
  Cycle 2 simply appears here, with its own 5 Upcoming games, the moment
  movement off Cycle 1 is confirmed (see "Court movement" above; court
  groups change after each cycle, which is exactly why later cycles can't
  be generated ahead of time).

### Standings and Cycle History tabs

- **Standings** — a **Session Stats** table (every player's cumulative
  wins, losses, point differential, games played, and games rested across
  the whole session, plus their current court, ranked by wins then point
  differential), and a **Cycle N Standings** section below it with each
  court's live current-cycle table (updates as scores come in, even
  mid-cycle).
- **Cycle History** — every *completed* cycle (i.e. one where movement has
  already been confirmed), most recent first, showing each court's final
  rank, record, and which court each player moved to. Read-only. This is
  a different view from Rounds' **All Rounds** above: Cycle History is
  about *final standings and movement* for finished cycles only; All
  Rounds is about the *game-by-game schedule and scores*, including the
  in-progress cycle and its untouched upcoming games.

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

## Mid-session player and court changes

Real-world sessions change mid-stream — someone goes home early, gets
injured, or wants to sit out a round; a court frees up or becomes
unavailable. All three Social Play modes (**Standard Social Play**,
**Dynamic Pairing Social**, **5-Player King Court**) let the organiser
handle this live, without losing a player's completed stats or history.
Tournament Mode doesn't have this — it's Social Play only.

### Player availability

Every player has a status: **Available**, **Resting This Round**, **Left
Early**, **Injured**, or **Unavailable**. Setting anything other than
Available excludes that player from every future round/cycle generated
from that point on — but never deletes them, never touches their
already-completed stats, and never rewrites a round that's already been
played. **Resting This Round** doesn't auto-expire back to Available after
one round; you switch them back explicitly with **Make available** when
they're ready — deliberately simpler and more predictable than a timed
auto-revert, which gets ambiguous fast if no new round happens to get
generated right away.

Standard Social Play and King Court share one status field on the
player roster (**Session Controls** → **Manage Player Availability**, or
King Court's **Manage Courts / Players**); Dynamic Pairing Social has its
own (**Resting Players** tab), since it keeps its own independent player
roster.

### Swapping an active player with a bye player

If someone currently assigned to a match needs to step out — but hasn't
been marked unavailable — you can swap them directly with a player who's
on bye/resting **this round**: pick **Swap Active Player with Bye Player**
(Standard Social Play) or **Swap Active Player with Resting Player**
(Dynamic Pairing Social), choose the two players, and confirm. This only
ever edits the *current* round in place — never a completed or locked one
— and only before that specific match's score has been submitted.

### Changing the number of courts mid-session

**Change Courts** (Standard Social Play's Session Controls, or Dynamic
Pairing Social's Resting Players tab) applies from the *next* round by
default — completed and locked rounds are never touched, and the current
round only changes if you explicitly confirm regenerating it (only
possible while it still has no scores entered). Standard Social Play
regenerates its entire pre-generated **Upcoming** tail against the new
court count and current player pool; Dynamic Pairing Social only ever has
to regenerate the still-upcoming pre-generated grading rounds (Rounds 1-3)
this way — Round 4 onward is already generated one round at a time, so a
court-count change just takes effect the next time you generate a round,
with nothing to regenerate. Either way, a small notice — *"Future rounds
were regenerated due to player/court changes"* — confirms what happened.

### King Court is the most manual of the three, by design

A King Court cycle's 5-game rotation is generated once and never
auto-reshuffled mid-cycle — there's no safe automatic way to splice a live
5-player rotation. If a player becomes unavailable while games remain in
their court's current cycle, **Manage Courts / Players** shows a clear
warning and lets you manually **substitute** a genuine replacement (an
available player not already on any court this cycle) into that court's
remaining games — completed games and history stay untouched either way.
Court-count changes only take effect at the next cycle boundary, and
**Move Players & Start Next Cycle** now validates that every resulting
court still has exactly 5 players before proceeding, with a specific
message (*"Court 3 needs 1 more player"*, *"Court 5 has too many
players"*) rather than silently breaking — resolved with that
substitution and/or the existing per-player "move to court" override
already in the Movement Preview screen.

**Current limitation**: because King Court's roster is normally an exact
`courts × 5` fit (see "Setup must be completed before matches start"
below), a genuine spare player to substitute in only exists if the roster
has more people than the courts currently seat. If none exists, the
organiser resolves it manually — play the court short-handed, or use the
Movement Preview's per-player override once the cycle finishes.

## What it does

- **Setup screen** — the app's starting point every time: choose Singles
  or **Doubles** (the default), a Play Mode (and Tournament Format, Pairing
  Style, or Social Scoring, whichever applies), the number of courts (a
  row of clickable **1–6** buttons plus **Other** for anything larger —
  see "Number of Courts" below), and add participants — individual
  players and/or fixed teams together for Doubles in Leaderboard/Social
  Play (see "Doubles: individual players, fixed teams, and mixed rosters"
  below), or the single exclusive Add Player/Add Team choice for Pools &
  Knockout.
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
  with its own **Setup** (including **Court Seeding**), **Rounds**
  (Current Round / All Rounds), **Standings**, and **Cycle History** tabs
  — see "5-Player King Court Mode" below for the full write-up.
- **Dynamic Pairing Social** — a Social Format alongside Standard Social
  Play, with its own **Setup**, **Rounds** (Current Round / All Rounds),
  **Rankings**, **Resting Players**, and **Session History** tabs — see
  "Dynamic Pairing Social" above for the full write-up.

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
- Match type is Singles or Doubles (and, for Doubles + Pools & Knockout, a
  Doubles Setup mode is selected).
- Number of courts is at least 1.
- There are enough participants for the match type: 2+ individual players
  for Singles; for Doubles in Leaderboard/Social Play, at least 4 people
  total across individual players and fixed teams combined (a fixed team
  counts as 2, two individual players can combine into one temporary
  team) — or, for Pools & Knockout, *exactly* enough for the chosen roster
  type (see "Pools & Knockout" above).
- Every player has a name (rating is always optional), including both
  players on every fixed team.

If setup is incomplete, reopening the app always lands you back on Setup.
If you've already started a session, reopening the app takes you straight
back to the Rounds tab (defaulting to Current Round).

This section covers Tournament and Social Play's **Start Matches** flow.
5-Player King Court Mode has its own separate setup, seeding, and
**Start Cycle 1** gating — see "5-Player King Court Mode" below.

## Number of Courts

"Number of Courts" is a row of clickable buttons — **1** through **6**,
plus **Other** — used everywhere a court count is configured: Social Play
Mode, Tournament Mode (both formats), and 5-Player King Court Mode. Click
a number to set it immediately (it highlights); click **Other** to reveal
a plain number input for anything beyond 6 (still validated to be a whole
number of at least 1). The buttons are sized generously (44px+) for easy
tapping on mobile. Whichever value you land on is just the underlying
`courts` (or King Court's `numberOfCourts`) setting — the same value
every other part of the app already reads — so switching between a preset
and Other never loses or resets your player/team setup. See
`src/components/CourtSelector.tsx` and `generateCourtOptions`/
`validateCourtCount` in `src/utils/tournament.ts`.

## Setup screen

The Setup screen asks for things in this order, since later choices
depend on earlier ones:

1. **Match Type** — Singles or **Doubles** (the default). This is
   deliberately the very first decision: it decides whether a "Doubles
   Setup" choice can appear at all (see step 4).
2. **Play Mode** — Tournament Mode or Social Play Mode.
3. **Tournament Format** (Tournament Mode only) — Leaderboard or Pools &
   Knockout, plus Pools & Knockout Setup if that's selected. See "Pools &
   Knockout" above. Leaderboard format also shows **Pairing Style**
   (Balanced / Leaderboard-based / Random) here — see "Pairing Styles"
   above.
4. **Doubles Setup** (Doubles + Pools & Knockout only) — **Add Player**
   (Rotating Players) or **Add Team** (Fixed Teams). Not shown for
   Leaderboard/Social Play, which use the unified Participants setup
   instead (step 6) — see "Doubles: individual players, fixed teams, and
   mixed rosters" above.
5. **Number of Courts** — see "Number of Courts" above.
6. **Participant/roster setup**:
   - **Singles, or Doubles + Pools & Knockout** — the original **Add
     Player** / **Players** (or **Add Team** / **Teams**) layout: two
     columns on desktop, stacked on mobile, directly editable in place
     (click into any field, saved on blur), each row with its own
     **Remove** button. **Generate player slots** creates several unnamed
     rows at once (e.g. `12`) to fill in afterward. **Remove All
     Players**/**Remove All Teams** asks for confirmation, then clears
     that roster in one action.
   - **Doubles + Leaderboard/Social Play** — the unified **Participants**
     setup: **Add Player** and **Add Team** forms together, one merged,
     badged list below, and a single **Remove All Participants** that
     clears both rosters at once. See "Doubles: individual players, fixed
     teams, and mixed rosters" above.
   - Either way, this only touches the roster itself: Play Mode,
     Tournament Format, Doubles Setup, Pairing Style, Social Scoring,
     Session Timing, courts, and match type are left exactly as they
     were. If a session is already in progress, existing rounds keep
     referring to removed players/teams (shown as "Unknown player"/
     "Unknown team" — see "Current limitations" below).
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

## Doubles: individual players, fixed teams, and mixed rosters (Leaderboard/Social Play)

When Match Type is Doubles and the Play Mode is Tournament + Leaderboard
format or Social Play, Setup shows a single unified **Participants**
section instead of a mode toggle — **Add Player** and **Add Team** are
both always available, and the organiser can use either, or both, at the
same time. This is the biggest difference from Pools & Knockout, which
still has an exclusive "Doubles Setup" choice — see "Pools & Knockout"
below.

- **Add Player** — an individual player: a name and an optional rating.
  Individual players don't have a fixed partner; each round, whichever
  individual players are playing get grouped into **temporary teams**
  fresh for that round (see "How mixed rounds are generated" below).
- **Add Team** — a **fixed team**: a name (optional — auto-generated from
  the two player names if left blank, e.g. **"Thai / Alex"**), Player 1,
  Player 2 (both required), and an optional rating. A fixed team stays
  together as a pair for the whole tournament/session — only its
  *opponent* rotates round to round.

Both kinds show up together in one **Participants** list below the forms,
each row badged **Player** or **Team**, directly editable in place (same
philosophy as the rest of the app — click into a field, it saves on
blur). **Remove All Participants** clears both individual players and
fixed teams in one action. Example:

```
Participants (4)
1  Player  Thai
2  Player  Alex
3  Team    Ben / Sarah
4  Player  John
```

Internally, individual players and fixed teams are still two separate
`localStorage`-backed rosters (`usePlayers`/`useTeams`, same as before) —
the Participants view just presents them together, sorted by the order
they were actually added (see `idTimestamp` in
[`src/components/ParticipantList.tsx`](src/components/ParticipantList.tsx)).

In **Singles**, only individual players are used — Add Team isn't shown
at all, since a fixed 2-player team doesn't apply to Singles.

### How mixed rounds are generated

When the Doubles roster has *both* fixed teams and individual players at
once, each round's matches mix the two kinds of competitor freely:

- Fixed teams stay together and keep facing rotating opponents, exactly
  as before.
- Individual players are grouped into temporary 2-player teams fresh each
  round (favouring partners they haven't been teamed with before — same
  matchup-avoidance idea as ordinary rotating Doubles), then those
  temporary teams and the fixed teams are all paired against each other
  as equals — from the pairing step's point of view, a temporary team and
  a fixed team are interchangeable (see `mergeFixedTeamsAndTemporaryTeams`
  in `src/utils/pairing.ts`).
- On a match card, a fixed team's side shows a small **Fixed Team** tag
  next to its name (e.g. **"Carol / Dave `Fixed Team`"**) so it's clear at
  a glance which sides are pre-declared pairs and which are temporary
  pairings for that round only.
- **Byes**: whenever there are more players than court capacity, byes are
  still handed out by fewest-byes-so-far, same fairness rule as
  everywhere else — but now the candidates being compared are a mix of
  whole fixed teams (2 slots) and individual players (1 slot each). A
  fixed team sits out as a whole pair whenever possible; it's only
  **temporarily split** (one player sits out, the other keeps playing
  solo, grouped into that round's temporary teams) as a last resort, when
  exactly one bye slot is left and no individual player is available to
  fill it. See `selectByeParticipants` in `src/utils/pairing.ts`.
- **Social Play** follows the same rules — fixed teams are treated as
  dedicated pairings and kept together (including sitting out byes
  together) wherever possible, with the same last-resort split behaviour
  if the math ever calls for it.

Every player — whether solo-roster or a fixed team's player — is ranked
individually on the Leaderboard/Player Stats (their side's score counts
as their own points either way), so a mixed roster reads as one list of
people rather than two disconnected rankings.

### Pools & Knockout keeps its own Doubles Setup toggle

For Pools & Knockout specifically, the roster is still one exclusive
choice — **Add Player** (Rotating Players, auto-paired) or **Add Team**
(Fixed Teams, declared directly) — see "Pools & Knockout" below.
Internally this is the `doublesPairingMode` setting
(`rotating-players`/`fixed-teams`), picked via the **Doubles Setup**
toggle that only appears when Tournament Format is Pools & Knockout.

### How Fixed-Teams-only round generation works

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

### Tournament Mode (Fixed Teams-only roster)

Fixed teams are the competitor: matches are Team A vs. Team B, scores and
wins/losses apply to the team, and the results tab becomes the **Team
Leaderboard** — ranked by wins, then Points For, then point difference
(PF − PA), then fewest byes, then rating. Match cards (Current Round, All
Rounds) show the team name directly (e.g. "Carol / Dave") — see "How
mixed rounds are generated" above for how a *mixed* roster (fixed teams
alongside individual players) displays instead.

### Social Play Mode (Fixed Teams-only roster)

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
  rank #, player name, rating, **PF** (Points For), **PA** (Points
  Against), **+/-** (PF − PA, point differential), matches played, wins,
  losses, and byes; sorted by **wins**, then **total points**, then
  **point differential**, then **fewest byes**, then **rating**. The top
  row is highlighted. See `calculateLeaderboardStats` in
  `src/utils/pairing.ts` — the same function also drives Pairing Style's
  "Leaderboard-based" ranking, so the Leaderboard tab and the pairing
  engine always agree on "current standing".
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
  Teams** above. Together, this is the same result as **Remove All
  Participants** on the unified Participants setup.
- Every setting — Play Mode, Tournament Format, Doubles Setup (Pairing
  Mode), Pairing Style, Social Scoring, Pools & Knockout Setup, courts,
  and match type — back to its default, not just left as-is.
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

**5-Player King Court Mode** and **Dynamic Pairing Social** each have
their own separate reset — see "Resetting King Court" under "5-Player
King Court Mode", and "Resetting Dynamic Pairing Social" under "Dynamic
Pairing Social", both above — since neither uses rounds/players in the
same shape as Tournament/Standard Social Play. In practice, clicking
*any* reset button clears *all* of it, every time — Reset Social Play
also wipes King Court's cycles and Dynamic Pairing Social's roster, and
so on — the label shown just reflects whichever mode is currently active;
nothing about the underlying reset is actually mode-scoped.

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
  teams, Team A vs Team B. In Leaderboard/Social Play, each team is either
  a fresh **temporary team** re-formed every round from individual
  players, or a **fixed team** that stays together for the whole
  tournament/session — both can be mixed on the same roster, see "Doubles:
  individual players, fixed teams, and mixed rosters" above. Pools &
  Knockout instead picks one exclusively (Rotating Players or Fixed Teams)
  — see "Pools & Knockout keeps its own Doubles Setup toggle" above.

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
  full team score (it isn't split between them). The opposing side's
  score is tracked too, as **Points Against** — see PF/PA/+/- below.
- The leaderboard is sorted by **wins** (highest first), then **total
  points** (highest first), then **point differential** (PF − PA, highest
  first), then byes (**lowest** first), then rating (highest first).
- **PF** (Points For), **PA** (Points Against), and **+/-** (PF − PA,
  point differential) are tracked per player, the same PF/PA/+/- idea the
  Team Leaderboard (Doubles + Fixed Teams) and Pools & Knockout's pool
  standings already used — see `pointsFor`/`pointsAgainst`/
  `pointDifferential` on `PlayerStats` in `src/types.ts`.

**Social Play Mode**, depending on the Scoring setting:

- *No Scoring*: no score entry, no points, no wins/losses.
- *Track Scores Only*: scores and total points are recorded the same way
  as Tournament Mode, but never used to rank players.
- *Track Scores and Wins*: scores, points, wins, and losses are all
  recorded — shown as casual Player Stats, not a competitive ranking.

## Validation

- A Play Mode must be selected (Tournament or Social Play).
- Match type must be selected (Singles or Doubles).
- Number of courts must be at least 1 (whole number — validated the same
  way whether picked from the Court Selector's preset buttons or typed
  into Other).
- Singles requires at least 2 individual players. Doubles in
  Leaderboard/Social Play requires at least 4 people total across
  individual players and fixed teams combined (a fixed team counts as 2,
  two individual players can combine into a temporary team). Doubles +
  Pools & Knockout keeps its own exact-count validation — see below.
- Every player needs a name (rating is optional — leave it blank),
  including both players on every fixed team.
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
- **Reset Social Play** / **Reset Tournament**, **Remove All Players**,
  **Remove All Teams**, and **Remove All Participants** each ask for
  confirmation before clearing anything — see "Resetting a session" and
  "Setup screen" above.
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
- Rating only factors into pairing as a secondary tie-breaker, and only in
  two cases: a mixed Doubles roster under the **Balanced** Pairing Style
  (see "How mixed rounds are generated" above), and indirectly under
  **Leaderboard-based** (since ranking itself uses rating as a tie-break —
  see "Pairing Styles" above). A pure rotating-Doubles or Fixed
  Teams-only roster under Balanced still ignores rating entirely, same as
  before.
- There's no way to edit or regenerate a past round once it's created.
- Removing a player who has already played doesn't rewrite their match
  history — their past matches/byes stay in the data, but they drop off
  the current player list and show as "Unknown player" in All Rounds.
- Partners/opponents in Player Stats are shown as plain name lists, which
  can get long in a big, long-running session.
- No import/export — data lives only in the current browser's
  `localStorage`.
- **Doubles + Fixed Teams** specifically:
  - The single-player "split team" bye case is provably impossible for a
    **Fixed Teams-only** roster (every fixed team has exactly 2 players
    and a court always seats exactly 2 whole teams, so the math never
    calls for an odd leftover slot) — but it's a real, reachable case for
    a **mixed** roster (fixed teams + individual players), where an odd
    leftover slot is common. See "How mixed rounds are generated" above.
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
- **Dynamic Pairing Social** — see "Current limitations (Dynamic Pairing
  Social-specific)" under "Dynamic Pairing Social" above; it has its own
  separate list (Doubles only, a simple (not globally optimal) court
  movement resolution, only two partnership splits considered per court,
  score confirmation/manual overrides as placeholders, and more).
- **Dynamic Team Qualifier** — see "Current limitations (Dynamic Team
  Qualifier-specific)" under "Dynamic Team Qualifier" above; it has its
  own separate list (Top 4 bracket size only, withdrawal/injury/late
  arrival/score correction as placeholders, a first-working-swap rest
  repair, and more).

## Future features

- Fuller rating-aware pairing for the Balanced style on non-mixed rosters
  (currently rating is only a secondary tie-break, and only for mixed
  Doubles — see "Current limitations" above).
- Editing/regenerating rounds.
- Exporting session results.
- Pools & Knockout: manual/drag-and-drop pool assignment, uneven pool
  sizes, rating-aware seeding, and a proper graphical bracket view.
- Doubles + Fixed Teams: edit a pairing without a full reset.
- Configurable tournament rules beyond courts/match type.
- 5-Player King Court Mode: rating-aware court seeding suggestions,
  mid-cycle manual court moves, drag-and-drop Court Seeding, remembering
  manual tiebreak preferences, and support for court sizes other than 5.
- Dynamic Pairing Social: a Singles option, real score confirmation and
  manual court/partnership overrides, a proper "hold out for one round"
  late-arrival flow, and a globally optimal court-movement resolution
  instead of the current nearest-available-court search.
- Dynamic Team Qualifier: bracket sizes beyond Top 4, real withdrawal/
  injury retirement/late-arrival/score-correction workflows backed by the
  existing `AuditEvent` trail, a smarter rest-slot repair, and a
  minimum-cost matching algorithm in place of the current greedy pairing.

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
                             SocialFormat, SessionTiming, Team, DoublesPairingMode,
                             PairingStyle, TeamInstance, Pool, KnockoutBracket,
                             PlayerStats, TeamStats, King Court's
                             KingCourtCycle/KingCourtGame/KingCourtStanding/
                             KingCourtMovement/..., Dynamic Pairing Social's
                             DynamicPairingSettings/DynamicPairingPlayerStats/
                             DynamicPairingRound/DynamicPairingCourtAssignment/...,
                             Dynamic Team Qualifier's DynamicTeamQualifierSettings/
                             DynamicTeam/RestAssignment/QualifyingRound/
                             QualifyingMatch/TeamStanding/MedalBracket/AuditEvent/...)
  utils/tournament.ts       Pure logic: validation, stats (including PF/PA/+/-),
                             mode helpers, session timing, and the original 'balanced'
                             pairing algorithm (createRound, createFixedTeamRound) plus
                             the shared primitives (MeetingCounts, buildMatchHistory,
                             pairByFewestMeetings, ...) utils/pairing.ts builds on
  utils/pairing.ts          Pairing-style-aware round generation: generateLeaderboardRound
                             (the single entry point for every Leaderboard/Social Play
                             round), the 'leaderboard-based'/'random' style dispatchers,
                             the mixed fixed-team/individual-player Doubles engine
                             (generateMixedDoublesRound, buildTemporaryTeamsFromIndividuals,
                             mergeFixedTeamsAndTemporaryTeams, selectByeParticipants), and
                             calculateLeaderboardStats/calculateTeamLeaderboardStats (also
                             used by the Leaderboard/Team Leaderboard UI)
  utils/poolsKnockout.ts    Pure logic: team formation, pool assignment, round-robin
                             match generation, pool standings/tie-breaks, knockout
                             seeding/byes/bracket progression (Pools & Knockout)
  utils/kingCourt.ts        Pure logic: the 5-game rotation, A-E assignment, game/cycle
                             scoring, standings + ties, movement preview, the next
                             cycle's court assignments, Court Seeding capacity checks
                             (isCourtFull), and All Rounds game status
                             (getKingCourtGameStatus) (5-Player King Court Mode)
  utils/dynamicPairingSocial.ts
                             Pure logic, entirely self-contained: per-game stats and
                             ranking (calculateDynamicPairingStats, calculatePlayerRankings,
                             sortPlayersByRanking, getPlayerHeadToHead), fair rest
                             selection (selectRestingPlayers) kept deliberately
                             independent of ranking, court allocation
                             (allocatePlayersToCourts, applyCourtMovementLimit), balanced
                             partnerships (createBalancedPartnerships,
                             scorePartnershipOption), and the round-generation/scoring
                             entry points (generateDynamicPairingRound,
                             generateInitialGradingRounds,
                             processDynamicPairingScore, lockCompletedRound), and the
                             derived status/label helpers (isAwaitingSkillReview,
                             playedDynamicPairingRounds, roundStatusLabel,
                             roundPhaseLabel, nextRoundButtonLabel) (Dynamic Pairing
                             Social)
  utils/dynamicTeamQualifier.ts
                             Pure logic, entirely self-contained: rest schedule
                             generation/validation (generateRestSchedule,
                             validateRestSchedule — a seeded, least-slack-first
                             greedy fill), provisional/final standings
                             (calculateProvisionalStandings, calculateFinalStandings,
                             calculateOpponentWinPercentage,
                             calculateCappedPointDifferential), no-repeat qualifying
                             pairing (generateQualifyingPairings,
                             validateNoRepeatQualifyingMatchups, a rest-slot repair
                             in generateNextQualifyingRound), court allocation, the
                             Semis/Gold/Bronze medal bracket (generateMedalBracket,
                             processBracketResult), and a small seeded PRNG
                             (makeSeededRandom) used for every randomised decision
                             in this mode (Dynamic Team Qualifier)
  hooks/                    useLocalStorage, usePlayers, useTeams (Add Team roster —
                             see RosterSetup/ParticipantSetup), useTournament
                             (Leaderboard/Social Play state, dispatches into
                             utils/pairing.ts), usePoolsKnockout (Pools & Knockout
                             state), useKingCourt (King Court state),
                             useDynamicPairingSocial (its own roster/settings/rounds,
                             entirely separate from every other hook here),
                             useDynamicTeamQualifier (its own team roster/settings/
                             rest schedule/rounds/medal bracket, also entirely
                             separate) — all persisted to localStorage
  components/                CourtSelector (clickable court-count picker, used
                             everywhere courts are configured); PlayerForm, PlayerList,
                             TeamForm, TeamList (PlayerRow/TeamRow also take an optional
                             `badge` prop, reused by ParticipantList); ParticipantSetup +
                             ParticipantList (unified Add Player/Add Team roster for
                             Doubles + Leaderboard/Social Play); RosterSetup (picks
                             between ParticipantSetup and the original exclusive
                             Add Player/Add Team layout, depending on Tournament
                             Format); TournamentSetup (Pairing Style selector included),
                             SocialSessionSetup, RoundsPage, CurrentRoundView,
                             AllRoundsView, ByeList (Fixed Team-aware — see
                             fixedTeamNameFor), Leaderboard, PlayerStats,
                             FixedTeamResults, PickleballLogo (Leaderboard/Social
                             Play); PoolsKnockoutPage, PoolStageView, PoolLeaderboard,
                             KnockoutBracketView, FinalResults (Pools & Knockout);
                             KingCourtSetup (uses CourtSelector), CourtSeeding,
                             KingCourtRoundsPage, KingCourtView, KingCourtAllRoundsView,
                             KingCourtGameCard, KingCourtStandings,
                             KingCourtMovementPreview, KingCourtCycleHistory (King
                             Court — reuses PlayerForm/PlayerList directly for its
                             roster rather than duplicating them; KingCourtRoundsPage
                             is the Current Round/All Rounds toggle parent, mirroring
                             RoundsPage); DynamicPairingSetup (own player roster UI —
                             not a reuse of PlayerForm/PlayerList, since it needs
                             starting seed + availability fields those don't have),
                             DynamicPairingRoundsPage (Current Round/All Rounds toggle
                             parent, mirroring RoundsPage; also swaps in
                             DynamicPairingAdminSkillReview in place of Current Round
                             while awaitingSkillReview is true), DynamicPairingCurrentRound,
                             DynamicPairingAllRounds, DynamicPairingAdminSkillReview
                             (the post-grading checkpoint before Round 4),
                             DynamicPairingRankings, DynamicPairingRestingPlayers,
                             DynamicPairingSessionHistory (Dynamic Pairing Social);
                             DynamicTeamQualifierSetup (session-level settings),
                             DynamicTeamRoster (combined team registration + check-in
                             + Start Qualifying, mirroring DynamicPairingSetup's
                             shape), DynamicTeamQualifierRoundsPage (Current
                             Round/All Rounds toggle parent, mirroring RoundsPage),
                             DynamicTeamQualifierCurrentRound (also renders the
                             Director Dashboard summary/actions at the top),
                             DynamicTeamQualifierAllRounds (qualifying rounds plus
                             the medal bracket as a trailing section),
                             DynamicTeamQualifierStandings (Provisional/Final,
                             switching on stage), DynamicTeamQualifierMedalBracket,
                             DynamicTeamQualifierFinalResults (Dynamic Team
                             Qualifier)
  App.tsx                   Setup / middle-tab / results views, tab gating, and layout
                             — routes between the Leaderboard/Social Play components,
                             the Pools & Knockout ones, the King Court ones, the
                             Dynamic Pairing Social ones, and the Dynamic Team
                             Qualifier ones depending on settings.playMode (and
                             settings.socialFormat when playMode is 'social', or
                             settings.tournamentFormat when playMode is 'tournament');
                             computes the effective roster (individual players / fixed
                             teams / the union for mixed Doubles) passed down to the
                             Leaderboard/Social Play components
```

Business logic lives in `src/utils` and `src/hooks`, separate from the
components in `src/components`, so the pairing/scoring rules can evolve
later without rewriting the UI. Pools & Knockout, King Court, Dynamic
Pairing Social, and Dynamic Team Qualifier are all self-contained
additions alongside the original Leaderboard/Social Play code (each with
its own utils file, its own hook, its own components, its own
`localStorage` keys) rather than a rewrite of it — Dynamic Pairing Social
and Dynamic Team Qualifier don't even share `usePlayers`/`useTeams`, only
the `Player` *type* in Dynamic Pairing Social's case (extended with
optional `startingSeed`/`availabilityStatus` fields every other mode
simply never sets); Dynamic Team Qualifier doesn't use the shared `Player`
or `Team` types at all — it has its own `DynamicTeam` shape, since a team
(not a player) is the ranking/pairing unit throughout. King Court shares
only the `Player` type and `usePlayers` roster (and UI/CSS building
blocks) with the rest of the app; everything else about it (settings,
state, logic) is independent. `utils/tournament.ts` and `utils/pairing.ts`
import from each other (tournament.ts's createRound/createFixedTeamRound
delegate to pairing.ts for non-'balanced' styles; pairing.ts reuses
tournament.ts's stats/primitives) — safe as a circular import since
neither calls into the other at module load time, only from inside
functions that run later, once both modules have fully evaluated.

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
