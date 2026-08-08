// Pure 5-Player King Court Mode logic: rotation generation, scoring,
// standings, and court movement. No React or localStorage here, mirroring
// utils/tournament.ts and utils/poolsKnockout.ts — see src/hooks/useKingCourt.ts
// for the stateful/localStorage layer built on top of these functions.

import type {
  KingCourtCourtCycle,
  KingCourtCycle,
  KingCourtGame,
  KingCourtMovement,
  KingCourtMovementReason,
  KingCourtPlayerAssignment,
  KingCourtPlayerStats,
  KingCourtStanding,
  Player,
} from '../types';

// --- The fixed 5-game rotation --------------------------------------------
//
// Positions A-E map to players[0..4]. This exact pattern is what guarantees
// (for any assignment of players to A-E):
// - Every player rests in exactly one game (the 5 `rest` slots below are
//   all different positions).
// - Every player partners with every other player exactly once: the 10
//   team pairings across the 5 games (2 per game) are precisely the 10
//   unique pairs of 5 players — i.e. this is a complete round robin.
const ROTATION_PATTERN: ReadonlyArray<{ team1: [number, number]; team2: [number, number]; rest: number }> = [
  { team1: [0, 1], team2: [2, 3], rest: 4 }, // Game 1: A+B vs C+D, E rests
  { team1: [0, 2], team2: [3, 4], rest: 1 }, // Game 2: A+C vs D+E, B rests
  { team1: [0, 3], team2: [1, 4], rest: 2 }, // Game 3: A+D vs B+E, C rests
  { team1: [0, 4], team2: [1, 2], rest: 3 }, // Game 4: A+E vs B+C, D rests
  { team1: [1, 3], team2: [2, 4], rest: 0 }, // Game 5: B+D vs C+E, A rests
];

// Generates the 5-game A-E rotation for one court's 5 players, in the
// order given (players[0] is "A", ..., players[4] is "E" — see
// assignPlayersToLetters for how that order is chosen).
export function generateFivePlayerRotation(players: Player[]): KingCourtGame[] {
  if (players.length !== 5) {
    throw new Error(`generateFivePlayerRotation requires exactly 5 players, got ${players.length}.`);
  }

  return ROTATION_PATTERN.map((slot, index) => ({
    gameNumber: index + 1,
    team1PlayerIds: slot.team1.map((i) => players[i].id),
    team2PlayerIds: slot.team2.map((i) => players[i].id),
    restingPlayerId: players[slot.rest].id,
    status: 'pending',
  }));
}

function permutationsOf<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutationsOf(rest)) {
      result.push([items[i], ...tail]);
    }
  }
  return result;
}

function partnerCount(history: Record<string, Record<string, number>>, aId: string, bId: string): number {
  return history[aId]?.[bId] ?? 0;
}

// Game 1 weighted highest, Game 5 lowest — see assignPlayersToLetters.
const GAME_WEIGHT = [5, 4, 3, 2, 1];

// Assigns the 5 court players to A-E. Because generateFivePlayerRotation's
// pattern is a complete round robin, every one of the 5 players' 10
// possible pairs partners exactly once THIS CYCLE regardless of A-E order
// — that part can't be improved by reordering, it's already guaranteed.
// What order DOES control is which numbered game (1-5) each pairing falls
// in. This tries every possible letter assignment (5! = 120, cheap to
// brute-force) and keeps whichever one front-loads pairs with less prior
// history into earlier games — a modest, honest way to act on
// `partnerHistory` given that constraint, rather than claiming it can
// avoid repeats outright.
export function assignPlayersToLetters(
  players: Player[],
  partnerHistory: Record<string, Record<string, number>>,
): Player[] {
  if (players.length !== 5) {
    throw new Error(`assignPlayersToLetters requires exactly 5 players, got ${players.length}.`);
  }

  let best = players;
  let bestScore = Infinity;

  for (const order of permutationsOf(players)) {
    let score = 0;
    ROTATION_PATTERN.forEach((slot, gameIndex) => {
      const weight = GAME_WEIGHT[gameIndex];
      score += partnerCount(partnerHistory, order[slot.team1[0]].id, order[slot.team1[1]].id) * weight;
      score += partnerCount(partnerHistory, order[slot.team2[0]].id, order[slot.team2[1]].id) * weight;
    });
    if (score < bestScore) {
      bestScore = score;
      best = order;
    }
  }

  return best;
}

