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
  DynamicPairingEntrant,
  DynamicPairingPlayerStats,
  DynamicPairingRound,
  DynamicPairingRoundPhase,
  DynamicPairingRoundStatus,
  DynamicPairingSettings,
  DynamicPairingTeam,
  Player,
  PlayerAvailabilityStatus,
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

// Shared by DynamicPairingSetup and DynamicPairingRestingPlayers, kept in
// this file (rather than utils/tournament.ts) so this mode's label wording
// can't be affected by an unrelated change to Standard Social Play's copy —
// same isolation rationale as everything else in this file.
export function dynamicPairingAvailabilityLabel(status: PlayerAvailabilityStatus): string {
  switch (status) {
    case 'available':
      return 'Available';
    case 'resting-this-round':
      return 'Resting This Round';
    case 'late':
      return 'Late';
    case 'left-early':
      return 'Left Early';
    case 'injured':
      return 'Injured';
    case 'unavailable':
      return 'Unavailable';
  }
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

// --- Fixed teams & entrants -------------------------------------------
// Optional layer on top of the individual-player model above, for the
// "Fixed Team" option (see README's "Fixed teams"). A DynamicPairingTeam is
// two existing `players` ids that always play, rest, and get scored
// together — never a separate roster. Because a team's two members always
// share the exact same court/result/rest every round (round generation
// below guarantees this), their per-player DynamicPairingPlayerStats rows
// end up identical by construction — so a team's "stats" are simply
// either member's stats, with no separate stats-storage type needed. This
// also means partner/opponent history (keyed by physical player id) still
// correctly reflects which *physical players* have faced each other,
// regardless of team structure — createBalancedPartnerships-style
// repeat-avoidance keeps working unmodified at the entrant layer.
//
// An "entrant" (DynamicPairingEntrant) is the derived, display/ranking-
// facing unit: one individual player, or one fixed team. Entrants are
// never stored — see buildDynamicPairingEntrants below.

export function dynamicPairingTeamDisplayName(team: DynamicPairingTeam, players: Player[]): string {
  const [aId, bId] = team.playerIds;
  const aName = players.find((p) => p.id === aId)?.name ?? 'Player 1';
  const bName = players.find((p) => p.id === bId)?.name ?? 'Player 2';
  return `${aName} / ${bName}`;
}

// A player can belong to at most one fixed team — enforced by construction
// (useDynamicPairingSocial.makeDynamicPairingTeam refuses to reuse a
// player who's already on a team), so filtering individuals down to
// "everyone not already claimed by a team" is always unambiguous.
export function buildDynamicPairingEntrants(players: Player[], teams: DynamicPairingTeam[]): DynamicPairingEntrant[] {
  const teamMemberIds = new Set(teams.flatMap((t) => t.playerIds));
  const individualEntrants: DynamicPairingEntrant[] = players
    .filter((p) => !teamMemberIds.has(p.id))
    .map((p) => ({
      id: p.id,
      type: 'individual-player',
      displayName: p.name,
      playerIds: [p.id],
      seed: p.startingSeed,
      skillLevel: p.skillLevel,
      rating: p.rating,
    }));
  const teamEntrants: DynamicPairingEntrant[] = teams.map((t) => ({
    id: t.id,
    type: 'fixed-team',
    displayName: dynamicPairingTeamDisplayName(t, players),
    playerIds: [...t.playerIds],
    seed: t.seed,
    skillLevel: t.skillLevel,
    rating: t.rating,
  }));
  return [...individualEntrants, ...teamEntrants];
}

// A fixed team is only available to play/rest as a unit when *both* of its
// members are individually available — same rule Standard Social Play's
// fixed teams follow (see utils/tournament.ts).
export function isEntrantAvailable(entrant: DynamicPairingEntrant, playersById: Map<string, Player>): boolean {
  return entrant.playerIds.every((id) => {
    const player = playersById.get(id);
    return player != null && isPlayerAvailable(player);
  });
}

// Mirrors utils/tournament.ts's isFixedTeamSide — a court side counts as a
// fixed team only when it's exactly that team's two players, so a
// temporary pairing that happens to reuse the same two ids after a team is
// split is never mistaken for the (now former) team.
export function isDynamicPairingFixedTeamSide(playerIds: string[], teams: DynamicPairingTeam[]): boolean {
  if (playerIds.length !== 2) return false;
  const key = [...playerIds].sort().join('|');
  return teams.some((team) => [...team.playerIds].sort().join('|') === key);
}

// Entrant id(s) for one side of a court — falls back to treating each
// physical player as their own entrant when team1EntrantIds/
// team2EntrantIds is absent (rounds generated before fixed teams existed,
// or any round where no fixed team was involved).
export function entrantIdsForSide(court: DynamicPairingCourtAssignment, side: 1 | 2): string[] {
  const explicit = side === 1 ? court.team1EntrantIds : court.team2EntrantIds;
  return explicit ?? (side === 1 ? court.team1PlayerIds : court.team2PlayerIds);
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

// Entrant-level version of selectRestingPlayers, used only once a fixed
// team exists (see generateDynamicPairingRoundWithTeams) — same fairness
// order (fewest total rests, then most consecutive rounds played, then
// didn't rest last round, then a stable tiebreak), but selecting *entrants*
// (physical footprint 1 or 2) to keep active physical players at or under
// `courtsUsed * 4`. A fixed team rests or plays as one atomic unit.
//
// Because entrant size varies, a single greedy pass in fairness order can
// occasionally leave one physical slot unfilled (e.g. exactly one slot of
// capacity remains and every not-yet-placed entrant is a 2-player team).
// That's accepted rather than solved with a full bin-packing search:
// filling every last slot would sometimes require resting a *fairer*
// entrant to make room for a worse-fitting one, which would violate rest
// fairness — so this deliberately prioritises fairness over perfect court
// utilisation (see the file-level comment on why rest stays independent of
// everything else). See README's "Current limitations".
export function selectRestingEntrants(
  availableEntrants: DynamicPairingEntrant[],
  representativeStatsById: Map<string, DynamicPairingPlayerStats>,
  courtsUsed: number,
  lastRoundRestingEntrantIds: Set<string>,
): { restingEntrantIds: string[]; activeEntrantIds: string[] } {
  const capacity = calculateActiveCapacity(courtsUsed);

  const sorted = [...availableEntrants].sort((a, b) => {
    const sa = representativeStatsById.get(a.id) ?? emptyStats(a.id);
    const sb = representativeStatsById.get(b.id) ?? emptyStats(b.id);
    if (sa.totalRests !== sb.totalRests) return sa.totalRests - sb.totalRests;
    if (sb.consecutiveRoundsPlayed !== sa.consecutiveRoundsPlayed) {
      return sb.consecutiveRoundsPlayed - sa.consecutiveRoundsPlayed;
    }
    const aRestedLastRound = lastRoundRestingEntrantIds.has(a.id) ? 1 : 0;
    const bRestedLastRound = lastRoundRestingEntrantIds.has(b.id) ? 1 : 0;
    if (aRestedLastRound !== bRestedLastRound) return aRestedLastRound - bRestedLastRound;
    return stableRandomTiebreak(a.id, b.id);
  });

  const active: DynamicPairingEntrant[] = [];
  let remaining = capacity;
  for (const entrant of sorted) {
    const size = entrant.playerIds.length;
    if (size <= remaining) {
      active.push(entrant);
      remaining -= size;
    }
  }

  const activeIds = new Set(active.map((e) => e.id));
  const restingEntrantIds = availableEntrants.filter((e) => !activeIds.has(e.id)).map((e) => e.id);
  return { restingEntrantIds, activeEntrantIds: Array.from(activeIds) };
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

// --- Entrant ranking -----------------------------------------------------
// Entrant-level counterpart of getPlayerHeadToHead/sortPlayersByRanking/
// calculatePlayerRankings above, used for Rankings and Admin Skill Review
// once fixed teams exist. Falls back to entrantIdsForSide so it reads
// correctly even for rounds that predate fixed teams (or a round where no
// team was involved) — every player there is their own entrant 1:1, so the
// result is identical to getPlayerHeadToHead in that case.
export function getEntrantHeadToHead(aId: string, bId: string, rounds: DynamicPairingRound[]): number {
  let aWins = 0;
  let bWins = 0;
  for (const round of rounds) {
    for (const court of round.courts) {
      if (court.score1 == null || court.score2 == null || court.score1 === court.score2) continue;
      const side1 = entrantIdsForSide(court, 1);
      const side2 = entrantIdsForSide(court, 2);
      const aSide = side1.includes(aId) ? 1 : side2.includes(aId) ? 2 : 0;
      const bSide = side1.includes(bId) ? 1 : side2.includes(bId) ? 2 : 0;
      if (aSide === 0 || bSide === 0 || aSide === bSide) continue;
      const winnerTeam = court.score1 > court.score2 ? 1 : 2;
      if (aSide === winnerTeam) aWins += 1;
      else bWins += 1;
    }
  }
  if (aWins === bWins) return 0;
  return aWins > bWins ? -1 : 1;
}

export interface RankedEntrant {
  entrant: DynamicPairingEntrant;
  stats: DynamicPairingPlayerStats;
  rank: number;
}

// Same ranking priority/order as sortPlayersByRanking (see that function's
// comment) — win % → avg point differential → avg points scored → head-to-
// head → skill level → seed → previous rank → stable tiebreak — just keyed
// by entrant id instead of player id. `statsById` supplies each entrant's
// representative stats (see calculateEntrantRankings: either the
// individual's own stats, or a fixed team's — either member's, since both
// are identical by construction).
export function sortEntrantsByRanking(
  entrants: DynamicPairingEntrant[],
  statsById: Map<string, DynamicPairingPlayerStats>,
  rounds: DynamicPairingRound[],
  previousRankById: Map<string, number>,
): RankedEntrant[] {
  const rows = entrants.map((entrant) => ({ entrant, stats: statsById.get(entrant.id) ?? emptyStats(entrant.id) }));

  rows.sort((a, b) => {
    if (b.stats.winPercentage !== a.stats.winPercentage) return b.stats.winPercentage - a.stats.winPercentage;
    if (b.stats.averagePointDifferential !== a.stats.averagePointDifferential) {
      return b.stats.averagePointDifferential - a.stats.averagePointDifferential;
    }
    if (b.stats.averagePointsScored !== a.stats.averagePointsScored) {
      return b.stats.averagePointsScored - a.stats.averagePointsScored;
    }
    const h2h = getEntrantHeadToHead(a.entrant.id, b.entrant.id, rounds);
    if (h2h !== 0) return h2h;
    const skillA = a.entrant.skillLevel ?? Infinity;
    const skillB = b.entrant.skillLevel ?? Infinity;
    if (skillA !== skillB) return skillA - skillB;
    const seedA = a.entrant.seed ?? Infinity;
    const seedB = b.entrant.seed ?? Infinity;
    if (seedA !== seedB) return seedA - seedB;
    const prevA = previousRankById.get(a.entrant.id) ?? Infinity;
    const prevB = previousRankById.get(b.entrant.id) ?? Infinity;
    if (prevA !== prevB) return prevA - prevB;
    return stableRandomTiebreak(a.entrant.id, b.entrant.id);
  });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

// Entrant-level counterpart of calculatePlayerRankings. Always safe to call
// even when `teams` is empty — buildDynamicPairingEntrants then returns one
// entrant per player, so results match calculatePlayerRankings exactly
// (just re-derived through the entrant layer), which is why UI components
// can use this unconditionally instead of branching on whether teams exist.
export function calculateEntrantRankings(
  players: Player[],
  teams: DynamicPairingTeam[],
  rounds: DynamicPairingRound[],
): RankedEntrant[] {
  const entrants = buildDynamicPairingEntrants(players, teams);
  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);

  let previousRankById = new Map<string, number>();
  let latest: RankedEntrant[] = [];

  for (let i = 0; i <= sortedRounds.length; i++) {
    const roundsSoFar = sortedRounds.slice(0, i);
    const playerStats = calculateDynamicPairingStats(players, roundsSoFar);
    const playerStatsById = new Map(playerStats.map((s) => [s.playerId, s]));
    const entrantStatsById = new Map(
      entrants.map((e) => [e.id, playerStatsById.get(e.playerIds[0]) ?? emptyStats(e.playerIds[0])]),
    );
    const ranked = sortEntrantsByRanking(entrants, entrantStatsById, roundsSoFar, previousRankById);
    latest = ranked.map((row) => ({
      ...row,
      stats: { ...row.stats, previousRank: previousRankById.get(row.entrant.id) ?? null, currentRank: row.rank },
    }));
    previousRankById = new Map(ranked.map((row) => [row.entrant.id, row.rank]));
  }

  return latest;
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

// --- Entrant-aware round generation (fixed teams) -----------------------
// Used only when at least one fixed team exists (see
// generateDynamicPairingRoundForEntrants below) — generateDynamicPairingRound
// above stays completely untouched and keeps handling every individual-only
// session exactly as before.

export interface DynamicPairingSide {
  playerIds: string[]; // exactly 2 physical players
  entrantIds: string[]; // 1 (fixed team) or 2 (temporary pairing of individuals)
}

// Turns a best-to-worst ranked list of active entrants into complete
// doubles sides: a fixed team becomes its own side immediately; individual
// entrants are paired two at a time in the order they're encountered
// (i.e. by rank-adjacency, skipping over any fixed teams in between) —
// deliberately no repeat-partner optimisation pass here (unlike
// createBalancedPartnerships), since ranking order naturally reshuffles who
// ends up adjacent round to round, and adding a second optimisation layer
// on top of an already-ranked, already-team-aware list was judged
// unnecessary complexity for this feature's scope (see README's "Current
// limitations"). If the number of active individual entrants is odd (only
// possible via the rare rest-selection under-fill described in
// selectRestingEntrants), the single leftover entrant can't form a side and
// is returned as `oddOneOutEntrantId` for the caller to rest instead.
export function buildSidesFromRankedEntrants(rankedActiveEntrants: DynamicPairingEntrant[]): {
  sides: DynamicPairingSide[];
  oddOneOutEntrantId?: string;
} {
  const sides: DynamicPairingSide[] = [];
  let pending: DynamicPairingEntrant | null = null;

  for (const entrant of rankedActiveEntrants) {
    if (entrant.type === 'fixed-team') {
      sides.push({ playerIds: [...entrant.playerIds], entrantIds: [entrant.id] });
    } else if (pending == null) {
      pending = entrant;
    } else {
      sides.push({ playerIds: [pending.playerIds[0], entrant.playerIds[0]], entrantIds: [pending.id, entrant.id] });
      pending = null;
    }
  }

  return { sides, oddOneOutEntrantId: pending?.id };
}

// Groups already best-to-worst-ordered sides two per court. No court-
// movement-limit support in this path (unlike applyCourtMovementLimit
// above) — sides are a mix of fixed teams and ad hoc pairings, and porting
// movement clamping to that granularity was judged unnecessary complexity
// for this feature's scope; every round is freshly ranked best-to-worst
// instead. See README's "Current limitations".
export function groupSidesIntoCourts(sides: DynamicPairingSide[], courtsUsed: number): DynamicPairingCourtAssignment[] {
  const courts: DynamicPairingCourtAssignment[] = [];
  for (let i = 0; i < courtsUsed; i++) {
    const sideA = sides[i * 2];
    const sideB = sides[i * 2 + 1];
    if (!sideA || !sideB) break;
    courts.push({
      courtNumber: i + 1,
      playerIds: [...sideA.playerIds, ...sideB.playerIds],
      team1PlayerIds: sideA.playerIds,
      team2PlayerIds: sideB.playerIds,
      team1EntrantIds: sideA.entrantIds,
      team2EntrantIds: sideB.entrantIds,
      status: 'pending',
    });
  }
  return courts;
}

// Entrant-aware counterpart of generateDynamicPairingRound, used once at
// least one fixed team exists. Grading rounds still shuffle (no ranking
// data to use yet); ranking rounds rank entrants best-to-worst and build
// sides via buildSidesFromRankedEntrants. Per-player stats
// (calculateDynamicPairingStats) and partner/opponent history are read
// completely unmodified — see the "Fixed teams & entrants" section above
// for why that's safe.
export function generateDynamicPairingRoundWithTeams(
  players: Player[],
  teams: DynamicPairingTeam[],
  settings: DynamicPairingSettings,
  priorRounds: DynamicPairingRound[],
): DynamicPairingRound {
  const roundNumber = priorRounds.length + 1;
  const phase: DynamicPairingRound['phase'] = roundNumber <= settings.gradingRounds ? 'grading' : 'ranking';

  const playersById = new Map(players.map((p) => [p.id, p]));
  const entrants = buildDynamicPairingEntrants(players, teams);
  const availableEntrants = entrants.filter((e) => isEntrantAvailable(e, playersById));
  const availablePhysicalCount = availableEntrants.reduce((sum, e) => sum + e.playerIds.length, 0);
  const courtsUsed = calculateCourtsUsed(settings.numberOfCourts, availablePhysicalCount);

  const playerStats = calculateDynamicPairingStats(players, priorRounds);
  const playerStatsById = new Map(playerStats.map((s) => [s.playerId, s]));
  const entrantStatsById = new Map(
    availableEntrants.map((e) => [e.id, playerStatsById.get(e.playerIds[0]) ?? emptyStats(e.playerIds[0])]),
  );

  const lastRound = priorRounds.length > 0 ? priorRounds[priorRounds.length - 1] : undefined;
  const lastRoundRestingEntrantIds = new Set(lastRound?.restingEntrantIds ?? lastRound?.restingPlayerIds ?? []);

  const { restingEntrantIds, activeEntrantIds } = selectRestingEntrants(
    availableEntrants,
    entrantStatsById,
    courtsUsed,
    lastRoundRestingEntrantIds,
  );
  const availableEntrantById = new Map(availableEntrants.map((e) => [e.id, e]));
  const activeEntrantIdSet = new Set(activeEntrantIds);

  let orderedActiveEntrants: DynamicPairingEntrant[];
  if (phase === 'grading') {
    orderedActiveEntrants = shuffle(activeEntrantIds.map((id) => availableEntrantById.get(id)!));
  } else {
    const ranking = calculateEntrantRankings(players, teams, priorRounds);
    orderedActiveEntrants = ranking
      .filter((row) => activeEntrantIdSet.has(row.entrant.id))
      .map((row) => row.entrant);
  }

  const { sides, oddOneOutEntrantId } = buildSidesFromRankedEntrants(orderedActiveEntrants);
  const courts = groupSidesIntoCourts(sides, courtsUsed);

  const allRestingEntrantIds = oddOneOutEntrantId ? [...restingEntrantIds, oddOneOutEntrantId] : restingEntrantIds;
  const restingPlayerIds = allRestingEntrantIds.flatMap((id) => availableEntrantById.get(id)?.playerIds ?? []);

  return {
    id: makeDynamicPairingId('round'),
    roundNumber,
    phase,
    status: 'current',
    courts,
    restingPlayerIds,
    restingEntrantIds: allRestingEntrantIds,
    createdAt: Date.now(),
  };
}

// The dispatcher every caller should use from here on: keeps the original,
// well-tested individual-only path completely untouched when there are no
// fixed teams, and only routes into the new entrant-aware generator once at
// least one exists (per the design brief's explicit permission to branch
// this way).
export function generateDynamicPairingRoundForEntrants(
  players: Player[],
  teams: DynamicPairingTeam[],
  settings: DynamicPairingSettings,
  priorRounds: DynamicPairingRound[],
): DynamicPairingRound {
  if (teams.length === 0) return generateDynamicPairingRound(players, settings, priorRounds);
  return generateDynamicPairingRoundWithTeams(players, teams, settings, priorRounds);
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

// --- Mid-session player/court changes -------------------------------------
// See README's "Mid-session player and court changes". Only ever touches
// pre-generated-but-'upcoming' grading rounds (Round 4+ is generated one at
// a time by generateNextRound, so a court-count or availability change just
// takes effect on the next click there — nothing to regenerate) and the
// live 'current' round (for a swap). 'locked'/'completed' rounds are never
// rewritten.

// Regenerates every still-'upcoming' pre-generated grading round against
// the current player pool/settings — call after a player's availability
// changes or the court count changes, mid-grading-phase. A no-op once
// grading is over (there's nothing left pre-generated to regenerate).
export function regenerateUpcomingGradingRounds(
  players: Player[],
  settings: DynamicPairingSettings,
  rounds: DynamicPairingRound[],
): DynamicPairingRound[] {
  const kept = rounds.filter((round) => round.status !== 'upcoming');
  const upcomingCount = rounds.length - kept.length;
  if (upcomingCount === 0) return rounds;

  let generated = [...kept];
  for (let i = 0; i < upcomingCount; i++) {
    generated = [...generated, { ...generateDynamicPairingRound(players, settings, generated), status: 'upcoming' }];
  }
  return generated;
}

// Entrant-aware counterpart of regenerateUpcomingGradingRounds — same
// behaviour, routed through generateDynamicPairingRoundForEntrants so it
// stays a no-op-when-no-teams-exist wrapper around the original.
export function regenerateUpcomingGradingRoundsForEntrants(
  players: Player[],
  teams: DynamicPairingTeam[],
  settings: DynamicPairingSettings,
  rounds: DynamicPairingRound[],
): DynamicPairingRound[] {
  const kept = rounds.filter((round) => round.status !== 'upcoming');
  const upcomingCount = rounds.length - kept.length;
  if (upcomingCount === 0) return rounds;

  let generated = [...kept];
  for (let i = 0; i < upcomingCount; i++) {
    generated = [
      ...generated,
      { ...generateDynamicPairingRoundForEntrants(players, teams, settings, generated), status: 'upcoming' },
    ];
  }
  return generated;
}

// `teams` defaults to none, so existing individual-only callers are
// unaffected. Once a fixed team exists, this refuses to split one via a
// swap — same rule Standard Social Play's canSwapPlayerInRound enforces
// (see isFixedTeamSide there / isDynamicPairingFixedTeamSide here) — on
// *either* side of the swap: the active side can't be a fixed team, and the
// resting player being swapped in can't themselves be a fixed-team member
// whose partner isn't also resting (swapping them in alone would split the
// team just as much as swapping one out would).
export function canSwapPlayerInDynamicPairingRound(
  round: DynamicPairingRound,
  activePlayerId: string,
  restingPlayerId: string,
  teams: DynamicPairingTeam[] = [],
): { ok: true } | { ok: false; reason: string } {
  if (round.status !== 'current') {
    return { ok: false, reason: 'Swaps are only allowed in the current round.' };
  }
  if (activePlayerId === restingPlayerId) {
    return { ok: false, reason: 'Choose two different players to swap.' };
  }
  if (!round.restingPlayerIds.includes(restingPlayerId)) {
    return { ok: false, reason: 'That player is not resting this round.' };
  }
  const court = round.courts.find((c) => c.playerIds.includes(activePlayerId));
  if (!court) {
    return { ok: false, reason: 'That player is not assigned to a court this round.' };
  }
  if (court.score1 != null || court.score2 != null) {
    return { ok: false, reason: "That court's score is already submitted — swaps are only allowed before that." };
  }
  const side = court.team1PlayerIds.includes(activePlayerId) ? court.team1PlayerIds : court.team2PlayerIds;
  if (isDynamicPairingFixedTeamSide(side, teams)) {
    return { ok: false, reason: "That player is on a fixed team, which can't be split by a swap." };
  }
  const restingTeam = teams.find((t) => t.playerIds.includes(restingPlayerId));
  if (restingTeam && !round.restingPlayerIds.includes(restingTeam.playerIds.find((id) => id !== restingPlayerId)!)) {
    return { ok: false, reason: "That player is on a fixed team and can't be swapped in without their partner." };
  }
  return { ok: true };
}

// Pure round edit — see canSwapPlayerInDynamicPairingRound for the rules.
// Preserves which team the swapped-in player joins (team1 vs team2). Since
// canSwapPlayerInDynamicPairingRound already guarantees the swapped side is
// never a fixed team, the entrant id being replaced always equals the
// player id being replaced (individual entrants are always 1:1 with their
// player id) — so team1EntrantIds/team2EntrantIds can be updated with the
// exact same replacement, when present.
export function swapPlayerInDynamicPairingRound(
  round: DynamicPairingRound,
  activePlayerId: string,
  restingPlayerId: string,
): DynamicPairingRound {
  const replaceIn = (playerIds: string[]) => playerIds.map((id) => (id === activePlayerId ? restingPlayerId : id));
  return {
    ...round,
    courts: round.courts.map((court) =>
      court.playerIds.includes(activePlayerId)
        ? {
            ...court,
            playerIds: replaceIn(court.playerIds),
            team1PlayerIds: replaceIn(court.team1PlayerIds),
            team2PlayerIds: replaceIn(court.team2PlayerIds),
            team1EntrantIds: court.team1EntrantIds ? replaceIn(court.team1EntrantIds) : court.team1EntrantIds,
            team2EntrantIds: court.team2EntrantIds ? replaceIn(court.team2EntrantIds) : court.team2EntrantIds,
          }
        : court,
    ),
    restingPlayerIds: round.restingPlayerIds.map((id) => (id === restingPlayerId ? activePlayerId : id)),
    restingEntrantIds: round.restingEntrantIds?.map((id) => (id === restingPlayerId ? activePlayerId : id)),
  };
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

// Entrant-aware counterpart of generateInitialGradingRounds, called at
// session start whenever at least one fixed team exists.
export function generateInitialGradingRoundsForEntrants(
  players: Player[],
  teams: DynamicPairingTeam[],
  settings: DynamicPairingSettings,
): DynamicPairingRound[] {
  if (teams.length === 0) return generateInitialGradingRounds(players, settings);
  const roundsToGenerate = Math.max(1, settings.gradingRounds);
  const rounds: DynamicPairingRound[] = [];
  for (let i = 0; i < roundsToGenerate; i++) {
    rounds.push(generateDynamicPairingRoundWithTeams(players, teams, settings, rounds));
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
