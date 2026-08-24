// Core data shapes for the tournament app.

// Shared across every Social Play mode (Standard Social Play, Dynamic
// Pairing Social, 5-Player King Court) for mid-session player-availability
// changes — a player going home early, getting injured, or sitting out a
// round without losing their roster slot or completed stats. Kept optional
// on the shared Player shape rather than a separate type so Tournament
// Mode's Player usage is completely unaffected (it simply never sets this;
// see canGenerateRound/createRound, which never read it). Defaults to
// 'available' when absent everywhere it's read.
// - 'available': normal — eligible for future rounds/cycles, and eligible
//   to be swapped into the current one (see the various swapPlayerInRound
//   functions).
// - 'resting-this-round': sitting out by choice, for the current round
//   only — auto-reverts to 'available' the moment a new round/cycle
//   becomes current (see revertRestingPlayers in utils/tournament.ts),
//   unless the organiser has since set something else explicitly.
// - 'late': hasn't arrived yet — excluded from round generation the same
//   way as 'unavailable', but a distinct label so the organiser can tell
//   "not here yet" apart from "here, but can't play" at a glance. Does NOT
//   auto-revert (unlike 'resting-this-round') — the app has no way to know
//   when a late player actually shows up, so "Make available" is always
//   explicit.
// - 'left-early' / 'injured' / 'unavailable': excluded from future round/
//   cycle generation until explicitly set back to 'available'. Distinct
//   labels for the organiser's benefit (why they're out); behaviourally
//   identical — all three are simply "not available", same as 'late'.
export type PlayerAvailabilityStatus =
  | 'available'
  | 'resting-this-round'
  | 'late'
  | 'left-early'
  | 'injured'
  | 'unavailable';

export interface Player {
  id: string;
  name: string;
  // Optional: a player can be added without a rating ("Unrated"). Used for
  // leaderboard sort tie-breaking only when present.
  rating?: number;
  // Dynamic Pairing Social only: an organiser-assigned starting rank (1 =
  // strongest), used only as a ranking tiebreaker — grading rounds are
  // randomized regardless of seed (see generateDynamicPairingRound).
  startingSeed?: number;
  // Dynamic Pairing Social only: an organiser-assigned rank (1 = strongest)
  // set *after* grading rounds finish, once the organiser has actually seen
  // players compete — see isGradingPhaseComplete in
  // utils/dynamicPairingSocial.ts. Used as a ranking tiebreaker, ahead of
  // startingSeed (see sortPlayersByRanking).
  skillLevel?: number;
  // Mid-session availability — see PlayerAvailabilityStatus above.
  availabilityStatus?: PlayerAvailabilityStatus;
}

// One mid-session change worth surfacing back to the organiser — a light,
// practical audit trail (not exhaustive event sourcing): each Social Play
// mode keeps its own array of these, shown as a small dismissible notice
// rather than a full history browser, per the design brief's "prefer
// simple, reliable behaviour over complex automation".
export type SessionAdjustmentType =
  | 'player-rested'
  | 'player-left'
  | 'player-injured'
  | 'player-unavailable'
  | 'player-made-available'
  | 'player-swapped'
  | 'court-count-changed'
  | 'future-rounds-regenerated'
  | 'team-split';

export interface SessionAdjustment {
  id: string;
  type: SessionAdjustmentType;
  roundNumber?: number;
  cycleNumber?: number;
  playerIds: string[];
  fromCourt?: number;
  toCourt?: number;
  oldValue?: string;
  newValue?: string;
  timestamp: number;
  note?: string;
}

export type MatchType = 'singles' | 'doubles';

// Tournament Mode is competitive (points/wins/losses, ranked leaderboard).
// Social Play Mode is casual — same fair rotation/pairing engine, but
// ranking is de-emphasised and scoring is configurable (see
// SocialScoringMode). King Court Mode is a third, structurally separate
// mode — fixed 5-player courts running 5-game cycles with rank-based
// movement between courts — see src/utils/kingCourt.ts and
// src/hooks/useKingCourt.ts; it doesn't use Round/Match/TournamentState at
// all.
export type PlayMode = 'tournament' | 'social' | 'king-court-5';

// Only meaningful when PlayMode is 'social' (with one exception — see
// below): which flavour of Social Play is active.
// - 'standard-social': the original Social Play behaviour described above.
// - 'dynamic-pairing-social': a doubles-only, ranking-driven competitive
//   social format — see the "Dynamic Pairing Social" section near the end
//   of this file, and src/utils/dynamicPairingSocial.ts.
// - 'king-court-5': shown in the Setup UI as a third Social Format choice
//   alongside the two above (grouped there since it's conceptually a
//   social/casual format too), but selecting it actually sets
//   PlayMode to 'king-court-5' directly rather than leaving it at
//   'social' — see TournamentSetup's Social Format toggle. This keeps
//   every existing King Court code path (which all key off
//   `playMode === 'king-court-5'`) completely unchanged; socialFormat
//   only reflects the UI grouping in that case, nothing reads it.
export type SocialFormat = 'standard-social' | 'dynamic-pairing-social' | 'king-court-5';

