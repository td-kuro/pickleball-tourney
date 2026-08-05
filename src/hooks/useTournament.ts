import type { Player, Round, TournamentSettings } from '../types';
import { calculateSessionPlan, createRound, DEFAULT_SESSION_TIMING } from '../utils/tournament';
import { useLocalStorage } from './useLocalStorage';

const SETTINGS_KEY = 'pickleball-tourney:settings';
const ROUNDS_KEY = 'pickleball-tourney:rounds';
const PLANNED_ROUNDS_KEY = 'pickleball-tourney:plannedRounds';

const defaultSettings: TournamentSettings = {
  playMode: 'tournament',
  socialScoringMode: 'scoresAndWins',
  courts: 1,
  matchType: 'singles',
  sessionTiming: DEFAULT_SESSION_TIMING,
};

// Manages tournament settings and rounds, persisted to localStorage.
// Round pairing logic itself lives in src/utils/tournament.ts.
export function useTournament() {
  const [storedSettings, setSettings] = useLocalStorage<TournamentSettings>(SETTINGS_KEY, defaultSettings);
  // Backfills sessionTiming for settings saved by a version of the app from
  // before Session Timing existed — localStorage only falls back to
  // defaultSettings when nothing is stored at all, so an old settings
  // object read back in would otherwise have `sessionTiming: undefined`
  // and crash validateSessionTiming/calculateSessionPlan.
  const settings: TournamentSettings = {
    ...storedSettings,
    sessionTiming: storedSettings.sessionTiming ?? DEFAULT_SESSION_TIMING,
  };
  const [rounds, setRounds] = useLocalStorage<Round[]>(ROUNDS_KEY, []);
  const [plannedRounds, setPlannedRounds] = useLocalStorage<number | null>(PLANNED_ROUNDS_KEY, null);

  function updateSettings(next: TournamentSettings) {
    setSettings(next);
  }

  function generateRound(players: Player[]) {
    const round = createRound(players, settings, rounds.length + 1, rounds);
    setRounds([...rounds, round]);
  }

  // Called by "Start Matches": snapshots the estimated round count from the
  // current Session Timing settings (Social Play only) so later edits to
  // those settings don't retroactively change an in-progress session's
  // target, then generates Round 1.
  function startSession(players: Player[]) {
    setPlannedRounds(settings.playMode === 'social' ? calculateSessionPlan(settings.sessionTiming).estimatedRounds : null);
    generateRound(players);
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
    setPlannedRounds(null);
  }

  return {
    settings,
    updateSettings,
    rounds,
    plannedRounds,
    generateRound,
    startSession,
    setMatchScore,
    resetTournament,
  };
}
