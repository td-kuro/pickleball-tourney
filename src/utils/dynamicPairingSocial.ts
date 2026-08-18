// Pure logic for Dynamic Pairing Social — a doubles-only, ranking-driven
// Social Play format (see SocialFormat in ../types.ts). Deliberately
// self-contained: nothing here is imported by (or imports from)
// utils/tournament.ts, utils/pairing.ts, utils/poolsKnockout.ts, or
// utils/kingCourt.ts, so this format can't affect any other mode.
//
// The three systems this file implements are kept intentionally
// independent, per the design brief:
// - Ranking (calculatePlayerRankings) decides how *competitive* a court
//   is — it never influences who rests.
// - Rest selection (selectRestingPlayers) is a pure fairness queue based
//   on how many times each player has already sat out — it never looks at
//   ranking.
// - Court/partnership allocation (allocatePlayersToCourts,
//   createBalancedPartnerships) only runs on whoever is left *after* both
//   of the above have already been decided.

import type {
  CourtMovementLimit,
  DynamicGameFormat,
  DynamicPairingCourtAssignment,
  DynamicPairingPlayerStats,
  DynamicPairingRound,
  DynamicPairingRoundPhase,
  DynamicPairingRoundStatus,
  DynamicPairingSettings,
  Player,
} from '../types';

// --- Capacity ---------------------------------------------------------

export function calculateActiveCapacity(numberOfCourts: number): number {
  return Math.max(0, numberOfCourts) * 4;
}

export function calculateCourtsUsed(availableCourts: number, availablePlayers: number): number {
  return Math.min(Math.max(0, availableCourts), Math.floor(Math.max(0, availablePlayers) / 4));
}

export function isPlayerAvailable(player: Player): boolean {
  return (player.availabilityStatus ?? 'available') === 'available';
}

export function canGenerateDynamicPairingRound(
  players: Player[],
  settings: DynamicPairingSettings,
  currentRound: DynamicPairingRound | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (settings.numberOfCourts < 1) {
    return { ok: false, reason: 'Number of courts must be at least 1.' };
  }
  const available = players.filter(isPlayerAvailable);
  if (available.length < 4) {
    return { ok: false, reason: 'At least 4 available players are required to create one doubles match.' };
  }
  if (players.some((p) => p.name.trim() === '')) {
    return { ok: false, reason: 'Every player needs a name before starting matches.' };
  }
  if (currentRound && !isDynamicPairingRoundComplete(currentRound)) {
    return { ok: false, reason: 'Enter scores for every court in the current round before generating the next one.' };
  }
  return { ok: true };
}

export function isDynamicPairingRoundComplete(round: DynamicPairingRound): boolean {
  return round.courts.every((c) => c.score1 != null && c.score2 != null);
}

// True once the grading phase is fully behind us — i.e. there's no more
// grading-round data left to collect, so it's meaningful for the organiser
// to assign skill levels (see Player.skillLevel and the "skill level"
// tiebreaker in sortPlayersByRanking). A `gradingRounds` setting of 0 skips
// grading entirely, so skill levels are assignable from the very first
// round in that case.
export function isGradingPhaseComplete(rounds: DynamicPairingRound[], settings: DynamicPairingSettings): boolean {
  if (settings.gradingRounds <= 0) return true;
  const lastGradingRound = rounds.find((r) => r.roundNumber === settings.gradingRounds);
  return lastGradingRound != null && isDynamicPairingRoundComplete(lastGradingRound);
}

// --- Match/rest history, derived from rounds ---------------------------
// Mirrors utils/tournament.ts's philosophy: history is derived fresh from
// `rounds` rather than stored separately, so there's a single source of
// truth and it can never drift out of sync with what was actually played.

function bumpHistory(record: Record<string, number>, id: string) {
  record[id] = (record[id] ?? 0) + 1;
}