export interface KingCourtGameResult {
  winnerTeam: 1 | 2 | undefined;
  playerDeltas: Record<string, { win: number; loss: number; pointDifferential: number }>;
}

export function getKingCourtGameWinner(game: KingCourtGame): 1 | 2 | undefined {
  if (game.team1Score == null || game.team2Score == null || game.team1Score === game.team2Score) return undefined;
  return game.team1Score > game.team2Score ? 1 : 2;
}

// Both players on the winning team get +1 win and +margin point
// differential; both on the losing team get +1 loss and -margin. The
// resting player, and every player when the game isn't scored yet (or is
// tied), gets all zeros.
export function calculateKingCourtGameResult(game: KingCourtGame): KingCourtGameResult {
  const playerDeltas: KingCourtGameResult['playerDeltas'] = {};
  for (const id of [...game.team1PlayerIds, ...game.team2PlayerIds, game.restingPlayerId]) {
    playerDeltas[id] = { win: 0, loss: 0, pointDifferential: 0 };
  }

  const winnerTeam = getKingCourtGameWinner(game);
  if (winnerTeam == null || game.team1Score == null || game.team2Score == null) {
    return { winnerTeam: undefined, playerDeltas };
  }

  const margin = Math.abs(game.team1Score - game.team2Score);
  const winningIds = winnerTeam === 1 ? game.team1PlayerIds : game.team2PlayerIds;
  const losingIds = winnerTeam === 1 ? game.team2PlayerIds : game.team1PlayerIds;

  for (const id of winningIds) playerDeltas[id] = { win: 1, loss: 0, pointDifferential: margin };
  for (const id of losingIds) playerDeltas[id] = { win: 0, loss: 1, pointDifferential: -margin };

  return { winnerTeam, playerDeltas };
}

// Ranks a court's 5 players by wins, then point differential. `manualOrder`
// (a full playerId ordering) is an optional organiser override — once
// given, it takes priority over the computed sort entirely, so it can
// resolve ties the automatic rules can't. Without it, players still tied
// on both wins and point differential are flagged `tied: true` so the UI
// can prompt for a manual order before movement is confirmed.
export function calculateCourtStandings(
  courtCycle: KingCourtCourtCycle,
  manualOrder: string[] = [],
): KingCourtStanding[] {
  const totals = new Map<string, { wins: number; losses: number; pointDifferential: number }>(
    courtCycle.playerIds.map((id) => [id, { wins: 0, losses: 0, pointDifferential: 0 }]),
  );

  for (const game of courtCycle.games) {
    const { playerDeltas } = calculateKingCourtGameResult(game);
    for (const [playerId, delta] of Object.entries(playerDeltas)) {
      const entry = totals.get(playerId);
      if (!entry) continue;
      entry.wins += delta.win;
      entry.losses += delta.loss;
      entry.pointDifferential += delta.pointDifferential;
    }
  }

  const manualIndex = new Map(manualOrder.map((id, index) => [id, index]));
  const useManualOrder = manualIndex.size === courtCycle.playerIds.length;

  const ranked = courtCycle.playerIds
    .map((playerId) => ({ playerId, ...totals.get(playerId)! }))
    .sort((a, b) => {
      if (useManualOrder) return (manualIndex.get(a.playerId) ?? 0) - (manualIndex.get(b.playerId) ?? 0);
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.pointDifferential - a.pointDifferential;
    });

  return ranked.map((entry, index) => {
    const tiedWithPrev =
      index > 0 && ranked[index - 1].wins === entry.wins && ranked[index - 1].pointDifferential === entry.pointDifferential;
    const tiedWithNext =
      index < ranked.length - 1 &&
      ranked[index + 1].wins === entry.wins &&
      ranked[index + 1].pointDifferential === entry.pointDifferential;

    return {
      playerId: entry.playerId,
      wins: entry.wins,
      losses: entry.losses,
      pointDifferential: entry.pointDifferential,
      rank: index + 1,
      movementDirection: 'stay',
      tied: !useManualOrder && (tiedWithPrev || tiedWithNext),
    };
  });
}