// Only meaningful when PlayMode is 'social':
// - 'none': generate rounds only, no score entry, no points/wins tracked.
// - 'scoresOnly': scores and total points are tracked, but not used to
//   rank players competitively.
// - 'scoresAndWins': scores, points, wins, and losses are all tracked,
//   still presented as casual "Player Stats" rather than a leaderboard.
export type SocialScoringMode = 'none' | 'scoresOnly' | 'scoresAndWins';

// One side of a match: 1 player id for singles, 2 for doubles. Not the same
// thing as the Pools & Knockout `Team` below — this is just an ad-hoc pair
// of players for a single rotating-round match; that `Team` is a persistent
// named entity that plays a whole pool/bracket.
export interface MatchSide {
  playerIds: string[];
}

export interface Match {
  id: string;
  court: number;
  teamA: MatchSide;
  teamB: MatchSide;
  scoreA?: number;
  scoreB?: number;
}

// 'upcoming' rounds are pre-generated placeholders (Social Play — see
// SessionTiming below) that haven't been reached yet; 'current' is the
// single active round; 'completed' rounds are read-only history. Exactly
// one round should be 'current' at a time.
export type RoundStatus = 'upcoming' | 'current' | 'completed';

export interface Round {
  id: string;
  roundNumber: number;
  matches: Match[];
  // Players sitting out this round (didn't fit on a court, or were
  // selected for a fair bye rotation). Always populated — for fixed-team
  // byes below, this is the union of every byeTeamIds team's 2 players
  // plus any splitTeamIds team's single sitting-out player, so components
  // that only care about individual players (e.g. ByeList) don't need to
  // know about fixed teams at all.
  byePlayerIds: string[];
  // Doubles + Fixed Teams only (see createFixedTeamRound): whole teams
  // sitting out together this round.
  byeTeamIds?: string[];
  // Doubles + Fixed Teams only: teams temporarily split this round (one
  // player sits out, the other still plays) — see createFixedTeamRound's
  // bye-assignment comment for when/why this can happen.
  splitTeamIds?: string[];
  status: RoundStatus;
}

// Social Play session timing: the total booked court time, split into
// fixed-length games with a buffer between them. Used to estimate how many
// rounds fit into the session (see calculateSessionPlan in
// utils/tournament.ts). Not used in Tournament Mode, but kept on
// TournamentSettings unconditionally for the same reason as
// socialScoringMode above.
export interface SessionTiming {
  sessionTimeMinutes: number;
  gameTimeMinutes: number;
  bufferTimeMinutes: number;
}

// Result of dividing a SessionTiming's session time into game+buffer
// "round blocks" — see calculateSessionPlan.
export interface SessionPlan {
  estimatedRounds: number;
  remainingTimeMinutes: number;
}

// Only meaningful when PlayMode is 'tournament':
// - 'leaderboard': the original Tournament Mode — rotating rounds, ranked
//   by total points/wins/byes (see PlayerStats/computePlayerStats below).
// - 'pools-knockout': fixed Teams play a round-robin pool stage, then the
//   top finishers from each pool face off in a single-elimination bracket.
//   See src/utils/poolsKnockout.ts and the Pool/KnockoutBracket types below
//   — this format doesn't use Round/Match/computePlayerStats at all, it's
//   an entirely separate data model.
// - 'dynamic-team-qualifier': fixed-partner doubles Teams play a dynamic
//   (results-based, not fixed-pool) qualifying stage with a fair rest
//   rotation, then the top 4 teams face off in a small Semis/Gold/Bronze
//   medal bracket. See the "Dynamic Team Qualifier" section near the end of
//   this file and src/utils/dynamicTeamQualifier.ts — another entirely
//   separate data model, kept independent of both Leaderboard and Pools &
//   Knockout.
export type TournamentFormat = 'leaderboard' | 'pools-knockout' | 'dynamic-team-qualifier';

export interface PoolKnockoutSettings {
  numberOfPools: number;
  teamsPerPool: number;
  // How many times each pair of teams in a pool plays each other, e.g. 2 =
  // every pool match is played home-and-away.
  timesEachTeamPlays: number;
  teamsAdvancingPerPool: number;
}