function emptyStats(playerId: string): DynamicPairingPlayerStats {
  return {
    playerId,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDifferential: 0,
    winPercentage: 0,
    averagePointDifferential: 0,
    averagePointsScored: 0,
    totalRests: 0,
    lastRestRound: null,
    consecutiveRoundsPlayed: 0,
    currentRank: 0,
    previousRank: null,
    currentCourt: null,
    partnerHistory: {},
    opponentHistory: {},
    courtHistory: [],
  };
}

// Records one court's participants into the running partner/opponent
// history — called once per court, per round, regardless of whether that
// court has been scored yet (partnership/opponent *variety* should account
// for "who played with/against whom", not just "who won") — see
// createBalancedPartnerships, which reads this history back.
export function updatePartnerOpponentHistory(
  statsById: Map<string, DynamicPairingPlayerStats>,
  court: DynamicPairingCourtAssignment,
) {
  const [a1, a2] = court.team1PlayerIds;
  const [b1, b2] = court.team2PlayerIds;
  const sA1 = statsById.get(a1);
  const sA2 = statsById.get(a2);
  const sB1 = statsById.get(b1);
  const sB2 = statsById.get(b2);
  if (sA1) bumpHistory(sA1.partnerHistory, a2);
  if (sA2) bumpHistory(sA2.partnerHistory, a1);
  if (sB1) bumpHistory(sB1.partnerHistory, b2);
  if (sB2) bumpHistory(sB2.partnerHistory, b1);
  for (const a of court.team1PlayerIds) {
    for (const b of court.team2PlayerIds) {
      const sA = statsById.get(a);
      const sB = statsById.get(b);
      if (sA) bumpHistory(sA.opponentHistory, b);
      if (sB) bumpHistory(sB.opponentHistory, a);
    }
  }
}

// Builds per-player stats from every round played so far. Per-game rates
// (winPercentage/averagePointDifferential/averagePointsScored) are always
// safe against divide-by-zero — see the 0-fallback at the bottom.
// `currentRank`/`previousRank` are deliberately left at their placeholder
// defaults here (0 / null) — only calculatePlayerRankings sets them, since
// ranking needs a full sort pass across every player, not a per-player
// running total like everything else in this function.
export function calculateDynamicPairingStats(
  players: Player[],
  rounds: DynamicPairingRound[],
): DynamicPairingPlayerStats[] {
  const statsById = new Map<string, DynamicPairingPlayerStats>(players.map((p) => [p.id, emptyStats(p.id)]));
  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);

  for (const round of sortedRounds) {
    const playingIds = new Set(round.courts.flatMap((c) => c.playerIds));

    for (const court of round.courts) {
      for (const id of court.playerIds) {
        const s = statsById.get(id);
        if (!s) continue;
        s.courtHistory.push(court.courtNumber);
        s.currentCourt = court.courtNumber;
      }

      updatePartnerOpponentHistory(statsById, court);

      if (court.score1 == null || court.score2 == null || court.score1 === court.score2) continue;
      const winnerTeam = court.score1 > court.score2 ? 1 : 2;
      applyGameResult(statsById, court.team1PlayerIds, court.score1, court.score2, winnerTeam === 1);
      applyGameResult(statsById, court.team2PlayerIds, court.score2, court.score1, winnerTeam === 2);
    }

    for (const id of round.restingPlayerIds) {
      const s = statsById.get(id);
      if (!s) continue;
      s.totalRests += 1;
      s.lastRestRound = round.roundNumber;
      s.consecutiveRoundsPlayed = 0;
    }
    for (const id of playingIds) {
      const s = statsById.get(id);
      if (!s) continue;
      s.consecutiveRoundsPlayed += 1;
    }
  }

  for (const s of statsById.values()) {
    s.winPercentage = s.gamesPlayed > 0 ? s.wins / s.gamesPlayed : 0;
    s.averagePointDifferential = s.gamesPlayed > 0 ? s.pointDifferential / s.gamesPlayed : 0;
    s.averagePointsScored = s.gamesPlayed > 0 ? s.pointsFor / s.gamesPlayed : 0;
  }

  return Array.from(statsById.values());
}