// Fills in each standing's `movementDirection` from the corresponding
// movement preview entry — calculateCourtStandings can't know this itself
// (it doesn't know the court's position relative to the others), so this
// is applied as a second pass once generateMovementPreview has run.
export function applyMovementDirections(
  standings: KingCourtStanding[],
  movements: KingCourtMovement[],
): KingCourtStanding[] {
  const directionByPlayer = new Map(
    movements.map((m) => [m.playerId, m.toCourt > m.fromCourt ? 'up' : m.toCourt < m.fromCourt ? 'down' : 'stay'] as const),
  );
  return standings.map((standing) => ({
    ...standing,
    movementDirection: directionByPlayer.get(standing.playerId) ?? standing.movementDirection,
  }));
}

// Court movement rules: 1st & 2nd move up a court, 3rd stays, 4th & 5th
// move down a court — clamped at [1, totalCourts], so the top court's 1st
// & 2nd and the bottom court's 4th & 5th simply stay put instead (there's
// nowhere for them to go).
export function generateMovementPreview(
  standings: KingCourtStanding[],
  courtNumber: number,
  totalCourts: number,
): KingCourtMovement[] {
  return standings.map((standing) => {
    const rawTarget =
      standing.rank <= 2 ? courtNumber + 1 : standing.rank >= 4 ? courtNumber - 1 : courtNumber;
    const toCourt = Math.min(totalCourts, Math.max(1, rawTarget));

    let reason: KingCourtMovementReason;
    if (toCourt === courtNumber && rawTarget > courtNumber) reason = 'top-court-stay';
    else if (toCourt === courtNumber && rawTarget < courtNumber) reason = 'bottom-court-stay';
    else if (toCourt > courtNumber) reason = 'up';
    else if (toCourt < courtNumber) reason = 'down';
    else reason = 'stay';

    return { playerId: standing.playerId, fromCourt: courtNumber, toCourt, reason, rank: standing.rank };
  });
}

// Flattens every court's movement preview for a cycle into the next
// cycle's court assignments.
export function applyCourtMovement(allMovements: KingCourtMovement[]): KingCourtPlayerAssignment[] {
  return allMovements.map((movement) => ({ playerId: movement.playerId, courtNumber: movement.toCourt }));
}

// Cumulative partner-pairing counts derived from every game played so far
// across every cycle — not stored separately, same rationale as
// buildMatchHistory in utils/tournament.ts (single source of truth).
export function buildKingCourtPartnerHistory(cycles: KingCourtCycle[]): Record<string, Record<string, number>> {
  const history: Record<string, Record<string, number>> = {};
  const bump = (aId: string, bId: string) => {
    history[aId] ??= {};
    history[aId][bId] = (history[aId][bId] ?? 0) + 1;
  };

  for (const cycle of cycles) {
    for (const court of cycle.courts) {
      for (const game of court.games) {
        const [a1, b1] = game.team1PlayerIds;
        const [a2, b2] = game.team2PlayerIds;
        bump(a1, b1);
        bump(b1, a1);
        bump(a2, b2);
        bump(b2, a2);
      }
    }
  }

  return history;
}

// Builds a fresh cycle from a set of court assignments: groups players by
// court, chooses each court's A-E letter order (assignPlayersToLetters),
// and generates that court's 5-game rotation. Used both for Cycle 1 (with
// the manually-seeded assignments and empty partner history) and for every
// cycle after a movement is confirmed (with applyCourtMovement's output
// and the accumulated partner history) — see useKingCourt.
export function generateNextKingCourtCycle(
  assignments: KingCourtPlayerAssignment[],
  players: Player[],
  cycleNumber: number,
  partnerHistory: Record<string, Record<string, number>>,
): KingCourtCycle {
  const playerById = new Map(players.map((p) => [p.id, p]));
  const courtNumbers = Array.from(new Set(assignments.map((a) => a.courtNumber))).sort((a, b) => a - b);

  const courts: KingCourtCourtCycle[] = courtNumbers.map((courtNumber) => {
    const courtPlayers = assignments
      .filter((a) => a.courtNumber === courtNumber)
      .map((a) => playerById.get(a.playerId))
      .filter((p): p is Player => p != null);

    const ordered = assignPlayersToLetters(courtPlayers, partnerHistory);

    return {
      courtNumber,
      playerIds: ordered.map((p) => p.id),
      games: generateFivePlayerRotation(ordered),
      standings: [],
      movementPreview: [],
    };
  });

  return { cycleNumber, courts, currentGameNumber: 1, status: 'in-progress' };
}