// Tournament Mode + Leaderboard format only (see PairingStyle below):
// - 'balanced': the original behaviour — favour opponents/partners faced
//   the fewest times, with a light rating/performance nudge on top. See
//   createRound/createFixedTeamRound in utils/tournament.ts and
//   pairUnitsByFewestMeetings in utils/pairing.ts.
// - 'leaderboard-based': pair competitors with similar current ranking
//   (1st vs 2nd, 3rd vs 4th, ...); for rotating Doubles this instead
//   guides balanced *team* formation (strongest with weakest) rather than
//   pitting the top-ranked players directly against each other. See
//   pairUnitsByStyle/formPartnersByStyle in utils/pairing.ts.
// - 'random': shuffled pairings each round, still respecting court
//   capacity/bye fairness and avoiding an exact repeat of the immediately
//   preceding round where possible.
export type PairingStyle = 'balanced' | 'leaderboard-based' | 'random';

export interface TournamentSettings {
  playMode: PlayMode;
  // Always present (even in Tournament Mode, where it's ignored) so
  // components don't need to deal with an optional field.
  socialScoringMode: SocialScoringMode;
  courts: number;
  matchType: MatchType;
  sessionTiming: SessionTiming;
  // Both always present (even outside Tournament Mode / outside Pools &
  // Knockout, where they're ignored), same rationale as socialScoringMode.
  tournamentFormat: TournamentFormat;
  poolKnockoutSettings: PoolKnockoutSettings;
  // Tournament Mode + Leaderboard format only — ignored elsewhere, same
  // rationale as socialScoringMode above. See PairingStyle.
  pairingStyle: PairingStyle;
  // Only meaningful when playMode is 'social' — always present (same
  // rationale as socialScoringMode above) so components don't need an
  // optional check. See SocialFormat.
  socialFormat: SocialFormat;
}

// A fixed competitor for the whole tournament/session (unlike the ad-hoc
// MatchSide pairing used by rotating-round Doubles). One player in
// Singles, two in Doubles. Used by Pools & Knockout (always — see
// formTeams/poolsKnockout.ts) and, when Doubles Pairing Mode is
// 'fixed-teams', by Leaderboard/Social Play's rotating rounds too (see
// createFixedTeamRound in utils/tournament.ts).
export interface Team {
  id: string;
  // User-entered, or auto-generated from the two player names (e.g.
  // "Thai / Alex") when left blank — see useTeams.addTeam.
  name: string;
  playerIds: string[];
  rating?: number;
  // True for teams the user explicitly declared via "Add Team" (see
  // useTeams). False for teams Pools & Knockout auto-pairs from the
  // player list when Doubles Pairing Mode is 'rotating-players' (see
  // formTeams) — those are fixed for that tournament's duration too, but
  // weren't a deliberate "practice with this partner" choice.
  isFixedTeam: boolean;
}

// A single doubles competitor for one round of Leaderboard/Social Play
// pairing — either a pre-declared fixed Team (see Team above) or a
// temporary pairing of two individual players formed fresh for that round
// (see buildTemporaryTeamsFromIndividuals in utils/pairing.ts). This is a
// pairing-time convenience only, not a persisted entity: once a round is
// generated, both kinds are recorded identically as a Match's MatchSide
// (just playerIds) — see generateMixedDoublesRound, which is what lets a
// mixed Doubles roster (some fixed teams, some individual players) share
// one round's courts without the rest of the app needing to know which
// side came from which.
export interface TeamInstance {
  id: string;
  playerIds: string[];
  isFixedTeam: boolean;
  // Set only when isFixedTeam is true — the Team this instance came from.
  fixedTeamId?: string;
  displayName: string;
}

export interface PoolMatch {
  id: string;
  court: number;
  teamAId: string;
  teamBId: string;
  scoreA?: number;
  scoreB?: number;
}

// A single pool's round-robin standings, derived from its matches — see
// computePoolStandings. `rank` and `qualifiesForKnockout` reflect the
// pool's current state, whether or not every match has been played yet
// (i.e. they're a live projection until the pool is actually complete).
export interface PoolStanding {
  teamId: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  rank: number;
  qualifiesForKnockout: boolean;
}

export interface Pool {
  id: string;
  name: string;
  teamIds: string[];
  matches: PoolMatch[];
}

// 'pending': slots not decided yet (waiting on a previous round's winner).
// 'ready': both teams known, awaiting a score. 'completed': scored.
// 'bye': one slot had no opponent (bracket padding) — the other team
// advances automatically, no score needed.
export type KnockoutMatchStatus = 'pending' | 'ready' | 'completed' | 'bye';

export interface KnockoutMatch {
  id: string;
  roundName: string;
  teamAId?: string;
  teamBId?: string;
  scoreA?: number;
  scoreB?: number;
  winnerId?: string;
  loserId?: string;
  status: KnockoutMatchStatus;
  // Bracket-progression wiring: where this match's winner (and, only for
  // semifinal matches, loser — see thirdPlaceMatch below) gets forwarded
  // to once decided. Absent for the Final and the 3rd Place Match.
  nextMatchId?: string;
  nextMatchSlot?: 'A' | 'B';
  loserNextMatchId?: string;
  loserNextMatchSlot?: 'A' | 'B';
  isThirdPlaceMatch?: boolean;
}

