import type { Player, Round, SessionAdjustment, SessionAdjustmentType, Team, TournamentSettings } from '../types';
import { generateLeaderboardRound } from '../utils/pairing';
import { DEFAULT_POOL_KNOCKOUT_SETTINGS } from '../utils/poolsKnockout';
import {
  calculateSessionPlan,
  canSwapPlayerInRound,
  DEFAULT_SESSION_TIMING,
  filterSchedulableRoster,
  swapPlayerInRound,
} from '../utils/tournament';
import { useLocalStorage } from './useLocalStorage';

const SETTINGS_KEY = 'pickleball-tourney:settings';
const ROUNDS_KEY = 'pickleball-tourney:rounds';
const PLANNED_ROUNDS_KEY = 'pickleball-tourney:plannedRounds';
const SESSION_ADJUSTMENTS_KEY = 'pickleball-tourney:sessionAdjustments';

function makeAdjustmentId(): string {
  return `adj-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

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
  pairingStyle: 'balanced',
  socialFormat: 'standard-social',
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
    pairingStyle: storedSettings.pairingStyle ?? 'balanced',
    socialFormat: storedSettings.socialFormat ?? 'standard-social',
  };
  const [storedRounds, setRounds] = useLocalStorage<Round[]>(ROUNDS_KEY, []);
  const rounds = normalizeRounds(storedRounds);
  const [plannedRounds, setPlannedRounds] = useLocalStorage<number | null>(PLANNED_ROUNDS_KEY, null);
  // Mid-session change log — Social Play only in practice (nothing sets a
  // player's availabilityStatus or calls the functions below outside a
  // Social Play session — see App.tsx), but kept unconditionally on this
  // hook rather than split out, same rationale as socialScoringMode on
  // TournamentSettings. See README's "Mid-session player and court changes".
  const [sessionAdjustments, setSessionAdjustments] = useLocalStorage<SessionAdjustment[]>(SESSION_ADJUSTMENTS_KEY, []);

  function updateSettings(next: TournamentSettings) {
    setSettings(next);
  }

  function logAdjustment(type: SessionAdjustmentType, fields: Partial<SessionAdjustment> = {}) {
    setSessionAdjustments([
      ...sessionAdjustments,
      { id: makeAdjustmentId(), type, playerIds: [], timestamp: Date.now(), ...fields },
    ]);
  }

  // The one place every round of Leaderboard/Social Play actually gets
  // built, regardless of match type or roster shape (see
  // generateLeaderboardRound in utils/pairing.ts, which picks the right
  // sub-engine) — takes `withSettings` explicitly (rather than closing over
  // the hook's `settings`) so callers that just changed a setting (see
  // changeCourtCount) can generate against the new value in the same
  // synchronous call, without waiting for a re-render.
  function generateRoundWith(
    withSettings: TournamentSettings,
    players: Player[],
    teams: Team[],
    teamPlayers: Player[],
    roundNumber: number,
    priorRounds: Round[],
    status: Round['status'],
  ): Round {
    const pairingStyle =
      withSettings.playMode === 'tournament' && withSettings.tournamentFormat === 'leaderboard' ? withSettings.pairingStyle : 'balanced';
    const { availablePlayers, availableTeams, availableTeamPlayers } = filterSchedulableRoster(players, teams, teamPlayers);
    return generateLeaderboardRound(
      availablePlayers,
      availableTeams,
      availableTeamPlayers,
      withSettings,
      roundNumber,
      priorRounds,
      status,
      pairingStyle,
    );
  }

  // Convenience wrapper for the common case (generate against whatever
  // settings currently are) — startSession/nextRound below.
  function generateRound(
    players: Player[],
    teams: Team[],
    teamPlayers: Player[],
    roundNumber: number,
    priorRounds: Round[],
    status: Round['status'],
  ): Round {
    return generateRoundWith(settings, players, teams, teamPlayers, roundNumber, priorRounds, status);
  }

  // Regenerates exactly `count` fresh 'upcoming' rounds on top of `prefix`
  // (whatever 'completed'/'current' rounds — or, for a current-round
  // regeneration, a freshly-rebuilt current round — precede them),
  // chaining each one off the rounds generated so far for fair bye/matchup
  // rotation. The one tail-building routine every mid-session regenerate
  // function below shares.
  function buildUpcomingTail(
    withSettings: TournamentSettings,
    prefix: Round[],
    count: number,
    players: Player[],
    teams: Team[],
    teamPlayers: Player[],
  ): Round[] {
    let generated = [...prefix];
    for (let i = 0; i < count; i++) {
      generated = [
        ...generated,
        generateRoundWith(withSettings, players, teams, teamPlayers, generated.length + 1, generated, 'upcoming'),
      ];
    }
    return generated;
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
  function startSession(players: Player[], teams: Team[] = [], teamPlayers: Player[] = []) {
    if (settings.playMode !== 'social') {
      setPlannedRounds(null);
      setRounds([generateRound(players, teams, teamPlayers, 1, [], 'current')]);
      return;
    }

    const estimatedRounds = calculateSessionPlan(settings.sessionTiming).estimatedRounds;
    if (estimatedRounds < 1) return;

    const generated: Round[] = [];
    for (let roundNumber = 1; roundNumber <= estimatedRounds; roundNumber++) {
      generated.push(
        generateRound(players, teams, teamPlayers, roundNumber, generated, roundNumber === 1 ? 'current' : 'upcoming'),
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
  function nextRound(players: Player[], teams: Team[] = [], teamPlayers: Player[] = []) {
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

    const newRound = generateRound(players, teams, teamPlayers, withCompleted.length + 1, withCompleted, 'current');
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

  // --- Mid-session player/court changes (Social Play only in practice) ----
  // See README's "Mid-session player and court changes" for the full
  // behaviour writeup. Only ever regenerates rounds still 'upcoming' —
  // 'completed' and 'current' rounds are never silently rewritten, matching
  // every other mode's "lock what's already been played" rule.

  // Regenerates every 'upcoming' round (keeping 'completed'/'current'
  // exactly as they are) — called after a player's availability changes or
  // the court count changes, so future rounds actually reflect the new
  // state.
  function regenerateFutureRounds(players: Player[], teams: Team[] = [], teamPlayers: Player[] = []) {
    if (settings.playMode !== 'social') return;
    const kept = rounds.filter((round) => round.status !== 'upcoming');
    const upcomingCount = rounds.length - kept.length;
    if (upcomingCount === 0) return;

    setRounds(buildUpcomingTail(settings, kept, upcomingCount, players, teams, teamPlayers));
    logAdjustment('future-rounds-regenerated');
  }

  // Regenerates the *current* round itself (in place — same roundNumber),
  // then the upcoming tail after it — only when the organiser explicitly
  // asks for it and it hasn't been scored yet. Used when a mid-round change
  // (a player leaving, a court count change) should apply immediately
  // rather than from next round.
  function regenerateCurrentRound(players: Player[], teams: Team[] = [], teamPlayers: Player[] = []) {
    if (settings.playMode !== 'social') return;
    const currentIndex = rounds.findIndex((round) => round.status === 'current');
    if (currentIndex === -1) return;
    const current = rounds[currentIndex];
    const hasAnyScore = current.matches.some((match) => match.scoreA != null || match.scoreB != null);
    if (hasAnyScore) return;

    const before = rounds.slice(0, currentIndex);
    const freshCurrent = generateRoundWith(settings, players, teams, teamPlayers, current.roundNumber, before, 'current');
    const upcomingCount = rounds.filter((round) => round.status === 'upcoming').length;
    setRounds(buildUpcomingTail(settings, [...before, freshCurrent], upcomingCount, players, teams, teamPlayers));
    logAdjustment('future-rounds-regenerated');
  }

  // "Change Courts": updates the court count, then always regenerates the
  // upcoming tail (future capacity must reflect it) and, only if
  // `regenerateCurrent` is true (organiser confirmed and the current round
  // has no scores yet — see the disabled state on that button in
  // SessionControls), the current round too. Generates against
  // `nextSettings` explicitly (see generateRoundWith) since setSettings
  // above hasn't taken effect in this render yet.
  function changeCourtCount(newCourts: number, players: Player[], teams: Team[], teamPlayers: Player[], regenerateCurrent: boolean) {
    const oldCourts = settings.courts;
    if (newCourts === oldCourts) return;
    const nextSettings = { ...settings, courts: newCourts };
    setSettings(nextSettings);
    logAdjustment('court-count-changed', { oldValue: String(oldCourts), newValue: String(newCourts) });

    if (rounds.length === 0) return;
    const currentIndex = rounds.findIndex((round) => round.status === 'current');
    if (regenerateCurrent && currentIndex !== -1) {
      const current = rounds[currentIndex];
      const hasAnyScore = current.matches.some((match) => match.scoreA != null || match.scoreB != null);
      if (!hasAnyScore) {
        const before = rounds.slice(0, currentIndex);
        const freshCurrent = generateRoundWith(nextSettings, players, teams, teamPlayers, current.roundNumber, before, 'current');
        const upcomingCount = rounds.filter((round) => round.status === 'upcoming').length;
        setRounds(buildUpcomingTail(nextSettings, [...before, freshCurrent], upcomingCount, players, teams, teamPlayers));
        logAdjustment('future-rounds-regenerated');
        return;
      }
    }
    const kept = rounds.filter((round) => round.status !== 'upcoming');
    const upcomingCount = rounds.length - kept.length;
    if (upcomingCount === 0) return;
    setRounds(buildUpcomingTail(nextSettings, kept, upcomingCount, players, teams, teamPlayers));
    logAdjustment('future-rounds-regenerated');
  }

  // Live edit to the current round only (see canSwapPlayerInRound for the
  // full rule set) — an active player currently assigned to an unscored
  // match trades places with a player on bye this round. Never touches any
  // other round.
  function swapPlayerInCurrentRound(activePlayerId: string, byePlayerId: string, teams: Team[] = []) {
    const currentRound = rounds.find((round) => round.status === 'current');
    if (!currentRound) return { ok: false as const, reason: 'No current round.' };
    const check = canSwapPlayerInRound(currentRound, activePlayerId, byePlayerId, teams);
    if (!check.ok) return check;

    setRounds(rounds.map((round) => (round.id === currentRound.id ? swapPlayerInRound(round, activePlayerId, byePlayerId) : round)));
    logAdjustment('player-swapped', { roundNumber: currentRound.roundNumber, playerIds: [activePlayerId, byePlayerId] });
    return { ok: true as const };
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
    setSessionAdjustments([]);
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
    sessionAdjustments,
    regenerateFutureRounds,
    regenerateCurrentRound,
    changeCourtCount,
    swapPlayerInCurrentRound,
  };
}