function applyGameResult(
  statsById: Map<string, DynamicPairingPlayerStats>,
  playerIds: string[],
  ownScore: number,
  opponentScore: number,
  won: boolean,
) {
  for (const id of playerIds) {
    const s = statsById.get(id);
    if (!s) continue;
    s.gamesPlayed += 1;
    s.pointsFor += ownScore;
    s.pointsAgainst += opponentScore;
    s.pointDifferential += ownScore - opponentScore;
    if (won) s.wins += 1;
    else s.losses += 1;
  }
}

// Head-to-head result between two players across every completed match
// where they were on opposing teams. Returns a comparator-friendly value:
// negative if `aId` has the better head-to-head record, positive if `bId`
// does, 0 if even or they've never played each other.
export function getPlayerHeadToHead(aId: string, bId: string, rounds: DynamicPairingRound[]): number {
  let aWins = 0;
  let bWins = 0;
  for (const round of rounds) {
    for (const court of round.courts) {
      if (court.score1 == null || court.score2 == null || court.score1 === court.score2) continue;
      const aTeam = court.team1PlayerIds.includes(aId) ? 1 : court.team2PlayerIds.includes(aId) ? 2 : 0;
      const bTeam = court.team1PlayerIds.includes(bId) ? 1 : court.team2PlayerIds.includes(bId) ? 2 : 0;
      if (aTeam === 0 || bTeam === 0 || aTeam === bTeam) continue; // not opponents this match
      const winnerTeam = court.score1 > court.score2 ? 1 : 2;
      if (aTeam === winnerTeam) aWins += 1;
      else bWins += 1;
    }
  }
  if (aWins === bWins) return 0;
  return aWins > bWins ? -1 : 1;
}

// A deterministic (not Math.random()) last-resort tiebreaker: order must
// stay stable across re-renders/recomputation for genuinely tied players,
// or the Rankings table would visibly shuffle itself on every score entry.
// Antisymmetric by construction: swapping the two ids negates the result.
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}

function stableRandomTiebreak(aId: string, bId: string): number {
  return hashString(`${aId}|${bId}`) - hashString(`${bId}|${aId}`);
}

export interface RankedPlayer {
  player: Player;
  stats: DynamicPairingPlayerStats;
  rank: number;
}