export interface KnockoutRound {
  name: string;
  matches: KnockoutMatch[];
}

export interface KnockoutBracket {
  rounds: KnockoutRound[];
  // Only present once there's a Semifinals round with no byes in it — see
  // buildKnockoutBracket for why a bye there means no meaningful 3rd Place
  // Match can be formed.
  thirdPlaceMatch?: KnockoutMatch;
  champion?: string;
  runnerUp?: string;
  thirdPlace?: string;
  fourthPlace?: string;
}

export type TournamentStage = 'setup' | 'pool-stage' | 'knockout-stage' | 'complete';

export interface TournamentState {
  settings: TournamentSettings;
  rounds: Round[];
  // Estimated total rounds for the session, snapshotted from the Session
  // Timing settings when Start Matches is clicked (Social Play only) so it
  // doesn't drift if timing settings are edited mid-session. The current
  // round number is just the active round's `roundNumber` — no separate
  // field needed.
  plannedRounds: number | null;
}

// Aggregated stats for one player across all rounds played so far.
export interface PlayerStats {
  playerId: string;
  // Equal to pointsFor below — kept alongside it since existing UI already
  // reads totalPoints; pointsFor/pointsAgainst/pointDifferential are the
  // Leaderboard's PF/PA/+/- columns (see computePlayerStats).
  totalPoints: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  byes: number;
  // Unique player ids this player has had as a doubles teammate / has
  // faced as an opponent (singles or doubles), across all rounds so far.
  // (Meeting *counts*, used by the pairing engine to avoid repeats, are
  // derived separately and on demand from round history — see MeetingCounts
  // in utils/tournament.ts — rather than stored here, so there's a single
  // source of truth.)
  partnerIds: string[];
  opponentIds: string[];
}

// Aggregated stats for one fixed Team across all rounds played so far —
// the Doubles + Fixed Teams equivalent of PlayerStats, computed by
// computeTeamStats in utils/tournament.ts. Points are tracked both ways
// (PF/PA/difference), matching Pools & Knockout's PoolStanding, since a
// fixed team's results are naturally presented as a team record rather
// than points-only.
export interface TeamStats {
  teamId: string;
  gamesPlayed: number;
  byes: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  // Unique team ids this team has faced, across all rounds so far.
  opponentIds: string[];
}

// --- 5-Player King Court Mode ---------------------------------------------
// A completely separate data model from Round/Match/TournamentState above —
// see src/utils/kingCourt.ts and src/hooks/useKingCourt.ts. Reuses the same
// `Player` type (id, name, optional rating) as everything else, so the
// existing PlayerForm/PlayerList roster UI works unchanged.

export interface KingCourtSettings {
  numberOfCourts: number;
  // Always 5 — kept as an explicit field (rather than a bare constant)
  // so the data model documents the constraint everywhere it's read.
  playersPerCourt: 5;
}

// Pre-Cycle-1 manual seeding: which court each player has been placed on
// during the Setup tab's Court Seeding screen. Superseded by each
// KingCourtCourtCycle's `playerIds` once Cycle 1 starts — see
// useKingCourt.startCycle1.
export interface KingCourtPlayerAssignment {
  playerId: string;
  courtNumber: number;
}

export type KingCourtGameStatus = 'pending' | 'completed';

// One of the 5 games in a court's cycle. `team1PlayerIds`/`team2PlayerIds`
// each hold exactly 2 player ids; `restingPlayerId` is the 5th player who
// sits out this game — see generateFivePlayerRotation in
// src/utils/kingCourt.ts for how these are derived from the court's A-E
// letter assignment.
export interface KingCourtGame {
  gameNumber: number;
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  restingPlayerId: string;
  team1Score?: number;
  team2Score?: number;
  winnerTeam?: 1 | 2;
  status: KingCourtGameStatus;
}

export type KingCourtMovementDirection = 'up' | 'down' | 'stay';

// Per-player result for one court's cycle, ranked after all 5 games are
// scored — see calculateCourtStandings in src/utils/kingCourt.ts.
export interface KingCourtStanding {
  playerId: string;
  wins: number;
  losses: number;
  pointDifferential: number;
  rank: number;
  movementDirection: KingCourtMovementDirection;
  // True when this player is tied with at least one other player on both
  // wins and point differential — see calculateCourtStandings. The UI
  // (KingCourtMovementPreview) surfaces a manual tiebreak control for any
  // court where this is set for more than one player.
  tied?: boolean;
}

export type KingCourtMovementReason = 'up' | 'down' | 'stay' | 'top-court-stay' | 'bottom-court-stay';

