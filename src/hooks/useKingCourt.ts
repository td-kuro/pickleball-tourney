import type { KingCourtCycle, KingCourtPlayerAssignment, Player } from '../types';
import {
  applyCourtMovement,
  applyMovementDirections,
  buildKingCourtPartnerHistory,
  calculateCourtStandings,
  generateMovementPreview,
  generateNextKingCourtCycle,
  isCurrentGameComplete,
} from '../utils/kingCourt';
import { useLocalStorage } from './useLocalStorage';

const COURTS_KEY = 'pickleball-tourney:kc:numberOfCourts';
const ASSIGNMENTS_KEY = 'pickleball-tourney:kc:assignments';
const CYCLES_KEY = 'pickleball-tourney:kc:cycles';

const DEFAULT_COURTS = 2;

// Manages 5-Player King Court Mode state, persisted to localStorage,
// completely independent of useTournament's rounds/plannedRounds and
// usePoolsKnockout's pools/bracket — see src/utils/kingCourt.ts for the
// underlying pure logic. Reuses usePlayers's roster directly (see App.tsx)
// rather than keeping a separate player list.
export function useKingCourt() {
  const [numberOfCourts, setNumberOfCourts] = useLocalStorage<number>(COURTS_KEY, DEFAULT_COURTS);
  const [assignments, setAssignments] = useLocalStorage<KingCourtPlayerAssignment[]>(ASSIGNMENTS_KEY, []);
  const [cycles, setCycles] = useLocalStorage<KingCourtCycle[]>(CYCLES_KEY, []);

  const started = cycles.length > 0;
  const currentCycle = cycles.length > 0 ? cycles[cycles.length - 1] : null;

  // --- Seeding (pre-Cycle-1) ----------------------------------------------

  function assignPlayerToCourt(playerId: string, courtNumber: number | null) {
    const withoutPlayer = assignments.filter((a) => a.playerId !== playerId);
    setAssignments(courtNumber == null ? withoutPlayer : [...withoutPlayer, { playerId, courtNumber }]);
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
  // and generates the next one from the confirmed movement preview.
  function confirmMovementAndAdvance(players: Player[]) {
    if (!currentCycle || currentCycle.status !== 'awaiting-movement') return;

    const allMovements = currentCycle.courts.flatMap((court) => court.movementPreview);
    const nextAssignments = applyCourtMovement(allMovements);
    const completed = cycles.map((cycle, index) => (index !== cycles.length - 1 ? cycle : { ...cycle, status: 'completed' as const }));
    const partnerHistory = buildKingCourtPartnerHistory(completed);
    const nextCycle = generateNextKingCourtCycle(nextAssignments, players, currentCycle.cycleNumber + 1, partnerHistory);

    setCycles([...completed, nextCycle]);
  }

  function resetKingCourt() {
    setNumberOfCourts(DEFAULT_COURTS);
    setAssignments([]);
    setCycles([]);
  }

  return {
    numberOfCourts,
    setNumberOfCourts,
    assignments,
    assignPlayerToCourt,
    pruneAssignments,
    cycles,
    currentCycle,
    started,
    startCycle1,
    setGameScore,
    advanceGame,
    setManualTiebreakOrder,
    setManualMovementOverride,
    confirmMovementAndAdvance,
    resetKingCourt,
  };
}