// Ranking priority, applied in order (see README's "Ranking metrics"):
// 1. win percentage, 2. average point differential, 3. average points
// scored, 4. head-to-head, 5. organiser-assigned skill level, 6. starting
// seed, 7. previous rank, 8. a stable tiebreak. Skill level is deliberately
// a tiebreaker, not a primary sort key — actual results still decide
// ranking first; skill level (only assignable once grading ends, see
// isGradingPhaseComplete) just breaks the ties that are common early on,
// and matters less and less as more results accumulate.
// `previousRankById` is supplied by the caller (see calculatePlayerRankings)
// rather than read off `stats`, since building it is itself a ranking
// computation one round earlier.
export function sortPlayersByRanking(
  players: Player[],
  stats: DynamicPairingPlayerStats[],
  rounds: DynamicPairingRound[],
  previousRankById: Map<string, number>,
): RankedPlayer[] {
  const statsById = new Map(stats.map((s) => [s.playerId, s]));
  const rows = players.map((player) => ({ player, stats: statsById.get(player.id) ?? emptyStats(player.id) }));

  rows.sort((a, b) => {
    if (b.stats.winPercentage !== a.stats.winPercentage) return b.stats.winPercentage - a.stats.winPercentage;
    if (b.stats.averagePointDifferential !== a.stats.averagePointDifferential) {
      return b.stats.averagePointDifferential - a.stats.averagePointDifferential;
    }
    if (b.stats.averagePointsScored !== a.stats.averagePointsScored) {
      return b.stats.averagePointsScored - a.stats.averagePointsScored;
    }
    const h2h = getPlayerHeadToHead(a.player.id, b.player.id, rounds);
    if (h2h !== 0) return h2h;
    const skillA = a.player.skillLevel ?? Infinity;
    const skillB = b.player.skillLevel ?? Infinity;
    if (skillA !== skillB) return skillA - skillB;
    const seedA = a.player.startingSeed ?? Infinity;
    const seedB = b.player.startingSeed ?? Infinity;
    if (seedA !== seedB) return seedA - seedB;
    const prevA = previousRankById.get(a.player.id) ?? Infinity;
    const prevB = previousRankById.get(b.player.id) ?? Infinity;
    if (prevA !== prevB) return prevA - prevB;
    return stableRandomTiebreak(a.player.id, b.player.id);
  });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

// Computes current rankings, walking forward round-by-round so each
// round's ranking can use the *previous* round's ranking as tiebreaker #6
// (see sortPlayersByRanking) — this naturally builds up `previousRank`
// without needing self-referential/recursive stats. Round counts in a
// single session are small (well under a hundred), so the O(rounds²)
// re-computation this implies is negligible in practice.
export function calculatePlayerRankings(players: Player[], rounds: DynamicPairingRound[]): RankedPlayer[] {
  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);

  let previousRankById = new Map<string, number>();
  let latest: RankedPlayer[] = [];

  for (let i = 0; i <= sortedRounds.length; i++) {
    const roundsSoFar = sortedRounds.slice(0, i);
    const stats = calculateDynamicPairingStats(players, roundsSoFar);
    const ranked = sortPlayersByRanking(players, stats, roundsSoFar, previousRankById);
    latest = ranked.map((row) => ({
      ...row,
      stats: { ...row.stats, previousRank: previousRankById.get(row.player.id) ?? null, currentRank: row.rank },
    }));
    previousRankById = new Map(ranked.map((row) => [row.player.id, row.rank]));
  }

  return latest;
}

// --- Rest selection ------------------------------------------------------
// Deliberately doesn't look at ranking at all — see the file-level comment.
export function selectRestingPlayers(
  availablePlayers: Player[],
  stats: DynamicPairingPlayerStats[],
  courtsUsed: number,
  lastRoundRestingIds: Set<string>,
): { restingIds: string[]; activeIds: string[] } {
  const activeCapacity = calculateActiveCapacity(courtsUsed);
  const restCount = Math.max(0, availablePlayers.length - activeCapacity);
  if (restCount === 0) {
    return { restingIds: [], activeIds: availablePlayers.map((p) => p.id) };
  }

  const statsById = new Map(stats.map((s) => [s.playerId, s]));

  // Fair-rest priority: fewest total rests first, then most consecutive
  // rounds played (they're "due"), then whoever didn't rest last round,
  // then a stable tiebreak. Because this same fewest-rests-first rule is
  // reapplied every round, the gap between the most- and least-rested
  // player can never exceed 1 (the classic round-robin fairness argument)
  // — no extra bookkeeping needed to enforce that separately.
  const candidates = availablePlayers
    .map((player) => ({ player, s: statsById.get(player.id) ?? emptyStats(player.id) }))
    .sort((a, b) => {
      if (a.s.totalRests !== b.s.totalRests) return a.s.totalRests - b.s.totalRests;
      if (b.s.consecutiveRoundsPlayed !== a.s.consecutiveRoundsPlayed) {
        return b.s.consecutiveRoundsPlayed - a.s.consecutiveRoundsPlayed;
      }
      const aRestedLastRound = lastRoundRestingIds.has(a.player.id) ? 1 : 0;
      const bRestedLastRound = lastRoundRestingIds.has(b.player.id) ? 1 : 0;
      if (aRestedLastRound !== bRestedLastRound) return aRestedLastRound - bRestedLastRound;
      return stableRandomTiebreak(a.player.id, b.player.id);
    });

  const restingIds = candidates.slice(0, restCount).map((c) => c.player.id);
  const restingSet = new Set(restingIds);
  const activeIds = availablePlayers.filter((p) => !restingSet.has(p.id)).map((p) => p.id);
  return { restingIds, activeIds };
}