// Where one player is headed for the next cycle, derived from their
// standing — see generateMovementPreview.
export interface KingCourtMovement {
  playerId: string;
  fromCourt: number;
  toCourt: number;
  reason: KingCourtMovementReason;
  rank: number;
}

// --- Dynamic Pairing Social ------------------------------------------------
// A Social Play format (see SocialFormat above): doubles-only, ranking-
// driven social competition. A completely separate data model from
// Round/Match/TournamentState above, with its own roster, its own
// `localStorage` keys, and its own logic file
// (src/utils/dynamicPairingSocial.ts) and hook
// (src/hooks/useDynamicPairingSocial.ts) — it doesn't reuse usePlayers,
// useTeams, or useTournament at all, so it can't affect any other mode.
// See README.md's "Dynamic Pairing Social" section for the full write-up.

export type DynamicGameFormat = 'timed' | 'first-to-score';

// How far a player's court can move between rounds once ranking-based
// allocation starts (see applyCourtMovementLimit) — a dampener against one
// unusually good/bad result causing a dramatic court jump.
export type CourtMovementLimit = 'unrestricted' | 'max-1' | 'max-2';

export interface DynamicPairingSettings {
  sessionName: string;
  numberOfCourts: number;
  // The first N rounds are "grading" rounds — see generateDynamicPairingRound.
  gradingRounds: number;
  gameFormat: DynamicGameFormat;
  gameDurationMinutes?: number;
  winningScore?: number;
  maxCourtMovement: CourtMovementLimit;
  // Placeholder for a future "organiser must confirm both teams' scores
  // before they're final" flow — always false in this version; scores are
  // accepted as entered, same as every other mode.
  scoreConfirmationRequired: boolean;
}

// Aggregated, per-game (not raw-total) stats for one player across the
// whole session so far — computed fresh from `players` + `rounds` by
// calculateDynamicPairingStats/calculatePlayerRankings, the same
// "derived, not stored separately" approach utils/tournament.ts uses for
// PlayerStats, so there's a single source of truth.
export interface DynamicPairingPlayerStats {
  playerId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  // Per-game rates, not raw totals — see calculateDynamicPairingStats.
  // Safe against divide-by-zero: all 0 when gamesPlayed is 0.
  winPercentage: number;
  averagePointDifferential: number;
  averagePointsScored: number;
  // Rest tracking — deliberately independent of ranking, see
  // selectRestingPlayers and README's "Rest management" section.
  totalRests: number;
  lastRestRound: number | null;
  consecutiveRoundsPlayed: number;
  // Set only by calculatePlayerRankings (calculateDynamicPairingStats
  // leaves these at their placeholder default) — see that function for why
  // ranking has to be computed as a distinct pass rather than inline here.
  currentRank: number;
  previousRank: number | null;
  // The court this player was on in the most recent round they actually
  // played (not necessarily the just-finished round, if they're resting
  // now) — null if they haven't played yet.
  currentCourt: number | null;
  // playerId -> number of times partnered/faced, across all rounds so far.
  partnerHistory: Record<string, number>;
  opponentHistory: Record<string, number>;
  // Court number the player played on, once per round played, in order.
  courtHistory: number[];
}

export type DynamicPairingRoundPhase = 'grading' | 'ranking';

// 'upcoming': a pre-generated grading round (see generateInitialGradingRounds
// in utils/dynamicPairingSocial.ts) whose courts/partners are already
// decided but hasn't started yet — no score entry until it becomes
// 'current'. 'completed' vs 'locked': a round becomes 'locked' (read-only)
// the moment the next round is activated/generated — see
// lockCompletedRound. 'completed' is a forward-compatibility synonym this
// app never actually produces (see roundStatusLabel, which renders both
// identically as "Completed").
export type DynamicPairingRoundStatus = 'upcoming' | 'current' | 'completed' | 'locked';

export type DynamicPairingCourtStatus = 'pending' | 'completed';

export interface DynamicPairingCourtAssignment {
  courtNumber: number;
  // All 4 players on this court — team1PlayerIds ++ team2PlayerIds, kept
  // as its own field so components that just need "who's on this court"
  // (e.g. building next round's history) don't need to flatten it
  // themselves every time.
  playerIds: string[];
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  // Which entrant(s) (see DynamicPairingEntrant) make up each side — a
  // fixed team occupies its side alone (one id); two individuals paired
  // into a temporary side both appear (two ids). Absent on rounds
  // generated before fixed teams existed, or whenever no fixed team was
  // involved — callers should fall back to treating each id in
  // team1PlayerIds/team2PlayerIds as its own entrant in that case (see
  // entrantIdsForSide in utils/dynamicPairingSocial.ts).
  team1EntrantIds?: string[];
  team2EntrantIds?: string[];
  score1?: number;
  score2?: number;
  winnerTeam?: 1 | 2;
  status: DynamicPairingCourtStatus;
}

