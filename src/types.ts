// Core data shapes for the tournament app.

export interface Player {
  id: string;
  name: string;
  rating: number;
}

export type MatchType = 'singles' | 'doubles';

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

export interface Round {
  id: string;
  roundNumber: number;
  matches: Match[];
  // Players sitting out this round (didn't fit on a court, or were
  // selected for a fair bye rotation).
  byePlayerIds: string[];
}

export interface TournamentSettings {
  courts: number;
  matchType: MatchType;
}

export interface TournamentState {
  settings: TournamentSettings;
  rounds: Round[];
}

// Aggregated stats for one player across all rounds played so far.
export interface PlayerStats {
  playerId: string;
  totalPoints: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  byes: number;
}
