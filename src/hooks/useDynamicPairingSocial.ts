import type { DynamicPairingRound, DynamicPairingSettings, Player, PlayerAvailabilityStatus } from '../types';
import {
  canGenerateDynamicPairingRound,
  generateDynamicPairingRound,
  generateInitialGradingRounds,
  isAwaitingSkillReview,
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
  // True once the pre-generated grading batch is fully played and Round 4+
  // hasn't been generated yet — see isAwaitingSkillReview. Gates showing
  // DynamicPairingAdminSkillReview in place of Current Round.
  const awaitingSkillReview = isAwaitingSkillReview(rounds, settings);

  function updateSettings(next: DynamicPairingSettings) {
    setSettings(next);
  }

  function addPlayer(name: string, rating?: number, startingSeed?: number) {
    setPlayers([
      ...players,
      { id: makePlayerId(), name, rating, startingSeed, availabilityStatus: 'available' },
    ]);
  }

  // Quickly generates `count` empty player slots (named "Player N") so the
  // organiser can fill in names/ratings/seeds afterward instead of adding
  // one by one — mirrors usePlayers' addPlayersBulk, adapted for this
  // roster's own shape (availabilityStatus defaults to 'available', same
  // as addPlayer above).
  function addPlayersBulk(count: number) {
    const startNumber = players.length + 1;
    const newPlayers: Player[] = Array.from({ length: count }, (_, i) => ({
      id: makePlayerId(i),
      name: `Player ${startNumber + i}`,
      availabilityStatus: 'available',
    }));
    setPlayers([...players, ...newPlayers]);
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

  // "Start Matches" for Dynamic Pairing Social: pre-generates the entire
  // grading batch (Round 1 through settings.gradingRounds) up front, so
  // All Rounds shows the whole planned schedule immediately — see
  // generateInitialGradingRounds. Only Round 1 is playable to start; the
  // rest are 'upcoming' until generateNextRound activates them in order.
  function startSession() {
    setRounds(generateInitialGradingRounds(players, settings));
  }

  // Advances past the current round once every court is scored. Three
  // cases, mirrored by nextRoundButtonLabel so the button text always
  // matches what this actually does:
  // 1. A pre-generated grading round is waiting (Round 2 or 3) — just
  //    activate it, no generation needed.
  // 2. This was the last grading round — lock it and stop. No round is
  //    'current' after this, which is exactly what makes
  //    isAwaitingSkillReview true; DynamicPairingAdminSkillReview takes it
  //    from here via confirmSkillReviewAndStartRankingRounds.
  // 3. Otherwise (Round 4+, already past skill review) — generate a fresh
  //    ranking round, same as this app always has.
  function generateNextRound() {
    if (!currentRound) return;
    const check = canGenerateDynamicPairingRound(players, settings, currentRound);
    if (!check.ok) return;

    const locked = rounds.map((r) => (r.id === currentRound.id ? lockCompletedRound(r) : r));

    const upcoming = locked.find((r) => r.roundNumber === currentRound.roundNumber + 1 && r.status === 'upcoming');
    if (upcoming) {
      setRounds(locked.map((r) => (r.id === upcoming.id ? { ...r, status: 'current' } : r)));
      return;
    }

    if (currentRound.phase === 'grading') {
      setRounds(locked);
      return;
    }

    const nextRound = generateDynamicPairingRound(players, settings, locked);
    setRounds([...locked, nextRound]);
  }

  // Confirms Admin Skill Review and generates Round 4 — the first round to
  // use real ranking-based pairing (see generateDynamicPairingRound's
  // 'ranking' phase). Setting skill levels beforehand is optional (see
  // updatePlayerSkillLevel); only reaching and clicking Confirm is
  // required to unblock Round 4.
  function confirmSkillReviewAndStartRankingRounds() {
    if (!awaitingSkillReview) return;
    const check = canGenerateDynamicPairingRound(players, settings, undefined);
    if (!check.ok) return;
    const nextRound = generateDynamicPairingRound(players, settings, rounds);
    setRounds([...rounds, nextRound]);
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
    addPlayersBulk,
    updatePlayer,
    updatePlayerSkillLevel,
    removePlayer,
    removeAllPlayers,
    rounds,
    currentRound,
    started,
    gradingPhaseComplete,
    awaitingSkillReview,
    startSession,
    generateNextRound,
    confirmSkillReviewAndStartRankingRounds,
    setCourtScore,
    resetDynamicPairing,
  };
}
