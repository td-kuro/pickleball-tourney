import type { Player, Round, Team, TournamentSettings } from '../types';
import { DEFAULT_POOL_KNOCKOUT_SETTINGS } from '../utils/poolsKnockout';
import {
  calculateSessionPlan,
  createFixedTeamRound,
  createRound,
  DEFAULT_SESSION_TIMING,
  isFixedTeamsMode,
} from '../utils/tournament';
import { useLocalStorage } from './useLocalStorage';

const SETTINGS_KEY = 'pickleball-tourney:settings';
const ROUNDS_KEY = 'pickleball-tourney:rounds';
const PLANNED_ROUNDS_KEY = 'pickleball-tourney:plannedRounds';

const defaultSettings: TournamentSettings = {
  playMode: 'tournament',
  socialScoringMode: 'scoresAndWins',
  courts: 1,
  // Doubles is the default match type — most pickleball is doubles, and
  // it's the format that benefits most from this app's fair rotation.
  matchType: 'doubles',
  sessionTiming: DEFAULT_SESSION_TIMING,
  tournamentFormat: 'leaderboard',
  poolKnockoutSettings: DEFAULT_POOL_KNOCKOUT_SETTINGS,
  doublesPairingMode: 'rotating-players',
};

// Backfills `status` for rounds saved by a version of the app from before
// round status existed: the last round becomes "current" (mirroring the
// old "last round in the array is the active one" behaviour) and every
// round before it becomes "completed".
function normalizeRounds(rounds: Round[]): Round[] {
  if (rounds.length === 0 || rounds.every((round) => round.status)) return rounds;
  return rounds.map((round, index) => ({
    ...round,
    status: round.status ?? (index === rounds.length - 1 ? 'current' : 'completed'),
  }));
}

// Manages tournament settings and rounds, persisted to localStorage.
// Round pairing logic itself lives in src/utils/tournament.ts.
export function useTournament() {
  const [storedSettings, setSettings] = useLocalStorage<TournamentSettings>(SETTINGS_KEY, defaultSettings);
  // Backfills fields for settings saved by an older version of the app —
  // localStorage only falls back to defaultSettings when nothing is stored
  // at all, so an old settings object read back in would otherwise be
  // missing whichever fields didn't exist yet and crash downstream code
  // that assumes they're always present.
  const settings: TournamentSettings = {
    ...storedSettings,
    sessionTiming: storedSettings.sessionTiming ?? DEFAULT_SESSION_TIMING,
    tournamentFormat: storedSettings.tournamentFormat ?? 'leaderboard',
    poolKnockoutSettings: storedSettings.poolKnockoutSettings ?? DEFAULT_POOL_KNOCKOUT_SETTINGS,
    doublesPairingMode: storedSettings.doublesPairingMode ?? 'rotating-players',
  };
  const [storedRounds, setRounds] = useLocalStorage<Round[]>(ROUNDS_KEY, []);
  const rounds = normalizeRounds(storedRounds);
  const [plannedRounds, setPlannedRounds] = useLocalStorage<number | null>(PLANNED_ROUNDS_KEY, null);

  function updateSettings(next: TournamentSettings) {
    setSettings(next);
  }

  // Doubles + Fixed Teams uses createFixedTeamRound (teams stay together,
  // only the opponent rotates); everything else uses createRound
  // (Singles, or Doubles + Rotating Players, which re-forms partnerships
  // every round). `teams` is only used in the former case.
  function generateRound(
    players: Player[],
    teams: Team[],
    roundNumber: number,
    priorRounds: Round[],
    status: Round['status'],
  ): Round {
    return isFixedTeamsMode(settings)
      ? createFixedTeamRound(teams, settings, roundNumber, priorRounds, status)
      : createRound(players, settings, roundNumber, priorRounds, status);
  }

  // Called by "Start Matches". Tournament Mode isn't time-boxed, so it just
  // generates Round 1. Social Play is: the pairing engine only needs to
  // know who played/sat out each round, not match results, so the entire
  // session's schedule can be generated up front — every round from 1 to
  // the session's estimated round count is created in one pass (each using
  // the previously-generated rounds as history, for fair bye/matchup
  // rotation across the whole session), Round 1 is marked "current", and
  // the rest are "upcoming" placeholders that already hold their real
  // matchups.
  function startSession(players: Player[], teams: Team[] = []) {
    if (settings.playMode !== 'social') {
      setPlannedRounds(null);
      setRounds([generateRound(players, teams, 1, [], 'current')]);
      return;
    }

    const estimatedRounds = calculateSessionPlan(settings.sessionTiming).estimatedRounds;
    if (estimatedRounds < 1) return;

    const generated: Round[] = [];
    for (let roundNumber = 1; roundNumber <= estimatedRounds; roundNumber++) {
      generated.push(
        generateRound(players, teams, roundNumber, generated, roundNumber === 1 ? 'current' : 'upcoming'),
      );
    }
    setPlannedRounds(estimatedRounds);
    setRounds(generated);
  }

  // Called by "Next Round"/"Generate Extra Round": marks the active round
  // completed, then either promotes the next pre-generated "upcoming"
  // round to "current" (Social Play, still within the planned schedule) or
  // generates a brand new round (Tournament Mode, which never pre-plans;
  // or Social Play once it's run past its planned rounds).
  function nextRound(players: Player[], teams: Team[] = []) {
    const currentIndex = rounds.findIndex((round) => round.status === 'current');
    if (currentIndex === -1) return;

    const withCompleted = rounds.map((round, index) =>
      index === currentIndex ? { ...round, status: 'completed' as const } : round,
    );

    const upcomingIndex = withCompleted.findIndex((round) => round.status === 'upcoming');
    if (upcomingIndex !== -1) {
      setRounds(
        withCompleted.map((round, index) =>
          index === upcomingIndex ? { ...round, status: 'current' as const } : round,
        ),
      );
      return;
    }

    const newRound = generateRound(players, teams, withCompleted.length + 1, withCompleted, 'current');
    setRounds([...withCompleted, newRound]);
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

  // Full session wipe for "Reset Tournament"/"Reset Social Play": clears
  // rounds, the planned-rounds target, and every setting back to its
  // default (play mode, social scoring mode, courts, match type, session
  // timing) so the app falls back to a pristine Setup screen. Players are
  // a separate concern — see usePlayers.removeAllPlayers, which App.tsx
  // calls alongside this.
  function resetTournament() {
    setSettings(defaultSettings);
    setRounds([]);
    setPlannedRounds(null);
  }

  return {
    settings,
    updateSettings,
    rounds,
    plannedRounds,
    nextRound,
    startSession,
    setMatchScore,
    resetTournament,
  };
}