// --- Court allocation ------------------------------------------------------
// `rankedActivePlayerIds` must already be sorted best-to-worst (active
// players only — resting players removed). Court 1 = strongest group, per
// Dynamic Pairing Social's convention (the reverse of King Court, where a
// higher court number can be the stronger one — see README).
export function allocatePlayersToCourts(rankedActivePlayerIds: string[], courtsUsed: number): string[][] {
  const groups: string[][] = [];
  for (let i = 0; i < courtsUsed; i++) {
    groups.push(rankedActivePlayerIds.slice(i * 4, i * 4 + 4));
  }
  return groups;
}

// Applies the organiser's "Maximum court movement per round" setting on
// top of a pure ranking-based allocation. Kept intentionally simple for
// this version (per the design brief): each player's *desired* court is
// their pure-ranking target court, clamped to within `cap` courts of
// wherever they played last; then courts are filled by rank order,
// searching outward from a player's desired court if it's already full
// (which can happen once several players get clamped toward the same
// court). Not a globally optimal assignment, but predictable and easy to
// reason about — see README's "Current limitations".
export function applyCourtMovementLimit(
  rankedActivePlayerIds: string[],
  previousCourtByPlayerId: Map<string, number>,
  courtsUsed: number,
  maxMovement: CourtMovementLimit,
): string[][] {
  if (maxMovement === 'unrestricted' || courtsUsed === 0) {
    return allocatePlayersToCourts(rankedActivePlayerIds, courtsUsed);
  }
  const cap = maxMovement === 'max-1' ? 1 : 2;
  const courts: string[][] = Array.from({ length: courtsUsed }, () => []);

  rankedActivePlayerIds.forEach((playerId, index) => {
    const unrestrictedTarget = Math.min(courtsUsed, Math.floor(index / 4) + 1);
    const previousCourt = previousCourtByPlayerId.get(playerId);
    let desired = unrestrictedTarget;
    if (previousCourt != null) {
      const minCourt = Math.max(1, previousCourt - cap);
      const maxCourt = Math.min(courtsUsed, previousCourt + cap);
      desired = Math.min(Math.max(unrestrictedTarget, minCourt), maxCourt);
    }

    let offset = 0;
    let placed = false;
    while (!placed && offset <= courtsUsed) {
      const candidates = offset === 0 ? [desired] : [desired - offset, desired + offset];
      for (const candidate of candidates) {
        if (candidate < 1 || candidate > courtsUsed) continue;
        if (courts[candidate - 1].length < 4) {
          courts[candidate - 1].push(playerId);
          placed = true;
          break;
        }
      }
      offset += 1;
    }
  });

  return courts;
}

// --- Partnerships ----------------------------------------------------------

export interface PartnershipOption {
  team1: [string, string];
  team2: [string, string];
}

// Lower score = more desirable. Penalises (in priority order, heaviest
// first): repeating the exact same partner as the previous round,
// cumulative partner-history repeats, and cumulative opponent-history
// repeats (a proxy for "have these two pairs already played this exact
// match" — if they have, every cross-pair opponent count will be
// elevated).
export function scorePartnershipOption(
  option: PartnershipOption,
  statsById: Map<string, DynamicPairingPlayerStats>,
  previousRoundPartnerById: Map<string, string>,
): number {
  const REPEAT_PREVIOUS_PARTNER_WEIGHT = 1000;
  const PARTNER_HISTORY_WEIGHT = 10;
  const OPPONENT_HISTORY_WEIGHT = 5;
  let score = 0;

  for (const [a, b] of [option.team1, option.team2]) {
    if (previousRoundPartnerById.get(a) === b) score += REPEAT_PREVIOUS_PARTNER_WEIGHT;
    score += (statsById.get(a)?.partnerHistory[b] ?? 0) * PARTNER_HISTORY_WEIGHT;
  }
  for (const a of option.team1) {
    for (const b of option.team2) {
      score += (statsById.get(a)?.opponentHistory[b] ?? 0) * OPPONENT_HISTORY_WEIGHT;
    }
  }
  return score;
}

