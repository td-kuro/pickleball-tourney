import type { KnockoutBracket, Player, Pool, ResultSubmission, ScoreRecordingMode, Team, TournamentSettings, TournamentStage } from '../types';
import {
  addTeamToPool,
  assignPools,
  buildKnockoutBracket,
  canAddTeamMidSession,
  formTeams,
  generatePoolMatches,
  isKnockoutComplete,
  recordKnockoutResult,
  recordPoolMatchResult,
  restoreSkippedPoolMatchesForTeam,
  skipUnplayedPoolMatchesForTeam,
  smallestPool,
} from '../utils/poolsKnockout';
import { useLocalStorage } from './useLocalStorage';

function makeTeamId(): string {
  return `pk-team-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

const TEAMS_KEY = 'pickleball-tourney:pk:teams';
const POOLS_KEY = 'pickleball-tourney:pk:pools';
const BRACKET_KEY = 'pickleball-tourney:pk:bracket';
const STAGE_KEY = 'pickleball-tourney:pk:stage';
const UNAVAILABLE_TEAMS_KEY = 'pickleball-tourney:pk:unavailableTeamIds';

// Manages Pools & Knockout state, persisted to localStorage, completely
// independent of useTournament's rounds/plannedRounds (Leaderboard/Social
// Play) — see src/utils/poolsKnockout.ts for the underlying pure logic.
export function usePoolsKnockout() {
  const [teams, setTeams] = useLocalStorage<Team[]>(TEAMS_KEY, []);
  const [pools, setPools] = useLocalStorage<Pool[]>(POOLS_KEY, []);
  const [bracket, setBracket] = useLocalStorage<KnockoutBracket | null>(BRACKET_KEY, null);
  const [stage, setStage] = useLocalStorage<TournamentStage>(STAGE_KEY, 'setup');
  // Teams the organiser has marked unavailable mid-tournament — see
  // setTeamAvailability. Display/decision state only: whether their pool
  // matches were actually taken off the schedule is recorded on the matches
  // themselves (PoolMatch.skipped).
  const [unavailableTeamIds, setUnavailableTeamIds] = useLocalStorage<string[]>(UNAVAILABLE_TEAMS_KEY, []);

  // Called by "Start Matches" when Pools & Knockout is selected: sources
  // teams from both the declared fixed-teams roster (used directly, so
  // declared pairings/team names carry through to pools and the bracket)
  // and the individual-player roster (auto-paired two at a time — see
  // formTeams) — the same mixed roster every other Doubles mode uses (see
  // ParticipantSetup). Singles has no fixed-teams concept, so it's just
  // formTeams over the full player list, unchanged. Assigns the combined
  // teams evenly to pools, and generates every pool's full round-robin
  // match list up front.
  function startPoolStage(players: Player[], settings: TournamentSettings, fixedTeams: Team[] = []) {
    const pk = settings.poolKnockoutSettings;
    const newTeams = settings.matchType === 'doubles' ? [...fixedTeams, ...formTeams(players, 'doubles')] : formTeams(players, 'singles');
    const newPools = assignPools(newTeams, pk.numberOfPools, pk.teamsPerPool).map((pool) => ({
      ...pool,
      matches: generatePoolMatches(pool.teamIds, pk.timesEachTeamPlays, settings.courts),
    }));
    setTeams(newTeams);
    setPools(newPools);
    setBracket(null);
    setStage('pool-stage');
  }

  // "Add Player Mid-Session" for Pools & Knockout, singles only — see
  // README's "Pools & Knockout mid-session additions". Doubles needs a
  // complete 2-player team, which the shared single-player Add Player
  // modal can't form on its own; the organiser adds a fixed team from
  // Setup instead for that case (see App.tsx's handleAddPlayerMidSessionPoolsKnockout,
  // which returns a clear explanatory reason rather than calling this).
  // Auto-assigns into whichever pool is currently smallest — see
  // smallestPool — since there's no pool-picker in the shared modal.
  function addSinglesTeamMidSession(
    name: string,
    rating: number | undefined,
    settings: TournamentSettings,
  ): { ok: true } | { ok: false; reason: string } {
    const check = canAddTeamMidSession(stage);
    if (!check.ok) return check;
    if (stage === 'setup') {
      return { ok: false, reason: 'Pool stage has not started yet — add this player from the Setup screen instead.' };
    }
    const pool = smallestPool(pools);
    if (!pool) return { ok: false, reason: 'No pool exists to add this player to.' };

    const newTeam: Team = { id: makeTeamId(), name, playerIds: [makeTeamId()], rating, isFixedTeam: false };
    setTeams([...teams, newTeam]);
    setPools(
      pools.map((p) =>
        p.id === pool.id ? addTeamToPool(p, newTeam, settings.poolKnockoutSettings.timesEachTeamPlays, settings.courts) : p,
      ),
    );
    return { ok: true };
  }

  function setPoolMatchResult(poolId: string, matchId: string, result: ResultSubmission) {
    setPools(
      pools.map((pool) =>
        pool.id !== poolId
          ? pool
          : { ...pool, matches: pool.matches.map((match) => (match.id === matchId ? recordPoolMatchResult(match, result) : match)) },
      ),
    );
  }

  // Called once every pool match is complete: seeds the qualified teams
  // and builds the full knockout bracket in one pass.
  function advanceToKnockout(teamsAdvancingPerPool: number, scoreRecordingMode: ScoreRecordingMode) {
    setBracket(buildKnockoutBracket(pools, teamsAdvancingPerPool, scoreRecordingMode));
    setStage('knockout-stage');
  }

  function setKnockoutMatchResult(matchId: string, result: ResultSubmission) {
    if (!bracket) return;
    const updated = recordKnockoutResult(bracket, matchId, result);
    setBracket(updated);
    if (isKnockoutComplete(updated)) setStage('complete');
  }

  // Marks a team (a player, in Singles) unavailable/available again. During
  // the pool stage, `updateSchedule` (only ever true after the organiser
  // confirms — see PoolsKnockoutPage) takes the team's unplayed pool
  // matches off the schedule, or restores them when it returns. Matches
  // with a result are never touched, and once the knockout stage has
  // started nothing is changed automatically at all — the bracket is fixed.
  function setTeamAvailability(teamId: string, available: boolean, updateSchedule: boolean) {
    const nextUnavailable = available ? unavailableTeamIds.filter((id) => id !== teamId) : [...new Set([...unavailableTeamIds, teamId])];
    setUnavailableTeamIds(nextUnavailable);
    if (!updateSchedule || stage !== 'pool-stage') return;
    const unavailableSet = new Set(nextUnavailable);
    setPools(
      pools.map((pool) => {
        if (!pool.teamIds.includes(teamId)) return pool;
        return available ? restoreSkippedPoolMatchesForTeam(pool, teamId, unavailableSet) : skipUnplayedPoolMatchesForTeam(pool, teamId);
      }),
    );
  }

  // Clears every bit of Pools & Knockout state. Called alongside
  // useTournament.resetTournament and usePlayers.removeAllPlayers by
  // App.tsx's "Reset Tournament" handler.
  function resetPoolsKnockout() {
    setTeams([]);
    setPools([]);
    setBracket(null);
    setStage('setup');
    setUnavailableTeamIds([]);
  }

  return {
    teams,
    pools,
    bracket,
    stage,
    startPoolStage,
    setPoolMatchResult,
    advanceToKnockout,
    setKnockoutMatchResult,
    unavailableTeamIds,
    setTeamAvailability,
    addSinglesTeamMidSession,
    resetPoolsKnockout,
  };
}
