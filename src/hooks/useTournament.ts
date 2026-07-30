import type { Player, Round, TournamentSettings } from '../types';
import { createRound } from '../utils/tournament';
import { useLocalStorage } from './useLocalStorage';

const SETTINGS_KEY = 'pickleball-tourney:settings';
const ROUNDS_KEY = 'pickleball-tourney:rounds';

const defaultSettings: TournamentSettings = {
  playMode: 'tournament',
  socialScoringMode: 'scoresAndWins',
  courts: 1,
  matchType: 'singles',
};

// Manages tournament settings and rounds, persisted to localStorage.
// Round pairing logic itself lives in src/utils/tournament.ts.
export function useTournament() {
  const [settings, setSettings] = useLocalStorage<TournamentSettings>(SETTINGS_KEY, defaultSettings);
  const [rounds, setRounds] = useLocalStorage<Round[]>(ROUNDS_KEY, []);

  function updateSettings(next: TournamentSettings) {
    setSettings(next);
  }

  function generateRound(players: Player[]) {
    const round = createRound(players, settings, rounds.length + 1, rounds);
    setRounds([...rounds, round]);
  }

  function setMatchScore(roundId: string, matchId: string, scoreA: number, scoreB: number) {
    setRounds(
      rounds.map((round) =>
        round.id !== roundId
          ? round
          : {
              ...round,
              matches: round.matches.map((match) =>
                match.id === matchId ? { ...match, scoreA, scoreB } : match,
              ),
            },
      ),
    );
  }

  // Clears all rounds/results so the app falls back to the Setup screen.
  // Players and tournament settings (courts/match type) are left as-is.
  function resetTournament() {
    setRounds([]);
  }

  return { settings, updateSettings, rounds, generateRound, setMatchScore, resetTournament };
}