export interface DynamicPairingRound {
  id: string;
  roundNumber: number;
  phase: DynamicPairingRoundPhase;
  status: DynamicPairingRoundStatus;
  courts: DynamicPairingCourtAssignment[];
  // Sitting out this round — selected independently of ranking, see
  // selectRestingPlayers. Always the full physical-player list (a resting
  // fixed team contributes both of its members here), so anything reading
  // "who's resting" at the player level keeps working unchanged.
  restingPlayerIds: string[];
  // Entrant-level view of the same rest decision — absent on rounds
  // generated before fixed teams existed. See restingPlayerIds above.
  restingEntrantIds?: string[];
  // Grading rounds only (see generateRotationAwareGradingRound in
  // utils/dynamicPairingSocial.ts) — set only when at least one repeat
  // opponent was genuinely unavoidable while building this round; absent
  // (not an empty string) whenever the round achieved a fully clean,
  // no-repeat schedule.
  rotationNote?: string;
  createdAt: number;
}

// A fixed pair of players who play every Dynamic Pairing Social match
// together and are ranked/graded as a single unit, rather than as two
// independent individuals. Deliberately its own type (not the shared
// `Team` used elsewhere) to keep this mode's isolation boundary intact —
// see the file header of utils/dynamicPairingSocial.ts. A team doesn't own
// a separate roster; it just references two ids already in this session's
// `players` array.
export interface DynamicPairingTeam {
  id: string;
  // Always derived as "PlayerA / PlayerB" (see dynamicPairingTeamDisplayName)
  // rather than a separate user-entered field, matching how fixed teams are
  // built everywhere else in this app.
  playerIds: [string, string];
  rating?: number;
  seed?: number;
  skillLevel?: number;
}

export type DynamicPairingEntrantType = 'individual-player' | 'fixed-team';

// One ranked/scheduled competitor in Dynamic Pairing Social — either a lone
// individual player or a DynamicPairingTeam. This is always a *derived*
// view (see buildDynamicPairingEntrants in utils/dynamicPairingSocial.ts),
// never itself persisted — `players` and `teams` remain the source of
// truth, so there's nothing here that can drift out of sync with them.
export interface DynamicPairingEntrant {
  id: string; // player.id for an individual, team.id for a fixed team
  type: DynamicPairingEntrantType;
  displayName: string;
  playerIds: string[]; // length 1 (individual) or 2 (fixed team)
  seed?: number;
  skillLevel?: number;
  rating?: number;
}

// Conceptual shape of the whole session — documentation only, same as
// TournamentState above: useDynamicPairingSocial actually persists
// `settings`, `players`, and `rounds` as three separate localStorage-backed
// pieces of React state (see that hook) rather than one combined object.
// `stats`, `rankings`, `restHistory`, and `matchHistory` are all derived on
// demand from `players` + `rounds` (calculateDynamicPairingStats /
// calculatePlayerRankings) rather than stored, so there's a single source
// of truth and no risk of them drifting out of sync with the rounds that
// actually happened.
export interface DynamicPairingState {
  settings: DynamicPairingSettings;
  players: Player[];
  stats: DynamicPairingPlayerStats[];
  rounds: DynamicPairingRound[];
  currentRoundNumber: number;
  rankings: DynamicPairingPlayerStats[];
  restHistory: DynamicPairingPlayerStats[];
  matchHistory: DynamicPairingRound[];
}

// One court's slice of a cycle: its 5 players (in A-E letter order), that
// cycle's 5 games, and — once all 5 games are scored — the resulting
// standings and movement preview.
export interface KingCourtCourtCycle {
  courtNumber: number;
  playerIds: string[];
  games: KingCourtGame[];
  standings: KingCourtStanding[];
  movementPreview: KingCourtMovement[];
}

// 'in-progress': games 1-5 still being played (across all courts, in
// lockstep — see currentGameNumber). 'awaiting-movement': every court has
// finished all 5 games and standings/movement previews are computed, but
// the organiser hasn't confirmed movement yet. 'completed': movement
// confirmed, superseded by the next cycle. Only the last cycle in a
// session is ever not 'completed' — mirrors Round['status'] in
// utils/tournament.ts.
export type KingCourtCycleStatus = 'in-progress' | 'awaiting-movement' | 'completed';

export interface KingCourtCycle {
  cycleNumber: number;
  courts: KingCourtCourtCycle[];
  // Shared across every court — all courts play Game 1, then all play
  // Game 2, and so on, together (see the "App flow" walkthrough in the
  // README).
  currentGameNumber: number;
  status: KingCourtCycleStatus;
}