// Splits one court's group of 4 (already ranked best-to-worst within the
// group) into balanced teams. Only two splits are ever considered:
// 1st+4th vs 2nd+3rd (the default — the most balanced possible split of a
// ranked quad) or 1st+3rd vs 2nd+4th (the alternative, used when it scores
// better on variety without sacrificing balance). 1st+2nd vs 3rd+4th is
// deliberately never considered — it's the least balanced possible split
// of the four, and the brief puts competitive balance ahead of variety.
export function createBalancedPartnerships(
  courtGroupPlayerIds: string[],
  statsById: Map<string, DynamicPairingPlayerStats>,
  previousRoundPartnerById: Map<string, string>,
): { team1: string[]; team2: string[] } {
  const [r1, r2, r3, r4] = courtGroupPlayerIds;
  const optionA: PartnershipOption = { team1: [r1, r4], team2: [r2, r3] };
  const optionB: PartnershipOption = { team1: [r1, r3], team2: [r2, r4] };

  const scoreA = scorePartnershipOption(optionA, statsById, previousRoundPartnerById);
  const scoreB = scorePartnershipOption(optionB, statsById, previousRoundPartnerById);
  const chosen = scoreA <= scoreB ? optionA : optionB;
  return { team1: chosen.team1, team2: chosen.team2 };
}

// --- Round generation --------------------------------------------------

let idCounter = 0;
function makeDynamicPairingId(prefix: string): string {
  idCounter += 1;
  return `dp-${prefix}-${Date.now()}-${idCounter}-${Math.floor(Math.random() * 10000)}`;
}

