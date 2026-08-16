import type { DynamicPairingRound, DynamicPairingSettings, Player, PlayerAvailabilityStatus } from '../types';
import {
  canGenerateDynamicPairingRound,
  generateDynamicPairingRound,
  isGradingPhaseComplete,
  lockCompletedRound,
  processDynamicPairingScore,
} from '../utils/dynamicPairingSocial';
import { useLocalStorage } from './useLocalStorage';

const SETTINGS_KEY = 'pickleball-tourney:dp:settings';
const PLAYERS_KEY = 'pickleball-tourney:dp:players';
const ROUNDS_KEY = 'pickleball-tourney:dp:rounds';

export const DEFAULT_DYNAMIC_PAIRING_SETTINGS: DynamicPairingSettings = {
  sessionName: '',
  numberOfCourts: 6,
  gradingRounds: 3,
  gameFormat: 'first-to-score',
  winningScore: 11,
  gameDurationMinutes: 15,
  // Recommended default: unrestricted while grading is establishing
  // rankings, then Max 1 Court once real results are driving movement —
  // see generateDynamicPairingRound, which only applies this during the
  // 'ranking' phase in the first place.
  maxCourtMovement: 'max-1',
  scoreConfirmationRequired: false,
};

function makePlayerId(salt = 0): string {
  return `dp-player-${Date.now()}-${salt}-${Math.floor(Math.random() * 10000)}`;
}

// Dynamic Pairing Social's own player roster, settings, and round history —
// entirely separate from usePlayers/useTeams/useTournament (own
// localStorage keys, own shape) so this format can't affect, or be
// affected by, any other mode. See utils/dynamicPairingSocial.ts for the
// pairing/ranking/rest logic this hook drives.
export function useDynamicPairingSocial() {
  const [settings, setSettings] = useLocalStorage<DynamicPairingSettings>(SETTINGS_KEY, DEFAULT_DYNAMIC_PAIRING_SETTINGS);
  const [players, setPlayers] = useLocalStorage<Player[]>(PLAYERS_KEY, []);
  const [rounds, setRounds] = useLocalStorage<DynamicPairingRound[]>(ROUNDS_KEY, []);

  const started = rounds.length > 0;
  const currentRound = rounds.find((r) => r.status === 'current');
  // Gates the "Set Skill Levels" UI on the Setup tab — see
  // isGradingPhaseComplete and Player.skillLevel.
  const gradingPhaseComplete = isGradingPhaseComplete(rounds, settings);

  function updateSettings(next: DynamicPairingSettings) {
    setSettings(next);
  }

  function addPlayer(name: string, rating?: number, startingSeed?: number) {
    setPlayers([
      ...players,
      { id: makePlayerId(), name, rating, startingSeed, availabilityStatus: 'available' },
    ]);
  }

  function updatePlayer(
    id: string,
    name: string,
    rating?: number,
    startingSeed?: number,
    availabilityStatus?: PlayerAvailabilityStatus,
  ) {
    setPlayers(
      players.map((p) => (p.id === id ? { ...p, name, rating, startingSeed, availabilityStatus } : p)),
    );
  }

  // Skill level is deliberately its own setter, separate from updatePlayer:
  // it's only meaningful (and only editable in the UI) once
  // gradingPhaseComplete is true, unlike name/rating/startingSeed/
  // availabilityStatus which have their own timing rules.
  function updatePlayerSkillLevel(id: string, skillLevel?: number) {
    setPlayers(players.map((p) => (p.id === id ? { ...p, skillLevel } : p)));
  }

  function removePlayer(id: string) {
    setPlayers(players.filter((p) => p.id !== id));
  }

  function removeAllPlayers() {
    setPlayers([]);
  }

  // "Start Matches" for Dynamic Pairing Social: generates Round 1 (always
  // a grading round, unless gradingRounds is 0). Rounds are generated one
  // at a time (like Tournament Mode's Leaderboard format), not
  // pre-planned, since each round's fair allocation depends on the
  // previous one's actual results.
  function startSession() {
    setRounds([generateDynamicPairingRound(players, settings, [])]);
  }

  // Locks the current round read-only, then generates the next one —
  // see generateDynamicPairingRound and README's "Next round generation
  // flow" for the full sequence this delegates to.
  function generateNextRound() {
    if (!currentRound) return;
    const check = canGenerateDynamicPairingRound(players, settings, currentRound);
    if (!check.ok) return;

    const locked = rounds.map((r) => (r.id === currentRound.id ? lockCompletedRound(r) : r));
    const nextRound = generateDynamicPairingRound(players, settings, locked);
    setRounds([...locked, nextRound]);
  }

  function setCourtScore(roundId: string, courtNumber: number, score1: number, score2: number) {
    setRounds(
      rounds.map((round) => (round.id === roundId ? processDynamicPairingScore(round, courtNumber, score1, score2) : round)),
    );
  }

  // Full session wipe for "Reset Dynamic Pairing Social" — clears the
  // roster, settings, and every round/score/stat (stats/rankings are
  // derived from rounds, so clearing rounds clears them too).
  function resetDynamicPairing() {
    setSettings(DEFAULT_DYNAMIC_PAIRING_SETTINGS);
    setPlayers([]);
    setRounds([]);
  }

  return {
    settings,
    updateSettings,
    players,
    addPlayer,
    updatePlayer,
    updatePlayerSkillLevel,
    removePlayer,
    removeAllPlayers,
    rounds,
    currentRound,
    started,
    gradingPhaseComplete,
    startSession,
    generateNextRound,
    setCourtScore,
    resetDynamicPairing,
  };
}