// Aggregated King Court stats for one player across the whole session
// (every cycle so far) — the King Court equivalent of PlayerStats above.
// See computeKingCourtPlayerStats in src/utils/kingCourt.ts.
export interface KingCourtPlayerStats {
  playerId: string;
  totalWins: number;
  totalLosses: number;
  totalPointDifferential: number;
  gamesPlayed: number;
  gamesRested: number;
  // playerId -> number of times partnered together, across all cycles.
  partnerHistory: Record<string, number>;
  // Court number the player was on at the end of each cycle, in order.
  courtHistory: number[];
}

// --- Dynamic Team Qualifier ------------------------------------------------
// A Tournament Mode format (see TournamentFormat above): fixed-partner
// doubles Teams (not individually-paired players) play a dynamic — i.e.
// results-based, not a fixed round-robin pool — qualifying stage with a
// fair rest rotation, then the top 4 teams face off in a small Semis /
// Gold / Bronze medal bracket. A completely separate data model from
// Round/Match/TournamentState *and* from Pools & Knockout's Pool/
// KnockoutBracket — own localStorage keys, own logic file
// (src/utils/dynamicTeamQualifier.ts) and hook
// (src/hooks/useDynamicTeamQualifier.ts). See README.md's "Dynamic Team
// Qualifier" section for the full write-up.

export interface DynamicTeamQualifierSettings {
  divisionName: string;
  numberOfCourts: number;
  // The number of teams the organiser is planning for — a planning target
  // only. The actual schedule is always generated from however many teams
  // are checked in and non-withdrawn when Round 1 starts (see
  // lockRosterAndGenerateSchedule), so this doesn't need to match exactly.
  numberOfTeams: number;
  qualifyingRounds: number;
  qualifyingGameDurationMinutes: number;
  resultBufferMinutes: number;
  // Planning-only echo of the default 18-team/6-court/9-round math (6 games
  // + 3 rests per team) — see calculateQualifyingPlan. The actual per-team
  // rest quota is always derived from the checked-in roster, not read from
  // this field directly.
  gamesPerTeam: number;
  restsPerTeam: number;
  // Only 4 ("Top 4") is implemented in this version — see MedalBracket,
  // whose shape (semifinal1/semifinal2/goldMatch/bronzeMatch) is hardcoded
  // to a 4-team bracket. Kept as a field for forward compatibility.
  bracketSize: number;
  bracketGameTarget: number;
  bracketWinBy: number;
  bracketCap: number;
  // Deterministic seed for every randomised decision in this mode (rest
  // schedule shuffling, Round 1-2 seeded-random pairing, tiebreak ordering)
  // — see makeSeededRandom in utils/dynamicTeamQualifier.ts. Regenerated
  // (not reused) each time the organiser clicks "Regenerate Rest Schedule",
  // so a fresh attempt actually produces a different schedule.
  randomSeed: number;
}

// A fixed doubles competitor for the whole qualifier — the ranking and
// pairing unit (never individual players). Distinct from the shared `Team`
// type above: this mode needs its own fields (teamCode, check-in,
// withdrawal, partner-lock) that don't apply to Leaderboard/Pools &
// Knockout teams.
export interface DynamicTeam {
  id: string;
  // Display identifier assigned in registration order — "T01", "T02", ...
  // — see makeTeamCode. Purely cosmetic/display; `id` is the stable
  // identity used by every reference (RestAssignment, QualifyingMatch, ...).
  teamCode: string;
  // User-entered, or auto-generated from the two player names when left
  // blank (mirrors useTeams' Team.name behaviour).
  displayName: string;
  playerAName: string;
  playerBName: string;
  seed?: number;
  rating?: number;
  checkedIn: boolean;
  // Functional in this version — set any time before Round 1 starts (see
  // "Only checked-in, non-withdrawn teams can be scheduled"). Mid-
  // tournament withdrawal/injury retirement is a future placeholder only —
  // see the disabled "Withdraw Team" control once qualifying has started.
  withdrawn: boolean;
  // Locked (organiser can no longer edit playerAName/playerBName) once this
  // team has a completed qualifying match — see lockPartnersForPlayedTeams.
  // Emergency substitution with an audit trail is a future placeholder.
  partnerLocked: boolean;
}

// One team's scheduled rest for one qualifying round — the full set for
// every round is generated up front (see generateRestSchedule) so the
// organiser can see the whole plan (and All Rounds can show resting teams
// for rounds whose pairings haven't been generated yet) before Round 1
// starts.
export interface RestAssignment {
  teamId: string;
  roundNumber: number;
  // 'schedule': part of the original generated schedule. 'repair': added
  // by a fallback rest-slot swap when a round's pairing would otherwise
  // create an unavoidable repeat matchup — see generateQualifyingPairings.
  source: 'schedule' | 'repair';
  // True once the round it belongs to has been played — a past rest can't
  // be edited by a later repair, only future ones.
  locked: boolean;
}

export type QualifyingMatchStatus = 'pending' | 'completed';

