// Core data shapes for the tournament app.

export interface Player {
  id: string;
  name: string;
  // Optional: a player can be added without a rating ("Unrated"). Used for
  // leaderboard sort tie-breaking only when present.
  rating?: number;
}

export type MatchType = 'singles' | 'doubles';

// Only meaningful when MatchType is 'doubles':
// - 'rotating-players': the original behaviour — partners and opponents
//   are re-formed every round for fair variety (see createRound).
// - 'fixed-teams': pre-declared 2-player Teams (see Team below) stay
//   together for the whole tournament/session — only the opponent
//   rotates. See createFixedTeamRound in utils/tournament.ts.
export type DoublesPairingMode = 'rotating-players' | 'fixed-teams';

// Tournament Mode is competitive (points/wins/losses, ranked leaderboard).
// Social Play Mode is casual — same fair rotation/pairing engine, but
// ranking is de-emphasised and scoring is configurable (see
// SocialScoringMode). King Court Mode is a third, structurally separate
// mode — fixed 5-player courts running 5-game cycles with rank-based
// movement between courts — see src/utils/kingCourt.ts and
// src/hooks/useKingCourt.ts; it doesn't use Round/Match/TournamentState at
// all.
export type PlayMode = 'tournament' | 'social' | 'king-court-5';

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
export type TournamentFormat = 'leaderboard' | 'pools-knockout';

export interface PoolKnockoutSettings {
  numberOfPools: number;
  teamsPerPool: number;
  // How many times each pair of teams in a pool plays each other, e.g. 2 =
  // every pool match is played home-and-away.
  timesEachTeamPlays: number;
  teamsAdvancingPerPool: number;
}

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
  // Always present, even in Singles (where it's ignored) — same rationale.
  doublesPairingMode: DoublesPairingMode;
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
  totalPoints: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  byes: number;
  // Unique player ids this player has had as a doubles teammate / has
  // faced as an opponent (singles or doubles), across all rounds so far.
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
