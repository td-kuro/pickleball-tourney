// Core data shapes for the tournament app.

export interface Player {
  id: string;
  name: string;
  // Optional: a player can be added without a rating ("Unrated"). Used for
  // leaderboard sort tie-breaking only when present.
  rating?: number;
}

export type MatchType = 'singles' | 'doubles';

// Tournament Mode is competitive (points/wins/losses, ranked leaderboard).
// Social Play Mode is casual — same fair rotation/pairing engine, but
// ranking is de-emphasised and scoring is configurable (see
// SocialScoringMode).
export type PlayMode = 'tournament' | 'social';

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
  // selected for a fair bye rotation).
  byePlayerIds: string[];
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
}

// --- Pools & Knockout ------------------------------------------------------
// A fixed competitor for the whole tournament (unlike the ad-hoc MatchSide
// pairing used by Leaderboard/Social Play's rotating rounds). One player in
// Singles, two in Doubles — see formTeams in utils/poolsKnockout.ts.
export interface Team {
  id: string;
  name: string;
  playerIds: string[];
  rating?: number;
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