export interface QualifyingMatch {
  id: string;
  roundNumber: number;
  courtNumber: number;
  teamAId: string;
  teamBId: string;
  scoreA?: number;
  scoreB?: number;
  winnerId?: string;
  // The organiser enters the final score directly (e.g. "9-8"), already
  // including any golden point — this flag is a record-keeping marker, not
  // an automatic score transformer.
  goldenPoint: boolean;
  forfeit: boolean;
  status: QualifyingMatchStatus;
  submittedAt?: number;
  // Placeholder for future auth — always undefined in this version.
  submittedBy?: string;
  // Which pairing pass produced this match — bumped whenever a round's
  // pairings are (re)generated, so stale UI state referencing a since-
  // regenerated match can be detected. Always 1 in this version (pairings
  // are never regenerated once published), kept for forward compatibility.
  sourcePairingVersion: number;
}

// 'upcoming': listed (from the rest schedule) but pairings not generated
// yet — pairings depend on standings as of the previous round's close, so
// only Round 1 (and, for the seeded-random Rounds 1-2, arguably Round 2)
// can ever be pre-paired; every later round's `matches` stays empty with
// only `restingTeamIds` populated until generateNextQualifyingRound runs.
// 'current': the single active round, pairings generated, score entry
// open. 'completed': every match scored, organiser has clicked "Close
// Round" but the next round hasn't been generated yet. 'locked': the next
// round has been generated — permanently read-only from here on.
export type QualifyingRoundStatus = 'upcoming' | 'current' | 'completed' | 'locked';

export interface QualifyingRound {
  roundNumber: number;
  stage: 'qualifying';
  startTime?: number;
  durationMinutes: number;
  status: QualifyingRoundStatus;
  restingTeamIds: string[];
  matches: QualifyingMatch[];
}

// Per-team qualifying-stage record, computed fresh from `matches` (never
// stored separately — same "derived, not duplicated" approach as
// DynamicPairingPlayerStats) — see calculateProvisionalStandings /
// calculateFinalStandings in utils/dynamicTeamQualifier.ts.
export interface TeamStanding {
  teamId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  winPercentage: number;
  // Average win % of every opponent this team has faced so far — a
  // strength-of-schedule tiebreaker, see calculateOpponentWinPercentage.
  opponentWinPercentage: number;
  // Sum of each match's per-game differential, capped at +7 for the winner
  // and -7 for the loser — see calculateCappedPointDifferential. The raw
  // score is still stored on QualifyingMatch; only this ranking figure is
  // capped.
  cappedPointDifferential: number;
  totalPointsScored: number;
  restCount: number;
  rank: number;
}

export type MedalBracketMatchLabel = 'semifinal1' | 'semifinal2' | 'gold' | 'bronze';
export type MedalBracketMatchStatus = 'upcoming' | 'current' | 'completed';

export interface MedalBracketMatch {
  id: string;
  label: MedalBracketMatchLabel;
  roundName: string;
  teamAId?: string;
  teamBId?: string;
  scoreA?: number;
  scoreB?: number;
  winnerId?: string;
  loserId?: string;
  status: MedalBracketMatchStatus;
}

// Fixed Semis / Gold / Bronze structure for the top 4 qualifying teams —
// see generateMedalBracket. Unlike Pools & Knockout's generic
// power-of-two KnockoutBracket, this shape is hardcoded to exactly 4 teams
// (matching bracketSize's only supported value in this version): Semifinal
// 1 is Seed 1 vs. Seed 4, Semifinal 2 is Seed 2 vs. Seed 3 — both playable
// at once, unlike a normal single-elimination bracket's strictly one
// "current" match at a time.
export interface MedalBracket {
  semifinal1: MedalBracketMatch;
  semifinal2: MedalBracketMatch;
  goldMatch: MedalBracketMatch;
  bronzeMatch: MedalBracketMatch;
  champion?: string;
  runnerUp?: string;
  thirdPlace?: string;
  fourthPlace?: string;
}

// Placeholder audit trail for future score-correction / substitution /
// withdrawal workflows — recorded but not yet surfaced in any UI beyond
// what's needed for those future features.
export interface AuditEvent {
  id: string;
  actor?: string;
  timestamp: number;
  eventType: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
}

// 'setup' covers both team registration and check-in (the same screen —
// see DynamicTeamQualifierSetup) since there's nothing to structurally
// distinguish "still registering" from "checking teams in" until Round 1
// actually starts. 'qualifying': Rounds 1..N in progress. 'final-standings':
// every qualifying round is locked and final standings are ready to review,
// but the medal bracket hasn't been generated yet. 'medal-bracket': Semis/
// Gold/Bronze in progress. 'complete': Gold and Bronze matches both
// completed.
export type DynamicTeamQualifierStage = 'setup' | 'qualifying' | 'final-standings' | 'medal-bracket' | 'complete';