// Genuine (not deterministic-hash) randomness — used only to shuffle
// grading-round court order. Unlike stableRandomTiebreak above, this is
// intentionally allowed to differ between calls: grading rounds are meant
// to mix players up freely before there's any ranking to preserve.
function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// The single entry point for generating a Dynamic Pairing Social round —
// see README's "Next round generation flow" for the numbered version of
// this same sequence. `players` is the full roster (every availability
// status); only 'available' players are eligible to play or rest this
// round (see isPlayerAvailable) — late/withdrawn/injured players are
// excluded entirely for this version (see README's "Player availability").
export function generateDynamicPairingRound(
  players: Player[],
  settings: DynamicPairingSettings,
  priorRounds: DynamicPairingRound[],
): DynamicPairingRound {
  const roundNumber = priorRounds.length + 1;
  const phase: DynamicPairingRound['phase'] = roundNumber <= settings.gradingRounds ? 'grading' : 'ranking';

  const availablePlayers = players.filter(isPlayerAvailable);
  const courtsUsed = calculateCourtsUsed(settings.numberOfCourts, availablePlayers.length);

  const stats = calculateDynamicPairingStats(players, priorRounds);
  const lastRound = priorRounds.length > 0 ? priorRounds[priorRounds.length - 1] : undefined;
  const lastRoundRestingIds = new Set(lastRound?.restingPlayerIds ?? []);

  const { restingIds, activeIds } = selectRestingPlayers(availablePlayers, stats, courtsUsed, lastRoundRestingIds);
  const activeSet = new Set(activeIds);

  // During grading, there isn't enough game data yet to rank meaningfully,
  // and skill levels aren't assignable yet either (see
  // isGradingPhaseComplete) — so courts/partnerships are shuffled at
  // random, per the design brief. Once grading is over, every subsequent
  // round re-ranks from actual results (see sortPlayersByRanking).
  let orderedActiveIds: string[];
  const previousCourtByPlayerId = new Map<string, number>();
  if (phase === 'grading') {
    orderedActiveIds = shuffle(activeIds);
  } else {
    const ranking = calculatePlayerRankings(players, priorRounds);
    orderedActiveIds = ranking.filter((row) => activeSet.has(row.player.id)).map((row) => row.player.id);
    for (const row of ranking) {
      if (row.stats.currentCourt != null) previousCourtByPlayerId.set(row.player.id, row.stats.currentCourt);
    }
  }

  const courtGroups =
    phase === 'grading'
      ? allocatePlayersToCourts(orderedActiveIds, courtsUsed)
      : applyCourtMovementLimit(orderedActiveIds, previousCourtByPlayerId, courtsUsed, settings.maxCourtMovement);

  // "Avoid repeating the previous round's partner" needs to know who
  // partnered whom last round specifically (separate from the cumulative
  // partnerHistory counts, which createBalancedPartnerships also checks).
  const previousRoundPartnerById = new Map<string, string>();
  if (lastRound) {
    for (const court of lastRound.courts) {
      const [p1, p2] = court.team1PlayerIds;
      const [p3, p4] = court.team2PlayerIds;
      previousRoundPartnerById.set(p1, p2);
      previousRoundPartnerById.set(p2, p1);
      previousRoundPartnerById.set(p3, p4);
      previousRoundPartnerById.set(p4, p3);
    }
  }

  const statsById = new Map(stats.map((s) => [s.playerId, s]));
  const courts: DynamicPairingCourtAssignment[] = courtGroups.map((group, index) => {
    const { team1, team2 } = createBalancedPartnerships(group, statsById, previousRoundPartnerById);
    return {
      courtNumber: index + 1,
      playerIds: [...team1, ...team2],
      team1PlayerIds: team1,
      team2PlayerIds: team2,
      status: 'pending',
    };
  });

  return {
    id: makeDynamicPairingId('round'),
    roundNumber,
    phase,
    status: 'current',
    courts,
    restingPlayerIds: restingIds,
    createdAt: Date.now(),
  };
}

// Applies a submitted score to one court within a round. Returns a new
// Round object (immutable update, same pattern as the rest of the app).
export function processDynamicPairingScore(
  round: DynamicPairingRound,
  courtNumber: number,
  score1: number,
  score2: number,
): DynamicPairingRound {
  return {
    ...round,
    courts: round.courts.map((court) =>
      court.courtNumber === courtNumber
        ? {
            ...court,
            score1,
            score2,
            winnerTeam: score1 === score2 ? undefined : score1 > score2 ? 1 : 2,
            status: 'completed',
          }
        : court,
    ),
  };
}

// Marks a round read-only once the next round has been generated — see
// DynamicPairingRoundStatus.
export function lockCompletedRound(round: DynamicPairingRound): DynamicPairingRound {
  return { ...round, status: 'locked' };
}

// Pre-generates every grading round (settings.gradingRounds, default 3) up
// front at session start, instead of one at a time — the organiser sees
// the whole grading schedule immediately in All Rounds. Each round is
// still built by generateDynamicPairingRound exactly as before, called
// sequentially with the rounds generated so far as `priorRounds` — so rest
// fairness and partner/opponent variety are computed against this
// *projected* schedule (round 3 already knows about round 1 and 2's
// planned rests/partnerships) even though none of them have been played
// yet. Only the first round is playable immediately ('current'); the rest
// are 'upcoming' until generateNextRound activates them in order. A
// gradingRounds of 0 falls back to pre-generating just Round 1 (which
// immediately gets phase 'ranking'), matching the pre-pre-generation
// single-round start behaviour.
export function generateInitialGradingRounds(
  players: Player[],
  settings: DynamicPairingSettings,
): DynamicPairingRound[] {
  const roundsToGenerate = Math.max(1, settings.gradingRounds);
  const rounds: DynamicPairingRound[] = [];
  for (let i = 0; i < roundsToGenerate; i++) {
    rounds.push(generateDynamicPairingRound(players, settings, rounds));
  }
  return rounds.map((round, index) => (index === 0 ? round : { ...round, status: 'upcoming' }));
}

