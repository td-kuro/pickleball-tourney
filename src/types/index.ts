// Core data shapes for the tournament app.
// These are intentionally simple placeholders: the setup screens (players,
// rules) use them today, and the future round-generation engine will build
// on top of them without needing UI changes.

export interface Player {
  id: string;
  name: string;
  rating: number;
}

// A single match between two teams. Supports both singles (1 player per
// team) and doubles (2 players per team) by storing player id arrays.
export interface Match {
  id: string;
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  team1Score?: number;
  team2Score?: number;
  winner?: 1 | 2;
}

export interface Round {
  id: string;
  roundNumber: number;
  matches: Match[];
  isComplete: boolean;
}

// Placeholder for future configuration such as scoring format,
// number of courts, or how players are paired each round.
export interface TournamentRule {
  id: string;
  name: string;
  description: string;
}

// The full state the tournament engine will operate on once it exists.
export interface TournamentState {
  players: Player[];
  rules: TournamentRule[];
  rounds: Round[];
  currentRoundNumber: number;
}
