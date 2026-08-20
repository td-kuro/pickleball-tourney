import type { KingCourtCycle, KingCourtPlayerAssignment, Player, SessionAdjustment, SessionAdjustmentType } from '../types';
import {
  applyCourtMovement,
  applyMovementDirections,
  buildKingCourtPartnerHistory,
  calculateCourtStandings,
  generateMovementPreview,
  generateNextKingCourtCycle,
  isCourtFull,
  isCurrentGameComplete,
  substitutePlayerInCycle,
  validateNextCycleAssignments,
} from '../utils/kingCourt';
import { useLocalStorage } from './useLocalStorage';

const COURTS_KEY = 'pickleball-tourney:kc:numberOfCourts';
const ASSIGNMENTS_KEY = 'pickleball-tourney:kc:assignments';
const CYCLES_KEY = 'pickleball-tourney:kc:cycles';
const SESSION_ADJUSTMENTS_KEY = 'pickleball-tourney:kc:sessionAdjustments';

const DEFAULT_COURTS = 2;

function makeAdjustmentId(): string {
  return `kc-adj-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// Manages 5-Player King Court Mode state, persisted to localStorage,
// completely independent of useTournament's rounds/plannedRounds and
// usePoolsKnockout's pools/bracket — see src/utils/kingCourt.ts for the
// underlying pure logic. Reuses usePlayers's roster directly (see App.tsx)
// rather than keeping a separate player list.
export function useKingCourt() {
  const [numberOfCourts, setNumberOfCourts] = useLocalStorage<number>(COURTS_KEY, DEFAULT_COURTS);
  const [assignments, setAssignments] = useLocalStorage<KingCourtPlayerAssignment[]>(ASSIGNMENTS_KEY, []);
  const [cycles, setCycles] = useLocalStorage<KingCourtCycle[]>(CYCLES_KEY, []);
  const [sessionAdjustments, setSessionAdjustments] = useLocalStorage<SessionAdjustment[]>(SESSION_ADJUSTMENTS_KEY, []);

  const started = cycles.length > 0;
  const currentCycle = cycles.length > 0 ? cycles[cycles.length - 1] : null;

  function logAdjustment(type: SessionAdjustmentType, fields: Partial<SessionAdjustment> = {}) {
    setSessionAdjustments([
      ...sessionAdjustments,
      { id: makeAdjustmentId(), type, playerIds: [], timestamp: Date.now(), ...fields },
    ]);
  }

  // Mid-session "Change Courts" — a thin wrapper over the plain
  // setNumberOfCourts setter (still used as-is by pre-session Setup, which
  // shouldn't log a session adjustment) that also records the change. Takes
  // effect at the next cycle boundary: confirmMovementAndAdvance's
  // validateNextCycleAssignments check is what actually enforces "every
  // court still has exactly 5" once the organiser gets there — this just
  // updates the target and the court-option range the Movement Preview's
  // per-player override offers.
  function changeCourtsSession(newCourts: number) {
    if (newCourts === numberOfCourts) return;
    logAdjustment('court-count-changed', { oldValue: String(numberOfCourts), newValue: String(newCourts) });
    setNumberOfCourts(newCourts);
  }

  // --- Seeding (pre-Cycle-1) ----------------------------------------------

  // Backstop against a full court even if a caller skips CourtSeeding's own
  // isCourtFull check (which is what actually shows the organiser the
  // "Court full" message) — silently no-ops here rather than overwriting
  // or bumping an existing player, per the King Court capacity rule.
  function assignPlayerToCourt(playerId: string, courtNumber: number | null) {
    if (courtNumber != null && isCourtFull(assignments, courtNumber, playerId)) return;
    const withoutPlayer = assignments.filter((a) => a.playerId !== playerId);
    setAssignments(courtNumber == null ? withoutPlayer : [...withoutPlayer, { playerId, courtNumber }]);
  }

  // Swaps a player with their neighbour within one court's seeding order
  // (the order CourtSeeding displays each court's slots in, and — for
  // Cycle 1, which has no partner history yet — the exact order
  // generateNextKingCourtCycle/assignPlayersToLetters falls back to for
  // A-E assignment, so this has a real effect on Game 1's pairings).
  function reorderPlayerInCourt(courtNumber: number, playerId: string, direction: -1 | 1) {
    const courtIndices = assignments.map((_, index) => index).filter((index) => assignments[index].courtNumber === courtNumber);
    const currentPos = courtIndices.findIndex((index) => assignments[index].playerId === playerId);
    const targetPos = currentPos + direction;
    if (currentPos === -1 || targetPos < 0 || targetPos >= courtIndices.length) return;

    const currentIndex = courtIndices[currentPos];
    const targetIndex = courtIndices[targetPos];
    const next = [...assignments];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    setAssignments(next);
  }

  // Drops assignments for any player id no longer in the roster, and
  // clamps out-of-range court numbers — called when the roster or court
  // count changes so stale seeding data can't linger.
  function pruneAssignments(players: Player[]) {
    const validIds = new Set(players.map((p) => p.id));
    const pruned = assignments.filter((a) => validIds.has(a.playerId) && a.courtNumber >= 1 && a.courtNumber <= numberOfCourts);
    if (pruned.length !== assignments.length) setAssignments(pruned);
  }

  function startCycle1(players: Player[]) {
    const cycle1 = generateNextKingCourtCycle(assignments, players, 1, {});
    setCycles([cycle1]);
  }

  // --- Scoring / game progression ------------------------------------------

  function setGameScore(courtNumber: number, gameNumber: number, team1Score: number, team2Score: number) {
    if (!currentCycle) return;
    setCycles(
      cycles.map((cycle, index) =>
        index !== cycles.length - 1
          ? cycle
          : {
              ...cycle,
              courts: cycle.courts.map((court) =>
                court.courtNumber !== courtNumber
                  ? court
                  : {
                      ...court,
                      games: court.games.map((game) =>
                        game.gameNumber !== gameNumber ? game : { ...game, team1Score, team2Score, status: 'completed' },
                      ),
                    },
              ),
            },
      ),
    );
  }

  // Called by "Next Game" (games 1-4) or, on game 5, computes every court's
  // final standings + movement preview and moves the cycle into
  // 'awaiting-movement' instead of advancing a game number.
  function advanceGame() {
    if (!currentCycle || !isCurrentGameComplete(currentCycle)) return;

    if (currentCycle.currentGameNumber < 5) {
      setCycles(
        cycles.map((cycle, index) =>
          index !== cycles.length - 1 ? cycle : { ...cycle, currentGameNumber: cycle.currentGameNumber + 1 },
        ),
      );
      return;
    }

    const courts = currentCycle.courts.map((court) => {
      const standings = calculateCourtStandings(court);
      const movementPreview = generateMovementPreview(standings, court.courtNumber, numberOfCourts);
      return { ...court, standings: applyMovementDirections(standings, movementPreview), movementPreview };
    });

    setCycles(
      cycles.map((cycle, index) => (index !== cycles.length - 1 ? cycle : { ...cycle, courts, status: 'awaiting-movement' })),
    );
  }

  // --- Ties, manual movement overrides, and confirming movement ----------

  // Recomputes one court's standings/movement preview using an organiser-
  // supplied full player order (for resolving a wins+differential tie).
  function setManualTiebreakOrder(courtNumber: number, orderedPlayerIds: string[]) {
    if (!currentCycle || currentCycle.status !== 'awaiting-movement') return;
    setCycles(
      cycles.map((cycle, index) => {
        if (index !== cycles.length - 1) return cycle;
        return {
          ...cycle,
          courts: cycle.courts.map((court) => {
            if (court.courtNumber !== courtNumber) return court;
            const standings = calculateCourtStandings(court, orderedPlayerIds);
            const movementPreview = generateMovementPreview(standings, court.courtNumber, numberOfCourts);
            return { ...court, standings: applyMovementDirections(standings, movementPreview), movementPreview };
          }),
        };
      }),
    );
  }

  // Lets the organiser override a single player's computed destination
  // court before confirming — e.g. "the results say up, but I know this
  // player belongs a court lower."
  function setManualMovementOverride(courtNumber: number, playerId: string, toCourt: number) {
    if (!currentCycle || currentCycle.status !== 'awaiting-movement') return;
    setCycles(
      cycles.map((cycle, index) => {
        if (index !== cycles.length - 1) return cycle;
        return {
          ...cycle,
          courts: cycle.courts.map((court) =>
            court.courtNumber !== courtNumber
              ? court
              : {
                  ...court,
                  movementPreview: court.movementPreview.map((movement) =>
                    movement.playerId !== playerId ? movement : { ...movement, toCourt },
                  ),
                },
          ),
        };
      }),
    );
  }

  // "Move Players & Start Next Cycle": marks the current cycle completed
  // and generates the next one from the confirmed movement preview — but
  // only once every resulting court still has exactly 5 players (see
  // validateNextCycleAssignments); a court count change (or a player
  // becoming unavailable) can leave one short, in which case this returns
  // the specific reason instead of proceeding (generateNextKingCourtCycle
  // would otherwise throw deep inside assignPlayersToLetters). The
  // organiser resolves this with the existing per-player "move to court"
  // override already in the Movement Preview UI, and/or a substitution
  // (see substitutePlayer) — see README's "Mid-session player and court
  // changes" for the full writeup of why King Court stays this manual.
  function confirmMovementAndAdvance(players: Player[]): { ok: true } | { ok: false; reason: string } {
    if (!currentCycle || currentCycle.status !== 'awaiting-movement') {
      return { ok: false, reason: 'No cycle is awaiting movement.' };
    }

    const allMovements = currentCycle.courts.flatMap((court) => court.movementPreview);
    const nextAssignments = applyCourtMovement(allMovements);
    const check = validateNextCycleAssignments(nextAssignments, numberOfCourts);
    if (!check.ok) return check;

    const completed = cycles.map((cycle, index) => (index !== cycles.length - 1 ? cycle : { ...cycle, status: 'completed' as const }));
    const partnerHistory = buildKingCourtPartnerHistory(completed);
    const nextCycle = generateNextKingCourtCycle(nextAssignments, players, currentCycle.cycleNumber + 1, partnerHistory);

    setCycles([...completed, nextCycle]);
    return { ok: true };
  }

  // Manual, explicit mid-cycle substitution — see substitutePlayerInCycle
  // for the exact rule (only the current cycle's not-yet-completed games on
  // that one court; history is untouched).
  function substitutePlayer(courtNumber: number, outgoingId: string, incomingId: string) {
    if (!currentCycle) return;
    setCycles(
      cycles.map((cycle, index) =>
        index !== cycles.length - 1 ? cycle : substitutePlayerInCycle(cycle, courtNumber, outgoingId, incomingId),
      ),
    );
    logAdjustment('player-swapped', { cycleNumber: currentCycle.cycleNumber, fromCourt: courtNumber, playerIds: [outgoingId, incomingId] });
  }

  function resetKingCourt() {
    setNumberOfCourts(DEFAULT_COURTS);
    setAssignments([]);
    setCycles([]);
    setSessionAdjustments([]);
  }

  return {
    numberOfCourts,
    setNumberOfCourts,
    changeCourtsSession,
    assignments,
    assignPlayerToCourt,
    reorderPlayerInCourt,
    pruneAssignments,
    cycles,
    currentCycle,
    started,
    startCycle1,
    setGameScore,
    advanceGame,
    substitutePlayer,
    sessionAdjustments,
    setManualTiebreakOrder,
    setManualMovementOverride,
    confirmMovementAndAdvance,
    resetKingCourt,
  };
}