// True once every generated round has been played (locked) and none is
// currently active — i.e. the pre-generated grading batch just finished
// and Round 4+ hasn't been generated yet. Deliberately derived from
// `rounds`/`settings` rather than a stored flag, so a page refresh mid-review
// lands back here automatically (see README's "LocalStorage" section).
export function isAwaitingSkillReview(rounds: DynamicPairingRound[], settings: DynamicPairingSettings): boolean {
  if (rounds.length === 0) return false;
  if (rounds.some((r) => r.status === 'current')) return false;
  return isGradingPhaseComplete(rounds, settings);
}

// Rounds that have actually been played (or are being played right now) —
// excludes 'upcoming' pre-generated rounds. Stats/rankings/rest-history
// must only ever be computed from this, never the raw `rounds` array,
// while grading rounds are still pre-generated but not yet reached —
// otherwise a not-yet-played Round 3 would inflate rest counts, win/loss
// records, and partner history before it's actually been played. (Round
// *generation* itself is the one deliberate exception — see
// generateInitialGradingRounds — since it's meant to plan fairness across
// the whole projected batch.)
export function playedDynamicPairingRounds(rounds: DynamicPairingRound[]): DynamicPairingRound[] {
  return rounds.filter((r) => r.status !== 'upcoming');
}

// Label for a round's current place in the schedule — see
// DynamicPairingRoundStatus. 'completed' is a forward-compat synonym this
// app never actually produces (lockCompletedRound always uses 'locked');
// both render identically.
export function roundStatusLabel(status: DynamicPairingRoundStatus): string {
  switch (status) {
    case 'upcoming':
      return 'Upcoming';
    case 'current':
      return 'Current';
    case 'completed':
    case 'locked':
      return 'Completed';
  }
}

// What the "advance" button on Current Round should say and do next:
// activate the next pre-generated grading round if one's waiting, hand off
// to Admin Skill Review if this was the last grading round, or generate a
// fresh ranking round otherwise (Round 5+). Mirrors the branching in
// useDynamicPairingSocial's generateNextRound — kept as a pure function so
// the button label can never drift out of sync with what clicking it
// actually does.
export function nextRoundButtonLabel(currentRound: DynamicPairingRound, rounds: DynamicPairingRound[]): string {
  const upcoming = rounds.find((r) => r.roundNumber === currentRound.roundNumber + 1 && r.status === 'upcoming');
  if (upcoming) return `Continue to Round ${upcoming.roundNumber}`;
  if (currentRound.phase === 'grading') return 'Continue to Admin Skill Review';
  return 'Generate Next Round';
}

// Display label for a round's phase — see DynamicPairingRoundPhase.
export function roundPhaseLabel(phase: DynamicPairingRoundPhase): string {
  return phase === 'grading' ? 'Random Grading' : 'Dynamic Pairing';
}

export function gameFormatLabel(format: DynamicGameFormat): string {
  return format === 'timed' ? 'Timed Round' : 'First to Score';
}

// Shared by DynamicPairingRankings and DynamicPairingAdminSkillReview so a
// point differential always reads the same way (e.g. "+3.5" / "-2") in both
// places.
export function formatSignedPoints(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function courtMovementLimitLabel(limit: CourtMovementLimit): string {
  switch (limit) {
    case 'unrestricted':
      return 'Unrestricted';
    case 'max-1':
      return 'Max 1 Court';
    case 'max-2':
      return 'Max 2 Courts';
  }
}