// True once every court has a score entered for the cycle's current game
// — gates the "Next Game" action, mirroring isRoundComplete in
// utils/tournament.ts.
export function isCurrentGameComplete(cycle: KingCourtCycle): boolean {
  return cycle.courts.every((court) => {
    const game = court.games.find((g) => g.gameNumber === cycle.currentGameNumber);
    return game != null && game.team1Score != null && game.team2Score != null;
  });
}

export function validateKingCourtSetup(
  players: Player[],
  numberOfCourts: number,
): { ok: true } | { ok: false; reason: string } {
  if (numberOfCourts < 1) {
    return { ok: false, reason: 'Number of courts must be at least 1.' };
  }
  const needed = numberOfCourts * 5;
  if (players.length !== needed) {
    return {
      ok: false,
      reason: `King Court needs exactly ${needed} player${needed === 1 ? '' : 's'} for ${numberOfCourts} court${
        numberOfCourts === 1 ? '' : 's'
      } (5 per court) — you currently have ${players.length}.`,
    };
  }
  if (players.some((p) => p.name.trim() === '')) {
    return { ok: false, reason: 'Every player needs a name before seeding courts.' };
  }
  return { ok: true };
}

export function validateKingCourtSeeding(
  assignments: KingCourtPlayerAssignment[],
  players: Player[],
  numberOfCourts: number,
): { ok: true } | { ok: false; reason: string } {
  const setupCheck = validateKingCourtSetup(players, numberOfCourts);
  if (!setupCheck.ok) return setupCheck;

  const assignedIds = new Set(assignments.map((a) => a.playerId));
  if (players.some((p) => !assignedIds.has(p.id))) {
    return { ok: false, reason: 'Every player must be assigned to a court before starting Cycle 1.' };
  }

  for (let court = 1; court <= numberOfCourts; court++) {
    const count = assignments.filter((a) => a.courtNumber === court).length;
    if (count !== 5) {
      return {
        ok: false,
        reason: `Court ${court} has ${count} player${count === 1 ? '' : 's'} assigned — every court needs exactly 5.`,
      };
    }
  }

  return { ok: true };
}

// Aggregated King Court stats for every player across the whole session so
// far (every cycle, not just the current one) — the King Court equivalent
// of computePlayerStats in utils/tournament.ts.
export function computeKingCourtPlayerStats(players: Player[], cycles: KingCourtCycle[]): KingCourtPlayerStats[] {
  const statsByPlayer = new Map<string, KingCourtPlayerStats>(
    players.map((player) => [
      player.id,
      {
        playerId: player.id,
        totalWins: 0,
        totalLosses: 0,
        totalPointDifferential: 0,
        gamesPlayed: 0,
        gamesRested: 0,
        partnerHistory: {},
        courtHistory: [],
      },
    ]),
  );

  for (const cycle of cycles) {
    for (const court of cycle.courts) {
      for (const game of court.games) {
        const { playerDeltas } = calculateKingCourtGameResult(game);
        for (const id of [...game.team1PlayerIds, ...game.team2PlayerIds]) {
          const stats = statsByPlayer.get(id);
          if (!stats) continue;
          stats.gamesPlayed += 1;
          stats.totalWins += playerDeltas[id].win;
          stats.totalLosses += playerDeltas[id].loss;
          stats.totalPointDifferential += playerDeltas[id].pointDifferential;
        }

        const restStats = statsByPlayer.get(game.restingPlayerId);
        if (restStats) restStats.gamesRested += 1;

        const partnerPairs: [string, string][] = [
          [game.team1PlayerIds[0], game.team1PlayerIds[1]],
          [game.team2PlayerIds[0], game.team2PlayerIds[1]],
        ];
        for (const [a, b] of partnerPairs) {
          const statsA = statsByPlayer.get(a);
          if (statsA) statsA.partnerHistory[b] = (statsA.partnerHistory[b] ?? 0) + 1;
          const statsB = statsByPlayer.get(b);
          if (statsB) statsB.partnerHistory[a] = (statsB.partnerHistory[a] ?? 0) + 1;
        }
      }

      for (const playerId of court.playerIds) {
        const stats = statsByPlayer.get(playerId);
        if (stats) stats.courtHistory.push(court.courtNumber);
      }
    }
  }

  return Array.from(statsByPlayer.values());
}
