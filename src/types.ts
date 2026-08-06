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

// One side of a match: 1 player id for singles, 2 for doubles.
export interface Team {
  playerIds: string[];
}

export interface Match {
  id: string;
  court: number;
  teamA: Team;
  teamB: Team;
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

export interface TournamentSettings {
  playMode: PlayMode;
  // Always present (even in Tournament Mode, where it's ignored) so
  // components don't need to deal with an optional field.
  socialScoringMode: SocialScoringMode;
  courts: number;
  matchType: MatchType;
  sessionTiming: SessionTiming;
}

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
