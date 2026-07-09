// Tournament engine placeholder.
//
// This module will hold the actual pairing/scheduling logic (who plays whom,
// how standings update after each round, etc). It is kept separate from the
// components in src/components so the UI never needs to change when the
// real algorithm is implemented here later.

import type { Player, Round, TournamentRule, TournamentState } from '../types';

export function createInitialTournamentState(
  players: Player[],
  rules: TournamentRule[] = [],
): TournamentState {
  return {
    players,
    rules,
    rounds: [],
    currentRoundNumber: 0,
  };
}

// Will generate the first round of matches from the current player list
// and rules (e.g. rating-based pairing).
export function generateFirstRound(_state: TournamentState): Round {
  throw new Error('generateFirstRound is not implemented yet');
}

// Will generate the next round based on the results of previous rounds.
export function generateNextRound(_state: TournamentState): Round {
  throw new Error('generateNextRound is not implemented yet');
}

// Will record a match result and return the updated tournament state.
export function recordMatchResult(
  _state: TournamentState,
  _matchId: string,
  _team1Score: number,
  _team2Score: number,
): TournamentState {
  throw new Error('recordMatchResult is not implemented yet');
}
