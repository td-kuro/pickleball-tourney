import type { KnockoutBracket, Player, Pool, Team, TournamentSettings, TournamentStage } from '../types';
import {
  assignPools,
  buildKnockoutBracket,
  formTeams,
  generatePoolMatches,
  isKnockoutComplete,
  recordKnockoutScore,
} from '../utils/poolsKnockout';
import { useLocalStorage } from './useLocalStorage';

const TEAMS_KEY = 'pickleball-tourney:pk:teams';
const POOLS_KEY = 'pickleball-tourney:pk:pools';
const BRACKET_KEY = 'pickleball-tourney:pk:bracket';
const STAGE_KEY = 'pickleball-tourney:pk:stage';

// Manages Pools & Knockout state, persisted to localStorage, completely
// independent of useTournament's rounds/plannedRounds (Leaderboard/Social
// Play) — see src/utils/poolsKnockout.ts for the underlying pure logic.
export function usePoolsKnockout() {
  const [teams, setTeams] = useLocalStorage<Team[]>(TEAMS_KEY, []);
  const [pools, setPools] = useLocalStorage<Pool[]>(POOLS_KEY, []);
  const [bracket, setBracket] = useLocalStorage<KnockoutBracket | null>(BRACKET_KEY, null);
  const [stage, setStage] = useLocalStorage<TournamentStage>(STAGE_KEY, 'setup');

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

  function setPoolMatchScore(poolId: string, matchId: string, scoreA: number, scoreB: number) {
    setPools(
      pools.map((pool) =>
        pool.id !== poolId
          ? pool
          : { ...pool, matches: pool.matches.map((match) => (match.id === matchId ? { ...match, scoreA, scoreB } : match)) },
      ),
    );
  }

  // Called once every pool match is complete: seeds the qualified teams
  // and builds the full knockout bracket in one pass.
  function advanceToKnockout(teamsAdvancingPerPool: number) {
    setBracket(buildKnockoutBracket(pools, teamsAdvancingPerPool));
    setStage('knockout-stage');
  }

  function setKnockoutMatchScore(matchId: string, scoreA: number, scoreB: number) {
    if (!bracket) return;
    const updated = recordKnockoutScore(bracket, matchId, scoreA, scoreB);
    setBracket(updated);
    if (isKnockoutComplete(updated)) setStage('complete');
  }

  // Clears every bit of Pools & Knockout state. Called alongside
  // useTournament.resetTournament and usePlayers.removeAllPlayers by
  // App.tsx's "Reset Tournament" handler.
  function resetPoolsKnockout() {
    setTeams([]);
    setPools([]);
    setBracket(null);
    setStage('setup');
  }

  return {
    teams,
    pools,
    bracket,
    stage,
    startPoolStage,
    setPoolMatchScore,
    advanceToKnockout,
    setKnockoutMatchScore,
    resetPoolsKnockout,
  };
}
