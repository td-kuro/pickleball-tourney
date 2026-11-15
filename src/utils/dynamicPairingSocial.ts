import { courtLabel, resolveCourtNumbers } from './courtNumbers';
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
// - Court/partnership allocation (applyCourtMovementLimit for the
//   preferred arrangement, then the "Court arrangement search") only runs
//   on whoever is left *after* both of the above have already been
//   decided.
//
// Gender-aware pairing (see "Gender-aware pairing" below) is a soft
// preference layered *inside* that third step, never a fourth independent
// system: it only ever chooses between partnership options that court/
// partnership allocation had already decided are otherwise equally valid
// (same players, same ranking-driven court groupings) — it never moves a
// player to a different court, changes who rests, or overrides an
// opponent-rotation/repeat-partner penalty. See shouldUseGenderAwarePairing.

import type {
  CourtMovementLimit,
  DynamicGameFormat,
  DynamicPairingCourtAssignment,
  DynamicPairingEntrant,
  DynamicPairingPlayerStats,
  DynamicPairingRankingBasis,
  DynamicPairingRound,
  DynamicPairingRoundPhase,
  DynamicPairingRoundStatus,
  DynamicPairingSettings,
  DynamicPairingTeam,
  GradingDivision,
  Player,
  PlayerAvailabilityStatus,
  PlayerGender,
  ResultSubmission,
} from '../types';
// Tiny type-only-dependency leaf modules shared by every mode (see their
// own file headers) — not another mode's logic, so this file's isolation
// from utils/tournament.ts/pairing.ts/poolsKnockout.ts/kingCourt.ts holds.
import { lastByeRoundWithAbsence, playersForFutureRounds, teamByeAdjustment } from './availability';
import { CONSECUTIVE_BYE_NOTE, selectFairByes, type ByeCandidate } from './byeSelection';
import { hasAnyResult, normalizeScoreRecordingMode, resolveWinner } from './results';

// --- Capacity ---------------------------------------------------------

export function calculateActiveCapacity(numberOfCourts: number): number {
  return Math.max(0, numberOfCourts) * 4;
}

export function calculateCourtsUsed(availableCourts: number, availablePlayers: number): number {
  return Math.min(Math.max(0, availableCourts), Math.floor(Math.max(0, availablePlayers) / 4));
}

// `roundNumber` (the round being generated/checked) is optional — see
// utils/tournament.ts's isPlayerAvailableForScheduling for why: every
// existing call site keeps working unchanged when omitted (a 'new-joiner'
// with no round context is conservatively excluded), and it's threaded
// through wherever a specific round is actually being built so a
// mid-session-added player's effectiveFromRound is honoured. Mirrors
// utils/tournament.ts's function rather than importing it — same
// deliberate isolation as everything else in this file (see the file
// header).
export function isPlayerAvailable(player: Player, roundNumber?: number): boolean {
  const status = player.availabilityStatus ?? 'available';
  if (status === 'new-joiner') {
    return roundNumber != null && player.effectiveFromRound != null && roundNumber >= player.effectiveFromRound;
  }
  return status === 'available';
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
    case 'new-joiner':
      return 'New';
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
  const targetRoundNumber = currentRound ? currentRound.roundNumber + 1 : 1;
  const available = players.filter((p) => isPlayerAvailable(p, targetRoundNumber));
  if (available.length < 4) {
    return { ok: false, reason: 'At least 4 available players are required to create one doubles match.' };
  }
  if (players.some((p) => p.name.trim() === '')) {
    return { ok: false, reason: 'Every player needs a name before starting matches.' };
  }
  if (currentRound && !isDynamicPairingRoundComplete(currentRound)) {
    return { ok: false, reason: 'Enter a result for every court in the current round before generating the next one.' };
  }
  return { ok: true };
}

// The winner of a court, whichever way the result was recorded — derived
// from score1/score2 for a full score, or the recorded winnerTeam for a
// Win/Loss-only result (see ScoreRecordingMode).
export function courtWinner(court: DynamicPairingCourtAssignment): 1 | 2 | undefined {
  return resolveWinner(court.score1, court.score2, court.winnerTeam, 1 as const, 2 as const);
}

export function courtHasResult(court: DynamicPairingCourtAssignment): boolean {
  return hasAnyResult(court.score1, court.score2, court.winnerTeam);
}

export function isDynamicPairingRoundComplete(round: DynamicPairingRound): boolean {
  return round.courts.every(courtHasResult);
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
    scoredGamesPlayed: 0,
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
// for "who played with/against whom", not just "who won") — see the
// "Court arrangement search", which reads this history back.
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

      const winnerTeam = courtWinner(court);
      if (winnerTeam == null) continue;
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
    s.averagePointDifferential = s.scoredGamesPlayed > 0 ? s.pointDifferential / s.scoredGamesPlayed : 0;
    s.averagePointsScored = s.scoredGamesPlayed > 0 ? s.pointsFor / s.scoredGamesPlayed : 0;
  }

  return Array.from(statsById.values());
}

// Scores are absent for a Win/Loss-only result: the game and the win/loss
// still count, but nothing is added to the point totals.
function applyGameResult(
  statsById: Map<string, DynamicPairingPlayerStats>,
  playerIds: string[],
  ownScore: number | undefined,
  opponentScore: number | undefined,
  won: boolean,
) {
  for (const id of playerIds) {
    const s = statsById.get(id);
    if (!s) continue;
    s.gamesPlayed += 1;
    if (ownScore != null && opponentScore != null) {
      s.scoredGamesPlayed += 1;
      s.pointsFor += ownScore;
      s.pointsAgainst += opponentScore;
      s.pointDifferential += ownScore - opponentScore;
    }
    if (won) s.wins += 1;
    else s.losses += 1;
  }
}

// Rest-selection input only: recorded rests plus any late-return
// normalisation (see Player.byeCountAdjustment). Never used for displayed
// stats, which always show rests exactly as they happened.
function withByeAdjustment(
  stats: DynamicPairingPlayerStats,
  playerIds: string[],
  playersById: Map<string, Player>,
): DynamicPairingPlayerStats {
  const adjustment = teamByeAdjustment(playerIds, playersById);
  const lastRestRound = lastByeRoundWithAbsence(stats.lastRestRound ?? undefined, playerIds.map((id) => playersById.get(id))) ?? null;
  if (adjustment === 0 && lastRestRound === stats.lastRestRound) return stats;
  return { ...stats, totalRests: stats.totalRests + adjustment, lastRestRound };
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
      const winnerTeam = courtWinner(court);
      if (winnerTeam == null) continue;
      const aTeam = court.team1PlayerIds.includes(aId) ? 1 : court.team2PlayerIds.includes(aId) ? 2 : 0;
      const bTeam = court.team1PlayerIds.includes(bId) ? 1 : court.team2PlayerIds.includes(bId) ? 2 : 0;
      if (aTeam === 0 || bTeam === 0 || aTeam === bTeam) continue; // not opponents this match
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
// regardless of team structure — the court arrangement search's
// repeat-avoidance works unmodified at the entrant layer.
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
      gradingDivision: p.gradingDivision,
    }));
  const teamEntrants: DynamicPairingEntrant[] = teams.map((t) => ({
    id: t.id,
    type: 'fixed-team',
    displayName: dynamicPairingTeamDisplayName(t, players),
    playerIds: [...t.playerIds],
    seed: t.seed,
    skillLevel: t.skillLevel,
    rating: t.rating,
    gradingDivision: t.gradingDivision,
  }));
  return [...individualEntrants, ...teamEntrants];
}

// A fixed team is only available to play/rest as a unit when *both* of its
// members are individually available — same rule Standard Social Play's
// fixed teams follow (see utils/tournament.ts).
export function isEntrantAvailable(
  entrant: DynamicPairingEntrant,
  playersById: Map<string, Player>,
  roundNumber?: number,
): boolean {
  return entrant.playerIds.every((id) => {
    const player = playersById.get(id);
    return player != null && isPlayerAvailable(player, roundNumber);
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

// The single fair-bye engine every rest-selection call in this file goes
// through — entrant-level (an individual player is just a size-1 entrant),
// so both the plain-player path (selectRestingPlayers) and the fixed-team
// path (selectRestingEntrants) share one implementation and can't drift
// out of sync with each other again.
//
// Priority order (README's "Bye fairness"/"Bye cycle"): fewest total byes
// first — nobody gets a 2nd bye before everyone's had a 1st, a 3rd before
// everyone's had a 2nd — then never back-to-back when anyone else could
// take it, then longest since their last bye, then a stable tiebreak so
// genuinely tied entrants don't reshuffle on every re-render. The actual
// selection is the shared selectFairByes (utils/byeSelection.ts), which
// considers every exact way to fill the rest slots with a mix of fixed
// teams (2 players, one bye for the team) and individuals — the old greedy
// walk here could skip or overshoot with a team that didn't fit exactly,
// which is what handed some entrants back-to-back rests.
export interface SelectFairByeEntrantsParams {
  eligibleEntrants: DynamicPairingEntrant[];
  // Physical players that must sit out this round — availablePhysicalCount
  // minus active court capacity. Not an entrant count, since a resting
  // fixed team counts as 2 physical players but 1 bye for that team.
  requiredRestPhysicalCount: number;
  statsById: Map<string, DynamicPairingPlayerStats>;
  lastRoundRestingEntrantIds: Set<string>;
}

export interface FairByeEntrantSelection {
  restingEntrantIds: string[];
  activeEntrantIds: string[];
  // Set only when a compromise was unavoidable — see byeNoteFor.
  byeNote?: string;
}

export function selectFairByeEntrants({
  eligibleEntrants,
  requiredRestPhysicalCount,
  statsById,
  lastRoundRestingEntrantIds,
}: SelectFairByeEntrantsParams): FairByeEntrantSelection {
  if (requiredRestPhysicalCount <= 0) {
    return { restingEntrantIds: [], activeEntrantIds: eligibleEntrants.map((e) => e.id) };
  }

  const candidates: ByeCandidate[] = eligibleEntrants.map((e) => {
    const st = statsById.get(e.id) ?? emptyStats(e.id);
    return {
      id: e.id,
      size: e.playerIds.length,
      byeCount: st.totalRests,
      lastByeRound: st.lastRestRound ?? undefined,
      restedLastRound: lastRoundRestingEntrantIds.has(e.id),
    };
  });
  const selection = selectFairByes(candidates, requiredRestPhysicalCount, (a, b) => stableRandomTiebreak(a.id, b.id));

  const restingIds = new Set(selection.restingIds);
  return {
    restingEntrantIds: selection.restingIds,
    activeEntrantIds: eligibleEntrants.filter((e) => !restingIds.has(e.id)).map((e) => e.id),
    byeNote: byeNoteFor(selection.consecutiveIds.length > 0, selection.overshoot > 0),
  };
}

// The round's bye note — shown in Current Round and All Rounds only when a
// compromise was genuinely unavoidable; a fair rotation shows nothing.
export function byeNoteFor(consecutive: boolean, overshoot: boolean): string | undefined {
  if (consecutive) return CONSECUTIVE_BYE_NOTE;
  if (overshoot) return 'One extra player is resting because a fixed team could not be split to fit the courts exactly.';
  return undefined;
}

// A round's bye note as shown to the organiser. Rounds saved by earlier
// versions carry a "Bye selection: fair rotation — ..." note on every round;
// a fair rotation now shows nothing, so that legacy text is hidden.
export function visibleByeNote(round: DynamicPairingRound): string | undefined {
  const note = round.byeFairnessNote;
  return note && !note.startsWith('Bye selection: fair rotation') ? note : undefined;
}

// Player-keyed convenience wrapper around selectFairByeEntrants for the
// no-fixed-teams path — every player is its own size-1 entrant, so results
// are identical to calling selectFairByeEntrants directly.
export function selectRestingPlayers(
  availablePlayers: Player[],
  stats: DynamicPairingPlayerStats[],
  courtsUsed: number,
  lastRoundRestingIds: Set<string>,
): { restingIds: string[]; activeIds: string[]; byeNote?: string } {
  const activeCapacity = calculateActiveCapacity(courtsUsed);
  const requiredRestPhysicalCount = Math.max(0, availablePlayers.length - activeCapacity);
  const entrants: DynamicPairingEntrant[] = availablePlayers.map((p) => ({
    id: p.id,
    type: 'individual-player',
    displayName: p.name,
    playerIds: [p.id],
  }));
  const statsById = new Map(stats.map((s) => [s.playerId, s]));
  const { restingEntrantIds, activeEntrantIds, byeNote } = selectFairByeEntrants({
    eligibleEntrants: entrants,
    requiredRestPhysicalCount,
    statsById,
    lastRoundRestingEntrantIds: lastRoundRestingIds,
  });
  return { restingIds: restingEntrantIds, activeIds: activeEntrantIds, byeNote };
}

// Entrant-level convenience wrapper around selectFairByeEntrants, used once
// a fixed team exists (see generateDynamicPairingRoundWithTeams) — keeps
// active physical players at or under `courtsUsed * 4` while a fixed team
// rests or plays as one atomic unit.
export function selectRestingEntrants(
  availableEntrants: DynamicPairingEntrant[],
  representativeStatsById: Map<string, DynamicPairingPlayerStats>,
  courtsUsed: number,
  lastRoundRestingEntrantIds: Set<string>,
): FairByeEntrantSelection {
  const capacity = calculateActiveCapacity(courtsUsed);
  const availablePhysicalCount = availableEntrants.reduce((sum, e) => sum + e.playerIds.length, 0);
  const requiredRestPhysicalCount = Math.max(0, availablePhysicalCount - capacity);
  return selectFairByeEntrants({
    eligibleEntrants: availableEntrants,
    requiredRestPhysicalCount,
    statsById: representativeStatsById,
    lastRoundRestingEntrantIds,
  });
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

// --- Gender-aware pairing ---------------------------------------------
// See the file header's "Gender-aware pairing" note. Every helper here is
// pure and derived-only — a match's gender classification is never stored
// on DynamicPairingCourtAssignment, always recomputed on demand from
// team1PlayerIds/team2PlayerIds + the roster's own `gender` field, the same
// "derived, not persisted" approach the rest of this file uses for ranking
// basis labels and entrant views.

// A missing/invalid gender always reads as 'M' — see PlayerGender's comment
// in ../types.ts for why 'M' (not, say, refusing to classify) is the
// deliberate default. Also guards against a corrupted stored value that
// isn't literally 'M' or 'F'.
export function getPlayerGender(player: Player | undefined): PlayerGender {
  return player?.gender === 'F' ? 'F' : 'M';
}

// A "side" here is exactly what DynamicPairingCourtAssignment already
// tracks per team — a fixed team's two members, or two individuals
// temporarily paired for the round; either way, always exactly 2 physical
// players once a side is fully formed. 'UNKNOWN' only ever occurs for a
// malformed/incomplete side (defensive — every real side this file builds
// has exactly 2 playerIds).
export type SideGenderComposition = 'MF' | 'MM' | 'FF' | 'UNKNOWN';

export function getSideGenderComposition(
  sidePlayerIds: string[],
  playersById: Map<string, Player>,
): SideGenderComposition {
  if (sidePlayerIds.length !== 2) return 'UNKNOWN';
  const [a, b] = sidePlayerIds.map((id) => getPlayerGender(playersById.get(id)));
  if (a === b) return a === 'M' ? 'MM' : 'FF';
  return 'MF';
}

// See the file's "Mixed game"/"Gendered game" definitions — anything that
// isn't one of the four explicitly-named compositions (e.g. a malformed
// side, or the M/F vs F/M-mismatched cases that can't actually occur given
// getSideGenderComposition's symmetric MF result) falls back to 'standard',
// the same "no gender story to tell" label a same-gender-imbalanced court
// (e.g. 3 men + 1 woman split across two sides) also gets.
export type MatchGenderType =
  | 'mixed'
  | 'gendered-mm-vs-mm'
  | 'gendered-ff-vs-ff'
  | 'gendered-mm-vs-ff'
  | 'standard';

export function getMatchGenderType(
  side1PlayerIds: string[],
  side2PlayerIds: string[],
  playersById: Map<string, Player>,
): MatchGenderType {
  const a = getSideGenderComposition(side1PlayerIds, playersById);
  const b = getSideGenderComposition(side2PlayerIds, playersById);
  if (a === 'MF' && b === 'MF') return 'mixed';
  if (a === 'MM' && b === 'MM') return 'gendered-mm-vs-mm';
  if (a === 'FF' && b === 'FF') return 'gendered-ff-vs-ff';
  if ((a === 'MM' && b === 'FF') || (a === 'FF' && b === 'MM')) return 'gendered-mm-vs-ff';
  return 'standard';
}

// Display label for Current Round / All Rounds — deliberately collapses
// every gendered-* variant to one "Gendered" badge (see the design brief's
// "keep the label simple"); the specific composition is still visible from
// the player names themselves.
export function matchGenderTypeLabel(type: MatchGenderType): string {
  switch (type) {
    case 'mixed':
      return 'Mixed';
    case 'gendered-mm-vs-mm':
    case 'gendered-ff-vs-ff':
    case 'gendered-mm-vs-ff':
      return 'Gendered';
    case 'standard':
      return 'Standard';
  }
}

// The on/off switch for every gender preference below — evaluated fresh
// against whichever physical players are actually active (on a court) for
// one specific round, not the whole session's roster, so a round where
// both registered female players happen to be resting correctly falls back
// to normal pairing for that round alone (see the design brief's "if fewer
// than 2 active female players, use normal pairing"). Re-derivable at
// display time from a round's own courts (every consumer of this file's
// generation functions and every display component call it the same way),
// so there's nothing to store or get out of sync.
export function shouldUseGenderAwarePairing(activePlayers: Player[]): boolean {
  return activePlayers.filter((p) => getPlayerGender(p) === 'F').length >= 2;
}

// Small additive bonus/penalty folded into the court arrangement search's
// and buildGradingCandidate's "lower is better" penalty scores — see
// the file header's "Gender-aware pairing" note on why this can never
// outweigh a real fairness difference: every other penalty weight there
// (SIDE_IMBALANCE_PENALTY=10 and up, REPEAT_PARTNER_PENALTY=100, ...) is
// larger than this term's full 0-3 spread, so gender
// preference only ever breaks a genuine tie between otherwise-equal
// candidates, exactly as the design brief's priority order requires
// (mixed preferred over gendered, gendered over standard — see
// MatchGenderType).
function genderPreferenceScore(type: MatchGenderType): number {
  switch (type) {
    case 'mixed':
      return 0;
    case 'gendered-mm-vs-mm':
    case 'gendered-ff-vs-ff':
    case 'gendered-mm-vs-ff':
      return 1;
    case 'standard':
      return 3;
  }
}

// --- Entrant ranking -----------------------------------------------------
// Entrant-level counterpart of getPlayerHeadToHead/sortPlayersByRanking/
// calculatePlayerRankings above, used for Rankings (and the Setup tab's
// skill-level input) once fixed teams exist. Falls back to
// entrantIdsForSide so it reads
// correctly even for rounds that predate fixed teams (or a round where no
// team was involved) — every player there is their own entrant 1:1, so the
// result is identical to getPlayerHeadToHead in that case.
export function getEntrantHeadToHead(aId: string, bId: string, rounds: DynamicPairingRound[]): number {
  let aWins = 0;
  let bWins = 0;
  for (const round of rounds) {
    for (const court of round.courts) {
      const winnerTeam = courtWinner(court);
      if (winnerTeam == null) continue;
      const side1 = entrantIdsForSide(court, 1);
      const side2 = entrantIdsForSide(court, 2);
      const aSide = side1.includes(aId) ? 1 : side2.includes(aId) ? 2 : 0;
      const bSide = side1.includes(bId) ? 1 : side2.includes(bId) ? 2 : 0;
      if (aSide === 0 || bSide === 0 || aSide === bSide) continue;
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

// Optional ranking inputs, off unless the session uses them.
export interface EntrantRankingOptions {
  // Grading divisions break ties after skill level and before seed (see
  // DynamicPairingSettings.useGradingDivisions). They only ever separate
  // entrants with identical results — common early on, and especially with
  // Win/Loss-only scoring, where there are no point differentials.
  useGradingDivisions?: boolean;
}

// Same ranking priority/order as sortPlayersByRanking (see that function's
// comment) — win % → avg point differential → avg points scored → head-to-
// head → skill level → [grading division, when enabled] → seed → previous
// rank → stable tiebreak — just keyed by entrant id instead of player id.
// `statsById` supplies each entrant's representative stats (see
// calculateEntrantRankings: either the individual's own stats, or a fixed
// team's — either member's, since both are identical by construction).
export function sortEntrantsByRanking(
  entrants: DynamicPairingEntrant[],
  statsById: Map<string, DynamicPairingPlayerStats>,
  rounds: DynamicPairingRound[],
  previousRankById: Map<string, number>,
  options: EntrantRankingOptions = {},
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
    if (options.useGradingDivisions) {
      const divisionA = gradingDivisionLevel(a.entrant.gradingDivision);
      const divisionB = gradingDivisionLevel(b.entrant.gradingDivision);
      if (divisionA !== divisionB) return divisionA - divisionB;
    }
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
  options: EntrantRankingOptions = {},
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
    const ranked = sortEntrantsByRanking(entrants, entrantStatsById, roundsSoFar, previousRankById, options);
    latest = ranked.map((row) => ({
      ...row,
      stats: { ...row.stats, previousRank: previousRankById.get(row.entrant.id) ?? null, currentRank: row.rank },
    }));
    previousRankById = new Map(ranked.map((row) => [row.entrant.id, row.rank]));
  }

  return latest;
}

// Entrant-level ranking for one specific *future* round, respecting the
// session's ranking lag (see DynamicPairingSettings.rankingLagRounds) —
// this is what makes predetermined rounds possible: Round N's competitive
// pairing/court order only ever needs completed results up to
// Round N - 1 - rankingLagRounds, so it can be generated (and shown in All
// Rounds) before Round N - 1, or even Round N - rankingLagRounds, has
// actually been played. `completedRounds` must be genuinely-finished
// rounds only (status 'locked'/'completed') — never 'current' or
// 'upcoming' ones, even if the caller is mid-way through pre-generating a
// chain of future rounds (see extendDynamicPairingLookahead).
// Falls back to baseline ranking (seed/rating/skill level/admin order —
// see sortEntrantsByRanking's tiebreak chain, naturally what you get when
// there are zero rounds of results to rank on) whenever the lag pushes the
// cutoff below Round 1.
export function calculateDynamicPairingRankingForRound(
  players: Player[],
  teams: DynamicPairingTeam[],
  completedRounds: DynamicPairingRound[],
  targetRoundNumber: number,
  rankingLagRounds: number,
  options: EntrantRankingOptions = {},
): { ranking: RankedEntrant[]; basis: DynamicPairingRankingBasis } {
  const lag = Math.max(0, rankingLagRounds);
  const maxIncludedRoundNumber = targetRoundNumber - 1 - lag;
  const includedRounds = completedRounds
    .filter((r) => r.roundNumber <= maxIncludedRoundNumber)
    .sort((a, b) => a.roundNumber - b.roundNumber);

  const ranking = calculateEntrantRankings(players, teams, includedRounds, options);
  const isBaseline = includedRounds.length === 0;
  const basis: DynamicPairingRankingBasis = {
    type: isBaseline ? 'baseline' : 'lagged-results',
    includedRoundNumbers: includedRounds.map((r) => r.roundNumber),
    rankingLagRounds: lag,
    targetRoundNumber,
    requiredCompletedRoundNumber: isBaseline ? undefined : maxIncludedRoundNumber,
    note: isBaseline
      ? 'Generated from baseline ranking because no completed results were available'
      : `Generated from Round${includedRounds.length === 1 ? '' : 's'} ${includedRounds.map((r) => r.roundNumber).join(', ')} results`,
  };
  return { ranking, basis };
}

// Human-readable "Pairing basis" label for Current Round / All Rounds —
// see DynamicPairingRankingBasis.
export function rankingBasisLabel(round: DynamicPairingRound): string {
  if (round.status === 'pending-results') {
    const required = round.rankingBasis?.requiredCompletedRoundNumber;
    return required != null ? `Waiting for Round ${required} results` : 'Waiting for more completed rounds';
  }
  if (round.phase === 'grading') {
    return round.gradingMode === 'divisions'
      ? 'Grouped by grading division — no ranking data yet'
      : 'Random grading — no ranking data yet';
  }
  const basis = round.rankingBasis;
  if (!basis) return 'Pairing basis unavailable (round generated before this feature existed)';
  if (basis.type === 'baseline') {
    return 'Baseline ranking (seed / rating / skill level / admin order) — not enough completed results yet';
  }
  const nums = basis.includedRoundNumbers;
  const range = nums.length === 1 ? `${nums[0]}` : `${nums[0]}-${nums[nums.length - 1]}`;
  return `Results from Round${nums.length === 1 ? '' : 's'} ${range}`;
}

// --- Grading divisions ---------------------------------------------------
// See GradingDivision in ../types.ts. Levels are only ever compared with
// each other (court spread, side balance, ranking tiebreak), so the exact
// numbers don't matter beyond their order. Unassigned reads as the middle
// division, the least surprising place for someone the organiser hasn't
// placed yet.

export const GRADING_DIVISIONS: GradingDivision[] = ['higher', 'intermediate', 'lower'];

export function gradingDivisionLevel(division: GradingDivision | undefined): number {
  if (division === 'higher') return 0;
  if (division === 'lower') return 2;
  return 1;
}

export function gradingDivisionLabel(division: GradingDivision | undefined): string {
  switch (division) {
    case 'higher':
      return 'Higher';
    case 'intermediate':
      return 'Intermediate';
    case 'lower':
      return 'Lower';
    default:
      return 'Unassigned';
  }
}

// --- Court arrangement search -------------------------------------------
// Decides which entrants share a court and how each court splits into two
// sides, for every ranking round and every division-based grading round.
// Ranking rounds used to fill courts straight from adjacent ranks and only
// ever choose between two partner splits, never consulting opponent history
// — so whenever rankings barely moved between rounds (routine with
// Win/Loss-only scoring, where every point differential is 0 and ties fall
// through to deterministic tiebreakers), the same groups of four re-formed
// round after round and players met the same opponents back to back.
//
// The search starts from the preferred arrangement (ranking order, already
// clamped by the court movement limit; or division order for grading) and
// improves it with entrant swaps between courts, scoring every candidate
// with the penalties below. Each weight dwarfs the ones under it, so the
// order is the README's "Pairing priorities": rest and fixed-team
// constraints are already settled before this runs, then
//   1. no opponent from the immediately previous round,
//   2. no repeat opponent until each entrant's rotation is complete,
//   3. no partner from the immediately previous round,
//   4. balance: the movement limit, cumulative partner variety, staying near
//      the ranked court, division spread, even sides,
//   5. mixed/gendered games (see genderPreferenceScore).
// A repeat is only chosen when no arrangement within reach avoids it.
const CONSECUTIVE_OPPONENT_PENALTY = 1_000_000;
const ROTATION_OPPONENT_PENALTY = 10_000;
const CONSECUTIVE_PARTNER_PENALTY = 3_000;
const MOVEMENT_LIMIT_PENALTY = 600;
const PARTNER_HISTORY_PENALTY = 300;
const COURT_DISPLACEMENT_PENALTY = 100;
const REPEAT_OPPONENT_AFTER_ROTATION_PENALTY = 50;
const DIVISION_SPREAD_PENALTY = 40;
const SIDE_IMBALANCE_PENALTY = 10;
const ARRANGEMENT_RESTARTS = 16;
const ARRANGEMENT_MAX_IMPROVEMENTS = 500;
const BALANCE_FIRST_SCALE = 1_000;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Who faced and who partnered whom in one round, as player-pair keys — the
// "consecutive round" check reads the round immediately before the one
// being built, whether that round is played or only saved as upcoming.
export function roundEncounterKeys(round: DynamicPairingRound | undefined): {
  opponents: Set<string>;
  partners: Set<string>;
} {
  const opponents = new Set<string>();
  const partners = new Set<string>();
  for (const court of round?.courts ?? []) {
    for (const side of [court.team1PlayerIds, court.team2PlayerIds]) {
      if (side.length === 2) partners.add(pairKey(side[0], side[1]));
    }
    for (const a of court.team1PlayerIds) {
      for (const b of court.team2PlayerIds) opponents.add(pairKey(a, b));
    }
  }
  return { opponents, partners };
}

// Everything the search scores against, precomputed once per round as
// index-keyed arrays — a candidate is scored with lookups only, which keeps
// a 12-court session fast on a phone.
interface ArrangementModel {
  entrants: DynamicPairingEntrant[];
  // Physical players per entrant: 1 (individual) or 2 (fixed team).
  size: number[];
  // n×n: cost of entrants i and j facing each other this round.
  opponentCost: Float64Array;
  // n×n: cost of individuals i and j partnering each other this round.
  partnerCost: Float64Array;
  // Side-balance strength per entrant (rank position or division level),
  // lower is stronger.
  strength: number[];
  females: number[];
  genderAware: boolean;
  courtBalance: (court: number[], courtIndex: number) => number;
}

export interface ArrangedCourt {
  side1: DynamicPairingEntrant[];
  side2: DynamicPairingEntrant[];
}

// Builds the model: cumulative history from the whole chain so far (played
// rounds plus saved upcoming ones — see extendDynamicPairingLookahead), the
// immediately previous round's encounters, and rotation completeness over
// every eligible entrant (resting ones included).
function buildArrangementModel(params: {
  entrants: DynamicPairingEntrant[];
  eligibleEntrants: DynamicPairingEntrant[];
  priorRounds: DynamicPairingRound[];
  playerStatsById: Map<string, DynamicPairingPlayerStats>;
  playersById: Map<string, Player>;
  genderAware: boolean;
  strengthById: Map<string, number>;
  courtBalance: (court: number[], courtIndex: number) => number;
}): ArrangementModel {
  const { entrants, playerStatsById } = params;
  const n = entrants.length;
  const { opponents: lastOpponents, partners: lastPartners } = roundEncounterKeys(
    params.priorRounds[params.priorRounds.length - 1],
  );
  const rotationComplete = entrants.map((e) => hasCompletedOpponentRotation(e, params.eligibleEntrants, playerStatsById));
  const opponentCost = new Float64Array(n * n);
  const partnerCost = new Float64Array(n * n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = entrants[i];
      const b = entrants[j];
      let metLastRound = false;
      let met = 0;
      for (const p of a.playerIds) {
        for (const q of b.playerIds) {
          if (lastOpponents.has(pairKey(p, q))) metLastRound = true;
          met = Math.max(met, playerStatsById.get(p)?.opponentHistory[q] ?? 0);
        }
      }
      let cost = metLastRound ? CONSECUTIVE_OPPONENT_PENALTY : 0;
      if (met > 0) {
        cost += met * (rotationComplete[i] && rotationComplete[j] ? REPEAT_OPPONENT_AFTER_ROTATION_PENALTY : ROTATION_OPPONENT_PENALTY);
      }
      opponentCost[i * n + j] = opponentCost[j * n + i] = cost;

      // Partner rotation only applies to a temporary pairing of two
      // individuals — a fixed team "repeats" its partnership by definition.
      if (a.playerIds.length === 1 && b.playerIds.length === 1) {
        const [p, q] = [a.playerIds[0], b.playerIds[0]];
        const partner =
          (lastPartners.has(pairKey(p, q)) ? CONSECUTIVE_PARTNER_PENALTY : 0) +
          (playerStatsById.get(p)?.partnerHistory[q] ?? 0) * PARTNER_HISTORY_PENALTY;
        partnerCost[i * n + j] = partnerCost[j * n + i] = partner;
      }
    }
  }

  return {
    entrants,
    size: entrants.map((e) => e.playerIds.length),
    opponentCost,
    partnerCost,
    strength: entrants.map((e) => params.strengthById.get(e.id) ?? 0),
    females: entrants.map((e) => e.playerIds.filter((id) => getPlayerGender(params.playersById.get(id)) === 'F').length),
    genderAware: params.genderAware,
    courtBalance: params.courtBalance,
  };
}

// Mirrors getMatchGenderType from each side's female count (both sides
// always have 2 physical players).
function genderScoreForSides(females1: number, females2: number): number {
  if (females1 === 1 && females2 === 1) return genderPreferenceScore('mixed');
  if ((females1 === 0 || females1 === 2) && (females2 === 0 || females2 === 2)) return genderPreferenceScore('gendered-mm-vs-mm');
  return genderPreferenceScore('standard');
}

function splitCost(side1: number[], side2: number[], model: ArrangementModel): number {
  const n = model.entrants.length;
  let cost = 0;
  let strength1 = 0;
  let strength2 = 0;
  let females1 = 0;
  let females2 = 0;
  for (const a of side1) {
    for (const b of side2) cost += model.opponentCost[a * n + b];
    strength1 += model.strength[a] * model.size[a];
    females1 += model.females[a];
  }
  for (const b of side2) {
    strength2 += model.strength[b] * model.size[b];
    females2 += model.females[b];
  }
  if (side1.length === 2) cost += model.partnerCost[side1[0] * n + side1[1]];
  if (side2.length === 2) cost += model.partnerCost[side2[0] * n + side2[1]];
  cost += Math.abs(strength1 - strength2) * SIDE_IMBALANCE_PENALTY;
  if (model.genderAware) cost += genderScoreForSides(females1, females2);
  return cost;
}

// Every valid way to split one court into two doubles sides. A fixed team
// is always a side on its own; four individuals can split three ways,
// listed most-balanced first for a ranked group (1+4 v 2+3, 1+3 v 2+4,
// 1+2 v 3+4) so ties keep the old preference.
function bestCourtSplit(court: number[], courtIndex: number, model: ArrangementModel): { split: [number[], number[]]; cost: number } {
  const teams = court.filter((i) => model.size[i] === 2);
  const singles = court.filter((i) => model.size[i] === 1);
  let splits: [number[], number[]][];
  if (teams.length === 2 && singles.length === 0) splits = [[[teams[0]], [teams[1]]]];
  else if (teams.length === 1 && singles.length === 2) splits = [[[teams[0]], singles]];
  else if (teams.length === 0 && singles.length === 4) {
    const [a, b, c, d] = singles;
    splits = [
      [[a, d], [b, c]],
      [[a, c], [b, d]],
      [[a, b], [c, d]],
    ];
  } else return { split: [[], []], cost: Infinity };

  let best = splits[0];
  let bestCost = splitCost(best[0], best[1], model);
  for (let k = 1; k < splits.length; k++) {
    const cost = splitCost(splits[k][0], splits[k][1], model);
    if (cost < bestCost) {
      best = splits[k];
      bestCost = cost;
    }
  }
  return { split: best, cost: bestCost + model.courtBalance(court, courtIndex) };
}

// Every size-preserving exchange between two courts: individual for
// individual, team for team, or a team for a pair of individuals — so each
// court always keeps exactly four physical players.
function courtSwapMoves(a: number[], b: number[], model: ArrangementModel): [number[], number[]][] {
  const moves: [number[], number[]][] = [];
  const without = (list: number[], out: number[]) => list.filter((e) => !out.includes(e));
  const pairsOf = (list: number[]) => {
    const singles = list.filter((e) => model.size[e] === 1);
    const pairs: number[][] = [];
    for (let i = 0; i < singles.length; i++) for (let j = i + 1; j < singles.length; j++) pairs.push([singles[i], singles[j]]);
    return pairs;
  };
  for (const x of a) {
    for (const y of b) {
      if (model.size[x] === model.size[y]) moves.push([[...without(a, [x]), y], [...without(b, [y]), x]]);
    }
  }
  for (const team of a.filter((e) => model.size[e] === 2)) {
    for (const pair of pairsOf(b)) moves.push([[...without(a, [team]), ...pair], [...without(b, pair), team]]);
  }
  for (const team of b.filter((e) => model.size[e] === 2)) {
    for (const pair of pairsOf(a)) moves.push([[...without(a, pair), team], [...without(b, [team]), ...pair]]);
  }
  return moves;
}

function climbArrangement(start: number[][], model: ArrangementModel): { courts: number[][]; cost: number } {
  const courts = start.map((c) => [...c]);
  const costs = courts.map((c, i) => bestCourtSplit(c, i, model).cost);
  // Sweeps every court pair in turn, applying each improving exchange as
  // it's found, until a full sweep finds nothing left to improve.
  let improvements = 0;
  let improvedThisSweep = true;
  while (improvedThisSweep && improvements < ARRANGEMENT_MAX_IMPROVEMENTS) {
    improvedThisSweep = false;
    for (let i = 0; i < courts.length; i++) {
      for (let j = i + 1; j < courts.length; j++) {
        let improvedPair = true;
        while (improvedPair && improvements < ARRANGEMENT_MAX_IMPROVEMENTS) {
          improvedPair = false;
          for (const [nextI, nextJ] of courtSwapMoves(courts[i], courts[j], model)) {
            const costI = bestCourtSplit(nextI, i, model).cost;
            const costJ = bestCourtSplit(nextJ, j, model).cost;
            if (costI + costJ < costs[i] + costs[j] - 1e-9) {
              courts[i] = nextI;
              courts[j] = nextJ;
              costs[i] = costI;
              costs[j] = costJ;
              improvements += 1;
              improvedPair = true;
              improvedThisSweep = true;
              break;
            }
          }
        }
      }
    }
  }
  return { courts, cost: costs.reduce((sum, c) => sum + c, 0) };
}

// The part of an arrangement's cost that comes from repeat opponents or
// partners.
function repeatPenalty(courts: number[][], model: ArrangementModel): number {
  const n = model.entrants.length;
  let total = 0;
  courts.forEach((court, i) => {
    const [side1, side2] = bestCourtSplit(court, i, model).split;
    for (const a of side1) for (const b of side2) total += model.opponentCost[a * n + b];
    for (const side of [side1, side2]) if (side.length === 2) total += model.partnerCost[side[0] * n + side[1]];
  });
  return total;
}

// Random entrant exchanges between courts, to restart the climb from
// somewhere other than the preferred arrangement (escaping local minima).
function perturbArrangement(start: number[][], swaps: number, model: ArrangementModel): number[][] {
  const courts = start.map((c) => [...c]);
  if (courts.length < 2) return courts;
  for (let k = 0; k < swaps; k++) {
    const i = Math.floor(random() * courts.length);
    let j = Math.floor(random() * (courts.length - 1));
    if (j >= i) j += 1;
    const moves = courtSwapMoves(courts[i], courts[j], model);
    if (moves.length === 0) continue;
    [courts[i], courts[j]] = moves[Math.floor(random() * moves.length)];
  }
  return courts;
}

// Climbs from the preferred arrangement and from a few randomised starting
// points (`restartFrom`), keeping the cheapest result. Each climb runs in
// two stages: first with balance weighted far above its usual cost, so
// repeats get fixed by moves that keep courts balanced wherever such moves
// exist (e.g. re-pairing within a division), then with the real weights,
// so balance is only traded away for the repeats that are left. The
// preferred arrangement wins every tie, so a round with nothing to fix
// comes out exactly as ranking/division order intended.
function optimiseCourtArrangement(
  preferred: number[][],
  model: ArrangementModel,
  restartFrom: (attempt: number) => number[][],
): ArrangedCourt[] {
  const balanceFirst: ArrangementModel = {
    ...model,
    courtBalance: (court, courtIndex) => model.courtBalance(court, courtIndex) * BALANCE_FIRST_SCALE,
  };
  const climb = (start: number[][]) => climbArrangement(climbArrangement(start, balanceFirst).courts, model);
  const balanceOf = (courts: number[][]) => courts.reduce((sum, court, i) => sum + model.courtBalance(court, i), 0);
  const preferredBalance = balanceOf(preferred);
  let best = climb(preferred);
  // Restarts are only worth it while something is still compromised: a
  // repeat remains, or balance was given up to avoid one.
  const compromised = () => repeatPenalty(best.courts, model) > 0 || balanceOf(best.courts) > preferredBalance + 1e-9;
  for (let attempt = 0; attempt < ARRANGEMENT_RESTARTS && compromised(); attempt++) {
    const candidate = climb(restartFrom(attempt));
    if (candidate.cost < best.cost - 1e-9) best = candidate;
  }
  return best.courts.map((court, i) => {
    const [side1, side2] = bestCourtSplit(court, i, model).split;
    return { side1: side1.map((k) => model.entrants[k]), side2: side2.map((k) => model.entrants[k]) };
  });
}

// Ranking rounds: `preferredCourts` is the ranking-ordered arrangement
// (court 1 strongest), already clamped by the movement limit for the
// individual-only path. Moving an entrant away from its preferred court
// costs COURT_DISPLACEMENT_PENALTY per court per player; breaking the
// organiser's movement limit costs MOVEMENT_LIMIT_PENALTY per court over.
export function arrangeRankingCourts(params: {
  preferredCourts: DynamicPairingEntrant[][];
  rankPositionById: Map<string, number>;
  eligibleEntrants: DynamicPairingEntrant[];
  priorRounds: DynamicPairingRound[];
  playerStatsById: Map<string, DynamicPairingPlayerStats>;
  previousCourtByPlayerId: Map<string, number>;
  maxCourtMovement: CourtMovementLimit;
  playersById: Map<string, Player>;
  genderAware: boolean;
}): ArrangedCourt[] {
  const entrants = params.preferredCourts.flat();
  const cap = params.maxCourtMovement === 'max-1' ? 1 : params.maxCourtMovement === 'max-2' ? 2 : Infinity;
  const courtCount = params.preferredCourts.length;
  // balance[i * courtCount + c]: cost of entrant i playing on court index c.
  const balance = new Float64Array(entrants.length * courtCount);
  let index = 0;
  params.preferredCourts.forEach((court, preferredIndex) => {
    for (const e of court) {
      for (let c = 0; c < courtCount; c++) {
        let cost = Math.abs(c - preferredIndex) * COURT_DISPLACEMENT_PENALTY * e.playerIds.length;
        for (const playerId of e.playerIds) {
          const previous = params.previousCourtByPlayerId.get(playerId);
          if (previous != null) cost += Math.max(0, Math.abs(c + 1 - previous) - cap) * MOVEMENT_LIMIT_PENALTY;
        }
        balance[index * courtCount + c] = cost;
      }
      index += 1;
    }
  });

  const model = buildArrangementModel({
    entrants,
    eligibleEntrants: params.eligibleEntrants,
    priorRounds: params.priorRounds,
    playerStatsById: params.playerStatsById,
    playersById: params.playersById,
    genderAware: params.genderAware,
    strengthById: params.rankPositionById,
    courtBalance: (court, courtIndex) => court.reduce((sum, i) => sum + balance[i * courtCount + courtIndex], 0),
  });
  let next = 0;
  const preferred = params.preferredCourts.map((court) => court.map(() => next++));
  return optimiseCourtArrangement(preferred, model, (attempt) => perturbArrangement(preferred, 2 + attempt, model));
}

// Division-based grading rounds: entrants start grouped by division
// (higher first, shuffled within each division) and the search keeps each
// court's division spread small while avoiding repeats — so courts stay
// within one division whenever player counts and history allow, and mix
// only neighbouring divisions when they must. Courts are then numbered
// strongest division first.
export function arrangeDivisionGradingCourts(params: {
  activeEntrants: DynamicPairingEntrant[];
  courtsUsed: number;
  eligibleEntrants: DynamicPairingEntrant[];
  priorRounds: DynamicPairingRound[];
  playerStatsById: Map<string, DynamicPairingPlayerStats>;
  playersById: Map<string, Player>;
  genderAware: boolean;
}): { courts: ArrangedCourt[]; unplacedEntrantIds: string[] } {
  const entrants = params.activeEntrants;
  const indexById = new Map(entrants.map((e, i) => [e.id, i]));
  const levels = entrants.map((e) => gradingDivisionLevel(e.gradingDivision));
  const divisionOrder = () => [0, 1, 2].flatMap((level) => shuffle(entrants.filter((_, i) => levels[i] === level)));
  const toCourts = (ordered: DynamicPairingEntrant[]) => {
    const { sides } = buildSidesFromRankedEntrants(ordered);
    return groupSidesIntoCourts(sides, params.courtsUsed).map((court) =>
      [...entrantIdsForSide(court, 1), ...entrantIdsForSide(court, 2)].map((id) => indexById.get(id)!),
    );
  };

  const model = buildArrangementModel({
    entrants,
    eligibleEntrants: params.eligibleEntrants,
    priorRounds: params.priorRounds,
    playerStatsById: params.playerStatsById,
    playersById: params.playersById,
    genderAware: params.genderAware,
    strengthById: new Map(entrants.map((e, i) => [e.id, levels[i]])),
    courtBalance: (court) => {
      let min = Infinity;
      let max = -Infinity;
      for (const i of court) {
        min = Math.min(min, levels[i]);
        max = Math.max(max, levels[i]);
      }
      return (max - min) * (max - min) * DIVISION_SPREAD_PENALTY;
    },
  });

  const courts = optimiseCourtArrangement(toCourts(divisionOrder()), model, () => toCourts(divisionOrder()));
  const averageLevel = (court: ArrangedCourt) => {
    const all = [...court.side1, ...court.side2];
    const players = all.reduce((sum, e) => sum + e.playerIds.length, 0);
    return all.reduce((sum, e) => sum + gradingDivisionLevel(e.gradingDivision) * e.playerIds.length, 0) / Math.max(1, players);
  };
  const placed = new Set(courts.flatMap((c) => [...c.side1, ...c.side2]).map((e) => e.id));
  return {
    courts: [...courts].sort((a, b) => averageLevel(a) - averageLevel(b)),
    unplacedEntrantIds: entrants.filter((e) => !placed.has(e.id)).map((e) => e.id),
  };
}

function arrangedCourtToAssignment(
  court: ArrangedCourt,
  courtNumber: number,
  withEntrantIds: boolean,
): DynamicPairingCourtAssignment {
  const team1PlayerIds = court.side1.flatMap((e) => e.playerIds);
  const team2PlayerIds = court.side2.flatMap((e) => e.playerIds);
  return {
    courtNumber,
    playerIds: [...team1PlayerIds, ...team2PlayerIds],
    team1PlayerIds,
    team2PlayerIds,
    ...(withEntrantIds
      ? { team1EntrantIds: court.side1.map((e) => e.id), team2EntrantIds: court.side2.map((e) => e.id) }
      : {}),
    status: 'pending',
  };
}

// --- Round generation --------------------------------------------------

let idCounter = 0;
function makeDynamicPairingId(prefix: string): string {
  idCounter += 1;
  return `dp-${prefix}-${Date.now()}-${idCounter}-${Math.floor(Math.random() * 10000)}`;
}

// The randomness every pairing decision in this file draws from — genuine
// Math.random in the app, swappable for a seeded generator in tests so
// fairness-sensitive scheduling can be checked deterministically. Ids keep
// using Math.random, since they only need to be unique.
let random: () => number = Math.random;

export function setDynamicPairingRandomSource(source: (() => number) | null) {
  random = source ?? Math.random;
}

// Genuine (not deterministic-hash) randomness — used to shuffle grading-
// round court order. Unlike stableRandomTiebreak above, this is
// intentionally allowed to differ between calls: grading rounds are meant
// to mix players up freely before there's any ranking to preserve.
function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Rounds a generator may build history from: never a 'pending-results'
// placeholder (it has no courts), always in round order — so "the previous
// round" and the next round number are both read correctly.
function generationHistory(priorRounds: DynamicPairingRound[]): DynamicPairingRound[] {
  return priorRounds.filter((r) => r.status !== 'pending-results').sort((a, b) => a.roundNumber - b.roundNumber);
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
  allPriorRounds: DynamicPairingRound[],
): DynamicPairingRound {
  const priorRounds = generationHistory(allPriorRounds);
  const roundNumber = (priorRounds[priorRounds.length - 1]?.roundNumber ?? 0) + 1;
  const phase: DynamicPairingRound['phase'] = roundNumber <= settings.gradingRounds ? 'grading' : 'ranking';

  // Grading rounds delegate to the rotation-aware entrant-based generator
  // (see "Rotation-aware grading rounds" below) — teams is always empty
  // here by contract, so buildDynamicPairingEntrants just returns one
  // entrant per player, and the search reduces to plain individual
  // opponent-rotation avoidance.
  if (phase === 'grading') return generateRotationAwareGradingRound(players, [], settings, priorRounds);

  const availablePlayers = players.filter((p) => isPlayerAvailable(p, roundNumber));
  const courtsUsed = calculateCourtsUsed(settings.numberOfCourts, availablePlayers.length);

  const stats = calculateDynamicPairingStats(players, priorRounds);
  const lastRound = priorRounds.length > 0 ? priorRounds[priorRounds.length - 1] : undefined;
  const lastRoundRestingIds = new Set(lastRound?.restingPlayerIds ?? []);

  const playersByIdForRest = new Map(players.map((p) => [p.id, p]));
  const restStats = stats.map((st) => withByeAdjustment(st, [st.playerId], playersByIdForRest));
  const { restingIds, activeIds, byeNote } = selectRestingPlayers(availablePlayers, restStats, courtsUsed, lastRoundRestingIds);
  const activeSet = new Set(activeIds);

  // Grading already returned above — every round reaching this point is a
  // ranking round. `priorRounds` may include already-generated-but-not-yet-
  // played 'upcoming' rounds when this is called while predetermining a
  // future look-ahead window (see extendDynamicPairingLookahead)
  // — only genuinely-finished rounds may ever feed the *ranking* (see
  // calculateDynamicPairingRankingForRound and the ranking-lag rule), even
  // though rest/partner history above correctly used the full projected
  // chain, same precedent as the grading pre-generation path.
  const completedRoundsForRanking = priorRounds.filter((r) => r.status === 'locked' || r.status === 'completed');
  const { ranking, basis } = calculateDynamicPairingRankingForRound(
    players,
    [],
    completedRoundsForRanking,
    roundNumber,
    settings.rankingLagRounds,
    { useGradingDivisions: settings.useGradingDivisions },
  );
  const orderedActiveIds = ranking.filter((row) => activeSet.has(row.entrant.id)).map((row) => row.entrant.playerIds[0]);

  // Court continuity for the movement-limit clamp below is a physical-play
  // fact, not a ranking one — always derived from the *full* history
  // (`stats`), independent of the ranking lag above.
  const previousCourtByPlayerId = new Map<string, number>();
  for (const s of stats) {
    if (s.currentCourt != null) previousCourtByPlayerId.set(s.playerId, s.currentCourt);
  }

  const courtGroups = applyCourtMovementLimit(orderedActiveIds, previousCourtByPlayerId, courtsUsed, settings.maxCourtMovement);

  // See shouldUseGenderAwarePairing — evaluated against this round's own
  // active (on-court) players, not the whole session's roster, so a round
  // where the registered female players happen to be resting still falls
  // back to normal pairing for that round alone.
  const playersById = new Map(players.map((p) => [p.id, p]));
  const genderAware = shouldUseGenderAwarePairing(activeIds.map((id) => playersById.get(id)!).filter(Boolean));

  // Every player here is their own entrant — the same search the fixed-team
  // path uses, so both paths share one set of pairing priorities (see
  // "Court arrangement search"). The movement-limited groups above are the
  // preferred arrangement it starts from.
  const asEntrant = (id: string): DynamicPairingEntrant => ({
    id,
    type: 'individual-player',
    displayName: playersById.get(id)?.name ?? '',
    playerIds: [id],
  });
  const arranged = arrangeRankingCourts({
    preferredCourts: courtGroups.map((group) => group.map(asEntrant)),
    rankPositionById: new Map(orderedActiveIds.map((id, index) => [id, index])),
    eligibleEntrants: availablePlayers.map((p) => asEntrant(p.id)),
    priorRounds,
    playerStatsById: new Map(stats.map((s) => [s.playerId, s])),
    previousCourtByPlayerId,
    maxCourtMovement: settings.maxCourtMovement,
    playersById,
    genderAware,
  });
  const courts = arranged.map((court, index) => arrangedCourtToAssignment(court, index + 1, false));

  return {
    id: makeDynamicPairingId('round'),
    roundNumber,
    phase,
    status: 'current',
    courts,
    restingPlayerIds: restingIds,
    rankingBasis: basis,
    byeFairnessNote: byeNote,
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
// (i.e. by rank-adjacency, skipping over any fixed teams in between). This
// is only the *preferred* arrangement — ranking rounds then hand it to the
// court arrangement search, which re-pairs individuals for partner
// rotation, removes repeat opponents and applies gender preference; random
// grading rounds use it directly (see buildGradingCandidate). If the
// number of active individual entrants is odd (only
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

// --- Rotation-aware grading rounds --------------------------------------
// During the first `gradingRounds` rounds, courts are still random — no
// ranking data exists yet to do anything else (see the file header) — but
// "random" doesn't mean "careless": this section makes a best effort to
// avoid pairing two entrants (individual players or fixed teams — see
// buildDynamicPairingEntrants) against each other more than once until
// every entrant has met every other available entrant at least once (a
// "full rotation"). A repeat is only ever allowed once an entrant's
// rotation is genuinely exhausted, or when no better schedule turns up
// within a bounded random search — see generateRotationAwareGradingRound.
// Used for BOTH the individual-only and fixed-team cases (an individual is
// just a 1-player entrant), so generateDynamicPairingRound and
// generateDynamicPairingRoundWithTeams both delegate here while a round is
// still in the grading phase — only their ranking-phase logic (Round 4+)
// stays split, exactly as before.
//
// Rest selection is untouched — still handled entirely by
// selectRestingPlayers/selectRestingEntrants before any of this runs, kept
// completely independent of pairing (see the file header's "Two
// independent systems"). Only *who plays whom*, among whoever's already
// selected to play, is searched here.

// Has `entrantA` already faced `entrantB`? Reuses the *player*-level
// opponentHistory DynamicPairingPlayerStats already tracks (see
// updatePartnerOpponentHistory) rather than a new entrant-level store — a
// fixed team's members always face the same opponents together (round
// generation never splits them across sides), so either member's own
// opponentHistory count already *is* "how many times has this team met
// that entrant," with no extra bookkeeping needed.
export function hasMetOpponent(
  entrantA: DynamicPairingEntrant,
  entrantB: DynamicPairingEntrant,
  playerStatsById: Map<string, DynamicPairingPlayerStats>,
): boolean {
  return (playerStatsById.get(entrantA.playerIds[0])?.opponentHistory[entrantB.playerIds[0]] ?? 0) > 0;
}

// True once `entrant` has met every other eligible entrant at least once.
// "Eligible" means every currently-available entrant in the session (see
// isEntrantAvailable) — regardless of whether they happen to be resting
// this specific round — since the goal is full rotation across the whole
// pre-generated grading batch, not just whoever's active in one round.
export function hasCompletedOpponentRotation(
  entrant: DynamicPairingEntrant,
  eligibleEntrants: DynamicPairingEntrant[],
  playerStatsById: Map<string, DynamicPairingPlayerStats>,
): boolean {
  return eligibleEntrants
    .filter((other) => other.id !== entrant.id)
    .every((other) => hasMetOpponent(entrant, other, playerStatsById));
}

// Same two sides (by entrant id set, order-independent) have already faced
// each other in a previously generated round — checked via entrantIdsForSide
// so it reads correctly even for rounds/entrants that predate fixed teams.
function isExactMatchRepeat(side1Ids: string[], side2Ids: string[], priorRounds: DynamicPairingRound[]): boolean {
  const key = (ids: string[]) => [...ids].sort().join('|');
  const thisMatch = [key(side1Ids), key(side2Ids)].sort().join('~');
  return priorRounds.some((round) =>
    round.courts.some((court) => {
      const priorKey = [key(entrantIdsForSide(court, 1)), key(entrantIdsForSide(court, 2))].sort().join('~');
      return priorKey === thisMatch;
    }),
  );
}

// Very high penalties dominate the search — a repeat opponent (before that
// entrant's rotation is complete) or an exact rematch of the same two sides
// should only ever be chosen when literally nothing better was found in
// GRADING_SCHEDULE_ATTEMPTS tries. Repeat partner (two individuals
// temporarily paired again) is a much softer preference — worth avoiding,
// never worth forcing a repeat opponent to dodge.
const REPEAT_OPPONENT_PENALTY = 10000;
const EXACT_MATCH_REPEAT_PENALTY = 15000;
const REPEAT_PARTNER_PENALTY = 100;
const GRADING_SCHEDULE_ATTEMPTS = 50;

interface GradingCandidate {
  courts: DynamicPairingCourtAssignment[];
  penalty: number;
  repeatOpponentCount: number;
}

// Builds one candidate schedule from a given (already shuffled) entrant
// order — same side-building shape as buildSidesFromRankedEntrants (fixed
// teams become their own side; individual entrants pair up consecutively
// in whatever order they're given) — then scores it against opponent/
// exact-match/partner history, so generateRotationAwareGradingRound can
// compare several random orderings and keep the best one.
function buildGradingCandidate(
  shuffledEntrants: DynamicPairingEntrant[],
  courtsUsed: number,
  eligibleEntrants: DynamicPairingEntrant[],
  eligibleEntrantById: Map<string, DynamicPairingEntrant>,
  playerStatsById: Map<string, DynamicPairingPlayerStats>,
  priorRounds: DynamicPairingRound[],
  playersById: Map<string, Player>,
  genderAware: boolean,
): GradingCandidate {
  const { sides } = buildSidesFromRankedEntrants(shuffledEntrants);
  const courts = groupSidesIntoCourts(sides, courtsUsed);

  let penalty = 0;
  let repeatOpponentCount = 0;

  for (const court of courts) {
    const side1Ids = entrantIdsForSide(court, 1);
    const side2Ids = entrantIdsForSide(court, 2);
    const side1Entrants = side1Ids.map((id) => eligibleEntrantById.get(id)).filter((e): e is DynamicPairingEntrant => e != null);
    const side2Entrants = side2Ids.map((id) => eligibleEntrantById.get(id)).filter((e): e is DynamicPairingEntrant => e != null);

    for (const a of side1Entrants) {
      for (const b of side2Entrants) {
        if (hasMetOpponent(a, b, playerStatsById) && !hasCompletedOpponentRotation(a, eligibleEntrants, playerStatsById)) {
          penalty += REPEAT_OPPONENT_PENALTY;
          repeatOpponentCount += 1;
        }
      }
    }

    if (isExactMatchRepeat(side1Ids, side2Ids, priorRounds)) {
      penalty += EXACT_MATCH_REPEAT_PENALTY;
    }

    // Repeat-partner penalty only applies to a temporary pairing of two
    // individual entrants — a fixed-team side always "repeats" its own
    // partnership by definition, so that's never counted here.
    for (const sideEntrants of [side1Entrants, side2Entrants]) {
      if (sideEntrants.length === 2 && sideEntrants.every((e) => e.type === 'individual-player')) {
        const [p1, p2] = sideEntrants;
        const alreadyPartnered = (playerStatsById.get(p1.playerIds[0])?.partnerHistory[p2.playerIds[0]] ?? 0) > 0;
        if (alreadyPartnered) penalty += REPEAT_PARTNER_PENALTY;
      }
    }

    // Gender-aware pairing (see the file header) — a much lighter touch
    // than any penalty above, so it only ever nudges the search toward the
    // better-classified schedule among several otherwise-equally-fair
    // random orderings; it never causes a repeat opponent/partner to be
    // preferred over an available clean one.
    if (genderAware) {
      penalty += genderPreferenceScore(getMatchGenderType(side1Ids, side2Ids, playersById));
    }
  }

  penalty += random(); // low-weight tiebreaker so ties don't always resolve the same way
  return { courts, penalty, repeatOpponentCount };
}

// Generates one grading-phase round with a best-effort "full rotation
// before repeats" search: try GRADING_SCHEDULE_ATTEMPTS random entrant
// orderings, score each with buildGradingCandidate, keep the lowest-
// penalty one (stopping early once a fully clean one turns up). If even
// the best candidate still has repeat opponents, that's recorded on the
// round as `rotationNote` rather than hidden — see "Round generation with
// fixed teams"/"Fixed teams" in the README. Deliberately a bounded random
// search rather than an exact constraint solver, per the "prefer correct
// and predictable scheduling over perfect optimisation" brief this was
// built from.
export function generateRotationAwareGradingRound(
  players: Player[],
  teams: DynamicPairingTeam[],
  settings: DynamicPairingSettings,
  allPriorRounds: DynamicPairingRound[],
): DynamicPairingRound {
  const priorRounds = generationHistory(allPriorRounds);
  const roundNumber = (priorRounds[priorRounds.length - 1]?.roundNumber ?? 0) + 1;
  const playersById = new Map(players.map((p) => [p.id, p]));
  const entrants = buildDynamicPairingEntrants(players, teams);
  const eligibleEntrants = entrants.filter((e) => isEntrantAvailable(e, playersById, roundNumber));
  const eligibleEntrantById = new Map(eligibleEntrants.map((e) => [e.id, e]));
  const availablePhysicalCount = eligibleEntrants.reduce((sum, e) => sum + e.playerIds.length, 0);
  const courtsUsed = calculateCourtsUsed(settings.numberOfCourts, availablePhysicalCount);

  const playerStats = calculateDynamicPairingStats(players, priorRounds);
  const playerStatsById = new Map(playerStats.map((s) => [s.playerId, s]));
  const entrantStatsById = new Map(
    eligibleEntrants.map((e) => [
      e.id,
      withByeAdjustment(playerStatsById.get(e.playerIds[0]) ?? emptyStats(e.playerIds[0]), e.playerIds, playersById),
    ]),
  );

  const lastRound = priorRounds.length > 0 ? priorRounds[priorRounds.length - 1] : undefined;
  const lastRoundRestingEntrantIds = new Set(lastRound?.restingEntrantIds ?? lastRound?.restingPlayerIds ?? []);
  const { restingEntrantIds, activeEntrantIds, byeNote } = selectRestingEntrants(
    eligibleEntrants,
    entrantStatsById,
    courtsUsed,
    lastRoundRestingEntrantIds,
  );
  const activeEntrants = activeEntrantIds.map((id) => eligibleEntrantById.get(id)!);

  // See shouldUseGenderAwarePairing — evaluated against this round's own
  // active (on-court) entrants, so a grading round where the available
  // female players happen to be resting still falls back to normal
  // scheduling for that round alone.
  const genderAware = shouldUseGenderAwarePairing(activeEntrants.flatMap((e) => e.playerIds).map((id) => playersById.get(id)!).filter(Boolean));

  // Division-based grading (see "Grading divisions") — rest selection above
  // is identical either way; only who plays whom changes.
  if (settings.useGradingDivisions) {
    const { courts, unplacedEntrantIds } = arrangeDivisionGradingCourts({
      activeEntrants,
      courtsUsed,
      eligibleEntrants,
      priorRounds,
      playerStatsById,
      playersById,
      genderAware,
    });
    const assignments = courts.map((court, index) => arrangedCourtToAssignment(court, index + 1, true));
    const allRestingEntrantIds = [...restingEntrantIds, ...unplacedEntrantIds];
    const repeats = countRotationRepeats(assignments, eligibleEntrants, eligibleEntrantById, playerStatsById);
    return {
      id: makeDynamicPairingId('round'),
      roundNumber,
      phase: 'grading',
      status: 'current',
      courts: assignments,
      restingPlayerIds: allRestingEntrantIds.flatMap((id) => eligibleEntrantById.get(id)?.playerIds ?? []),
      restingEntrantIds: allRestingEntrantIds,
      rotationNote: rotationNoteFor(repeats),
      byeFairnessNote: byeNote ?? (unplacedEntrantIds.length > 0 ? byeNoteFor(false, true) : undefined),
      gradingMode: 'divisions',
      createdAt: Date.now(),
    };
  }

  let best: GradingCandidate | null = null;
  for (let attempt = 0; attempt < GRADING_SCHEDULE_ATTEMPTS; attempt++) {
    const candidate = buildGradingCandidate(
      shuffle(activeEntrants),
      courtsUsed,
      eligibleEntrants,
      eligibleEntrantById,
      playerStatsById,
      priorRounds,
      playersById,
      genderAware,
    );
    if (!best || candidate.penalty < best.penalty) best = candidate;
    // Good enough — stop searching early. Skipped while genderAware: a
    // repeat-opponent-free candidate can already turn up within the first
    // handful of attempts (trivially true for e.g. Round 1, before any
    // history exists at all), which wouldn't leave the search enough
    // attempts to also find a well-classified mixed/gendered grouping —
    // running the full GRADING_SCHEDULE_ATTEMPTS instead gives the gender
    // preference a real chance to matter, still bounded and still fast
    // (pure in-memory scoring, no I/O), and still dominated by the same
    // opponent/partner-repeat penalties either way.
    if (best.repeatOpponentCount === 0 && attempt >= 5 && !genderAware) break;
  }
  const chosen =
    best ??
    buildGradingCandidate(
      activeEntrants,
      courtsUsed,
      eligibleEntrants,
      eligibleEntrantById,
      playerStatsById,
      priorRounds,
      playersById,
      genderAware,
    );

  const restingPlayerIds = restingEntrantIds.flatMap((id) => eligibleEntrantById.get(id)?.playerIds ?? []);

  return {
    id: makeDynamicPairingId('round'),
    roundNumber,
    phase: 'grading',
    status: 'current',
    courts: chosen.courts,
    restingPlayerIds,
    restingEntrantIds,
    rotationNote: rotationNoteFor(chosen.repeatOpponentCount),
    byeFairnessNote: byeNote,
    createdAt: Date.now(),
  };
}

function rotationNoteFor(repeatOpponentCount: number): string | undefined {
  return repeatOpponentCount > 0
    ? `${repeatOpponentCount} repeat opponent${repeatOpponentCount === 1 ? '' : 's'} unavoidable due to available player/court constraints.`
    : undefined;
}

// Same count buildGradingCandidate keeps: opponent pairs who've already met
// while at least one of them still has unmet opponents.
function countRotationRepeats(
  courts: DynamicPairingCourtAssignment[],
  eligibleEntrants: DynamicPairingEntrant[],
  eligibleEntrantById: Map<string, DynamicPairingEntrant>,
  playerStatsById: Map<string, DynamicPairingPlayerStats>,
): number {
  let count = 0;
  for (const court of courts) {
    const side1 = entrantIdsForSide(court, 1).map((id) => eligibleEntrantById.get(id)).filter((e): e is DynamicPairingEntrant => e != null);
    const side2 = entrantIdsForSide(court, 2).map((id) => eligibleEntrantById.get(id)).filter((e): e is DynamicPairingEntrant => e != null);
    for (const a of side1) {
      for (const b of side2) {
        if (hasMetOpponent(a, b, playerStatsById) && !hasCompletedOpponentRotation(a, eligibleEntrants, playerStatsById)) count += 1;
      }
    }
  }
  return count;
}

// Entrant-aware counterpart of generateDynamicPairingRound, used once at
// least one fixed team exists. Grading rounds delegate to
// generateRotationAwareGradingRound above; ranking rounds rank entrants
// best-to-worst and build sides via buildSidesFromRankedEntrants. Per-
// player stats (calculateDynamicPairingStats) and partner/opponent history
// are read completely unmodified — see the "Fixed teams & entrants"
// section above for why that's safe.
export function generateDynamicPairingRoundWithTeams(
  players: Player[],
  teams: DynamicPairingTeam[],
  settings: DynamicPairingSettings,
  allPriorRounds: DynamicPairingRound[],
): DynamicPairingRound {
  const priorRounds = generationHistory(allPriorRounds);
  const roundNumber = (priorRounds[priorRounds.length - 1]?.roundNumber ?? 0) + 1;
  const phase: DynamicPairingRound['phase'] = roundNumber <= settings.gradingRounds ? 'grading' : 'ranking';

  // Grading rounds delegate to the rotation-aware entrant-based generator
  // (see "Rotation-aware grading rounds" above) — the same function used
  // by generateDynamicPairingRound's grading branch, just with `teams`
  // actually populated this time.
  if (phase === 'grading') return generateRotationAwareGradingRound(players, teams, settings, priorRounds);

  const playersById = new Map(players.map((p) => [p.id, p]));
  const entrants = buildDynamicPairingEntrants(players, teams);
  const availableEntrants = entrants.filter((e) => isEntrantAvailable(e, playersById, roundNumber));
  const availablePhysicalCount = availableEntrants.reduce((sum, e) => sum + e.playerIds.length, 0);
  const courtsUsed = calculateCourtsUsed(settings.numberOfCourts, availablePhysicalCount);

  const playerStats = calculateDynamicPairingStats(players, priorRounds);
  const playerStatsById = new Map(playerStats.map((s) => [s.playerId, s]));
  const entrantStatsById = new Map(
    availableEntrants.map((e) => [
      e.id,
      withByeAdjustment(playerStatsById.get(e.playerIds[0]) ?? emptyStats(e.playerIds[0]), e.playerIds, playersById),
    ]),
  );

  const lastRound = priorRounds.length > 0 ? priorRounds[priorRounds.length - 1] : undefined;
  const lastRoundRestingEntrantIds = new Set(lastRound?.restingEntrantIds ?? lastRound?.restingPlayerIds ?? []);

  const { restingEntrantIds, activeEntrantIds, byeNote } = selectRestingEntrants(
    availableEntrants,
    entrantStatsById,
    courtsUsed,
    lastRoundRestingEntrantIds,
  );
  const availableEntrantById = new Map(availableEntrants.map((e) => [e.id, e]));
  const activeEntrantIdSet = new Set(activeEntrantIds);

  // Grading already returned above — every round reaching this point is a
  // ranking round. See generateDynamicPairingRound's ranking branch for why
  // only genuinely-finished rounds may feed the lagged ranking, even when
  // `priorRounds` is a projected chain containing not-yet-played 'upcoming'
  // rounds (see extendDynamicPairingLookahead).
  const completedRoundsForRanking = priorRounds.filter((r) => r.status === 'locked' || r.status === 'completed');
  const { ranking, basis } = calculateDynamicPairingRankingForRound(
    players,
    teams,
    completedRoundsForRanking,
    roundNumber,
    settings.rankingLagRounds,
    { useGradingDivisions: settings.useGradingDivisions },
  );
  const orderedActiveEntrants = ranking.filter((row) => activeEntrantIdSet.has(row.entrant.id)).map((row) => row.entrant);

  // Rank order gives the preferred arrangement (sides by rank-adjacency,
  // two sides per court, court 1 strongest); the shared search then
  // removes repeat opponents/partners, re-pairs individuals for partner
  // rotation, honours the movement limit and gender preference — the same
  // priorities as the individual-only path.
  const { sides, oddOneOutEntrantId } = buildSidesFromRankedEntrants(orderedActiveEntrants);
  const preferredCourts = groupSidesIntoCourts(sides, courtsUsed).map((court) =>
    [...entrantIdsForSide(court, 1), ...entrantIdsForSide(court, 2)].map((id) => availableEntrantById.get(id)!),
  );
  const previousCourtByPlayerId = new Map<string, number>();
  for (const s of playerStats) {
    if (s.currentCourt != null) previousCourtByPlayerId.set(s.playerId, s.currentCourt);
  }
  const activePlayers = preferredCourts.flat().flatMap((e) => e.playerIds).map((id) => playersById.get(id)!).filter(Boolean);
  const arranged = arrangeRankingCourts({
    preferredCourts,
    rankPositionById: new Map(orderedActiveEntrants.map((e, index) => [e.id, index])),
    eligibleEntrants: availableEntrants,
    priorRounds,
    playerStatsById,
    previousCourtByPlayerId,
    maxCourtMovement: settings.maxCourtMovement,
    playersById,
    genderAware: shouldUseGenderAwarePairing(activePlayers),
  });
  const courts = arranged.map((court, index) => arrangedCourtToAssignment(court, index + 1, true));

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
    rankingBasis: basis,
    // An odd-one-out entrant rests on top of the fair selection (it
    // couldn't be paired into a side); if it also rested last round, that
    // repeat was forced by the entrant mix, so it's noted the same way.
    byeFairnessNote:
      byeNote ??
      (oddOneOutEntrantId ? byeNoteFor(lastRoundRestingEntrantIds.has(oddOneOutEntrantId), true) : undefined),
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
// Records either kind of result (see ScoreRecordingMode): a full score
// stores both scores plus the derived winnerTeam; a Win/Loss-only result
// stores winnerTeam alone and clears any earlier scores, so the court is
// never both at once.
export function processDynamicPairingResult(
  round: DynamicPairingRound,
  courtNumber: number,
  result: ResultSubmission,
): DynamicPairingRound {
  return {
    ...round,
    courts: round.courts.map((court) => {
      if (court.courtNumber !== courtNumber) return court;
      if (result.kind === 'winner') {
        return { ...court, score1: undefined, score2: undefined, winnerTeam: result.winner === 'A' ? 1 : 2, status: 'completed' };
      }
      const { scoreA: score1, scoreB: score2 } = result;
      return { ...court, score1, score2, winnerTeam: score1 === score2 ? undefined : score1 > score2 ? 1 : 2, status: 'completed' };
    }),
  };
}

// Marks a round read-only once the next round has been generated — see
// DynamicPairingRoundStatus.
export function lockCompletedRound(round: DynamicPairingRound): DynamicPairingRound {
  return { ...round, status: 'locked' };
}

// --- Mid-session player/court changes -------------------------------------
// See README's "Mid-session player and court changes". Touches whichever
// 'upcoming'/'pending-results' rounds currently exist — the pre-generated
// grading batch, and/or the dynamic-pairing look-ahead window (see
// extendDynamicPairingLookahead) — plus the live 'current' round (for a
// swap only). 'locked'/'completed' rounds are never rewritten.

// Regenerates every still-'upcoming' *pre-generated grading* round (round
// number <= settings.gradingRounds only) against the current player pool/
// settings — call after a player's availability changes or the court
// count changes, mid-grading-phase. Never touches the dynamic-pairing
// tail beyond the grading batch (real 'upcoming' rounds or a
// 'pending-results' placeholder — see extendDynamicPairingLookahead),
// even though one can now exist alongside a still-in-progress grading
// phase; those are left exactly as passed in, ready for
// extendDynamicPairingLookahead to rebuild next (see
// regenerateUpcomingRoundsForEntrants). A no-op once every grading round
// has been played (there's nothing left pre-generated to regenerate).
export function regenerateUpcomingGradingRounds(
  players: Player[],
  settings: DynamicPairingSettings,
  rounds: DynamicPairingRound[],
): DynamicPairingRound[] {
  const settledGrading = rounds.filter((r) => r.roundNumber <= settings.gradingRounds && r.status !== 'upcoming');
  const upcomingGradingCount = rounds.filter(
    (r) => r.roundNumber <= settings.gradingRounds && r.status === 'upcoming',
  ).length;
  if (upcomingGradingCount === 0) return rounds;

  let generated = settledGrading;
  for (let i = 0; i < upcomingGradingCount; i++) {
    generated = [...generated, { ...generateDynamicPairingRound(players, settings, generated), status: 'upcoming' }];
  }
  const beyondGrading = rounds.filter(
    (r) => r.roundNumber > settings.gradingRounds && r.status !== 'upcoming' && r.status !== 'pending-results',
  );
  return [...generated, ...beyondGrading];
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
  const settledGrading = rounds.filter((r) => r.roundNumber <= settings.gradingRounds && r.status !== 'upcoming');
  const upcomingGradingCount = rounds.filter(
    (r) => r.roundNumber <= settings.gradingRounds && r.status === 'upcoming',
  ).length;
  if (upcomingGradingCount === 0) return rounds;

  const futurePlayers = playersForFutureRounds(players);
  let generated = settledGrading;
  for (let i = 0; i < upcomingGradingCount; i++) {
    generated = [
      ...generated,
      { ...generateDynamicPairingRoundForEntrants(futurePlayers, teams, settings, generated), status: 'upcoming' },
    ];
  }
  const beyondGrading = rounds.filter(
    (r) => r.roundNumber > settings.gradingRounds && r.status !== 'upcoming' && r.status !== 'pending-results',
  );
  return [...generated, ...beyondGrading];
}

// The dynamic-pairing look-ahead tail, unified across both phases — this
// is what makes future Dynamic Pairing rounds viewable in All Rounds
// before they become current, and what removes the old Admin Skill
// Review gate: rather than waiting for the whole grading phase to finish
// before considering any ranking round, this runs after *every* round
// completes (grading or dynamic) and asks the same question each time —
// "how far past the grading batch can a real round now be generated?"
//
// Keeps every round already saved — the grading batch, settled rounds,
// and any real 'upcoming' dynamic round generated on an earlier pass —
// exactly as it is, and only replaces the single 'pending-results'
// placeholder. A saved upcoming round is never rebuilt here: its lagged
// ranking basis was already complete when it was generated, so a later
// result can't change it, and rebuilding it would make the round that
// becomes current differ from the one All Rounds showed (the "one saved
// schedule" rule — see README). Discarding saved upcoming rounds is
// regenerateUpcomingRoundsForEntrants' job, for an actual reason
// (availability, courts, a new player). For each round number beyond
// the last kept round, in order: if its lagged
// ranking basis (Round N - 1 - rankingLagRounds) is already covered by
// genuinely completed ('locked'/'completed') rounds — or needs none at
// all, i.e. baseline — generate it for real via
// generateDynamicPairingRoundForEntrants and keep going; the moment a
// round's basis *isn't* yet available, stop and append exactly one
// 'pending-results' placeholder for it instead (see
// DynamicPairingRankingBasis.requiredCompletedRoundNumber), so All Rounds
// always shows what's coming next and what it's waiting on, without
// guessing further ahead than the lag actually supports. Because
// requiredCompletedRoundNumber for round N is always N - 1 - lag <= N - 1,
// this placeholder is always upgraded to a real round the moment the
// round immediately before it locks (see generateNextRound in
// useDynamicPairingSocial.ts) — a session can never get stuck waiting on
// a manual confirmation step.
export function extendDynamicPairingLookahead(
  players: Player[],
  teams: DynamicPairingTeam[],
  settings: DynamicPairingSettings,
  rounds: DynamicPairingRound[],
): DynamicPairingRound[] {
  const kept = rounds.filter((r) => r.status !== 'pending-results');
  // Everything generated here is a future round — see playersForFutureRounds.
  const futurePlayers = playersForFutureRounds(players);
  const lastKeptRoundNumber = kept.reduce((max, r) => Math.max(max, r.roundNumber), 0);
  const lastLockedRoundNumber = rounds.reduce(
    (max, r) => ((r.status === 'locked' || r.status === 'completed') && r.roundNumber > max ? r.roundNumber : max),
    0,
  );
  const lag = Math.max(0, settings.rankingLagRounds);
  const targetMaxRealRoundNumber = lastLockedRoundNumber + 1 + lag;

  let generated = kept;
  let nextRoundNumber = Math.max(lastKeptRoundNumber, settings.gradingRounds) + 1;
  while (nextRoundNumber <= targetMaxRealRoundNumber) {
    const round = { ...generateDynamicPairingRoundForEntrants(futurePlayers, teams, settings, generated), status: 'upcoming' as const };
    generated = [...generated, round];
    nextRoundNumber += 1;
  }

  const requiredCompletedRoundNumber = nextRoundNumber - 1 - lag;
  const placeholder: DynamicPairingRound = {
    id: makeDynamicPairingId('round'),
    roundNumber: nextRoundNumber,
    phase: 'ranking',
    status: 'pending-results',
    courts: [],
    restingPlayerIds: [],
    rankingBasis: {
      type: 'lagged-results',
      includedRoundNumbers: [],
      rankingLagRounds: lag,
      targetRoundNumber: nextRoundNumber,
      requiredCompletedRoundNumber: requiredCompletedRoundNumber > 0 ? requiredCompletedRoundNumber : undefined,
      note:
        requiredCompletedRoundNumber > 0
          ? `Waiting for Round ${requiredCompletedRoundNumber} results`
          : 'Waiting for more completed rounds',
    },
    createdAt: Date.now(),
  };

  return [...generated, placeholder];
}

// Convenience wrapper for mid-session availability/court-count changes —
// covers both phases in one call: first refreshes whichever pre-generated
// grading rounds are still 'upcoming', then rebuilds the dynamic-pairing
// look-ahead tail (real rounds as far as now computable, plus one
// 'pending-results' placeholder) against the result — see
// regenerateUpcomingGradingRoundsForEntrants and
// extendDynamicPairingLookahead. Both steps can now do something on the
// same call, since a real or placeholder dynamic round can exist
// alongside a still-in-progress grading phase.
export function regenerateUpcomingRoundsForEntrants(
  players: Player[],
  teams: DynamicPairingTeam[],
  settings: DynamicPairingSettings,
  rounds: DynamicPairingRound[],
): DynamicPairingRound[] {
  const afterGrading = regenerateUpcomingGradingRoundsForEntrants(players, teams, settings, rounds);
  // Drop the unlocked dynamic tail so the look-ahead rebuilds it against
  // the changed roster/courts (extendDynamicPairingLookahead alone keeps it).
  const withoutUnlockedTail = afterGrading.filter(
    (r) => r.roundNumber <= settings.gradingRounds || (r.status !== 'upcoming' && r.status !== 'pending-results'),
  );
  return extendDynamicPairingLookahead(players, teams, settings, withoutUnlockedTail);
}

// Rebuilds the *current* round itself (same roundNumber, same phase, same
// 'current' status) against an updated roster — the Dynamic Pairing Social
// counterpart of useTournament's regenerateCurrentRound — then rebuilds
// whichever look-ahead window follows it (grading's pre-generated batch, or
// the ranking-lag window), exactly the same way regenerateUpcomingRoundsForEntrants
// does. Used for the mid-session Add Player flow's "Join current round"
// option: a new entrant simply isn't in `players`/`teams` yet when the
// current round was first generated, so the only way to fold them in is to
// regenerate it. Returns null (no-op) when there's no current round, or it
// already has a score entered anywhere — see
// canRegenerateRoundInPlace in utils/tournament.ts, whose exact rule this
// mirrors (this file doesn't import that function, to keep this mode's
// isolation intact — see the file header).
export function regenerateCurrentDynamicPairingRound(
  players: Player[],
  teams: DynamicPairingTeam[],
  settings: DynamicPairingSettings,
  rounds: DynamicPairingRound[],
): DynamicPairingRound[] | null {
  const currentIndex = rounds.findIndex((r) => r.status === 'current');
  if (currentIndex === -1) return null;
  const current = rounds[currentIndex];
  if (current.courts.some(courtHasResult)) return null;

  const before = rounds.slice(0, currentIndex);
  const after = rounds.slice(currentIndex + 1); // always 'upcoming' pre-generated rounds, if any — discarded and rebuilt below
  const freshCurrent: DynamicPairingRound = {
    ...generateDynamicPairingRoundForEntrants(players, teams, settings, before),
    status: 'current',
  };

  return regenerateUpcomingRoundsForEntrants(players, teams, settings, [...before, freshCurrent, ...after]);
}

// --- Swapping any two players ------------------------------------------
// The organiser picks any two players in the current round — on the same
// court, on different courts, or one on a court and one resting/unscheduled
// — and planDynamicPairingSwap works out the edit, validates it, and
// describes it for a preview before anything is saved. A fixed team only
// ever moves as a whole side: selecting a fixed-team member swaps their
// whole team with the other player's whole side (or resting fixed team).

type SwapLocation =
  | { kind: 'court'; courtIndex: number; side: 1 | 2 }
  | { kind: 'resting' }
  | { kind: 'not-scheduled' };

function locateInRound(round: DynamicPairingRound, playerId: string): SwapLocation {
  const courtIndex = round.courts.findIndex((c) => c.playerIds.includes(playerId));
  if (courtIndex !== -1) {
    return { kind: 'court', courtIndex, side: round.courts[courtIndex].team1PlayerIds.includes(playerId) ? 1 : 2 };
  }
  return round.restingPlayerIds.includes(playerId) ? { kind: 'resting' } : { kind: 'not-scheduled' };
}

export interface DynamicPairingSwapPlan {
  round: DynamicPairingRound;
  // e.g. "Thai (Court 1) ↔ John (Court 2)" — also the adjustment-log note.
  summary: string;
  // The affected courts/rest list before and after the swap, one line
  // each, for the preview.
  before: string[];
  after: string[];
  // Every physical player whose place changed.
  movedPlayerIds: string[];
}

// Rebuilds one side's entrant ids from the current teams: a side that is
// exactly a fixed team is that team, anything else is its individuals.
function sideEntrantIds(sidePlayerIds: string[], teams: DynamicPairingTeam[]): string[] {
  const team = teams.find((t) => isDynamicPairingFixedTeamSide(sidePlayerIds, [t]));
  return team ? [team.id] : [...sidePlayerIds];
}

function restingEntrantIdsFor(restingPlayerIds: string[], teams: DynamicPairingTeam[]): string[] {
  const ids: string[] = [];
  for (const id of restingPlayerIds) {
    const team = teams.find((t) => t.playerIds.includes(id));
    const entrantId = team && team.playerIds.every((p) => restingPlayerIds.includes(p)) ? team.id : id;
    if (!ids.includes(entrantId)) ids.push(entrantId);
  }
  return ids;
}

// Whether a player can be put onto a court right now: available (or a new
// joiner whose first round has arrived). A 'resting-this-round' player
// asked to sit out, so they need making available first, like any other
// away status.
function canTakeCourtSpot(player: Player | undefined, roundNumber: number): boolean {
  return player != null && isPlayerAvailable(player, roundNumber);
}

export function planDynamicPairingSwap(
  round: DynamicPairingRound,
  playerAId: string,
  playerBId: string,
  players: Player[],
  teams: DynamicPairingTeam[] = [],
): { ok: true; plan: DynamicPairingSwapPlan } | { ok: false; reason: string } {
  const playersById = new Map(players.map((p) => [p.id, p]));
  const nameOf = (id: string) => playersById.get(id)?.name || 'Unknown player';
  if (round.status !== 'current') return { ok: false, reason: 'Swaps are only allowed in the current round.' };
  if (playerAId === playerBId) return { ok: false, reason: 'Choose two different players to swap.' };

  // Keep "A" as a player on a court whenever either one is.
  let [aId, bId] = [playerAId, playerBId];
  let locA = locateInRound(round, aId);
  let locB = locateInRound(round, bId);
  if (locA.kind !== 'court' && locB.kind === 'court') {
    [aId, bId] = [bId, aId];
    [locA, locB] = [locB, locA];
  }
  if (locA.kind !== 'court') {
    return locA.kind === 'resting' && locB.kind === 'resting'
      ? { ok: false, reason: `${nameOf(aId)} and ${nameOf(bId)} are both resting — there is nothing to swap.` }
      : { ok: false, reason: 'Choose at least one player who is on a court this round.' };
  }

  for (const loc of [locA, locB]) {
    if (loc.kind === 'court' && courtHasResult(round.courts[loc.courtIndex])) {
      const courtNumber = round.courts[loc.courtIndex].courtNumber;
      return { ok: false, reason: `${courtLabel(round.courtNumbers, courtNumber)} already has a result. Reset that result before changing its players.` };
    }
  }

  const courts = round.courts.map((c) => ({ ...c, team1PlayerIds: [...c.team1PlayerIds], team2PlayerIds: [...c.team2PlayerIds] }));
  let resting = [...round.restingPlayerIds];
  const sideOf = (loc: { courtIndex: number; side: 1 | 2 }) =>
    loc.side === 1 ? courts[loc.courtIndex].team1PlayerIds : courts[loc.courtIndex].team2PlayerIds;
  const setSide = (loc: { courtIndex: number; side: 1 | 2 }, ids: string[]) => {
    if (loc.side === 1) courts[loc.courtIndex].team1PlayerIds = ids;
    else courts[loc.courtIndex].team2PlayerIds = ids;
  };

  const teamOf = (id: string) => teams.find((t) => t.playerIds.includes(id));
  const sideA = sideOf(locA);
  const aOnTeamSide = isDynamicPairingFixedTeamSide(sideA, teams);
  const bTeam = teamOf(bId);
  const bOnTeamSide = locB.kind === 'court' && isDynamicPairingFixedTeamSide(sideOf(locB), teams);
  const bRestingTeam =
    locB.kind === 'resting' && bTeam != null && bTeam.playerIds.every((id) => round.restingPlayerIds.includes(id));
  let summary: string;
  let movedPlayerIds: string[];

  if (aOnTeamSide || bOnTeamSide || bRestingTeam) {
    // Whole-side swap — fixed teams never split.
    const unitA = [...sideA];
    if (locB.kind === 'court') {
      if (locB.courtIndex === locA.courtIndex) {
        return {
          ok: false,
          reason:
            locB.side === locA.side
              ? `${nameOf(aId)} and ${nameOf(bId)} are already partners.`
              : `${nameOf(aId)} and ${nameOf(bId)} are on the same court — a fixed team can only be swapped with a side on another court or a resting fixed team.`,
        };
      }
      const unitB = [...sideOf(locB)];
      setSide(locA, unitB);
      setSide(locB, unitA);
      movedPlayerIds = [...unitA, ...unitB];
      summary = `${unitA.map(nameOf).join(' / ')} (${courtLabel(round.courtNumbers, courts[locA.courtIndex].courtNumber)}) ↔ ${unitB.map(nameOf).join(' / ')} (${courtLabel(round.courtNumbers, courts[locB.courtIndex].courtNumber)})`;
    } else if (bRestingTeam && bTeam) {
      const unavailable = bTeam.playerIds.find((id) => !canTakeCourtSpot(playersById.get(id), round.roundNumber));
      if (unavailable) return { ok: false, reason: `${nameOf(unavailable)} isn't available to play — make them available first.` };
      setSide(locA, [...bTeam.playerIds]);
      resting = [...resting.filter((id) => !bTeam.playerIds.includes(id)), ...unitA];
      movedPlayerIds = [...unitA, ...bTeam.playerIds];
      summary = `${unitA.map(nameOf).join(' / ')} (${courtLabel(round.courtNumbers, courts[locA.courtIndex].courtNumber)}) ↔ ${bTeam.playerIds.map(nameOf).join(' / ')} (resting)`;
    } else {
      return {
        ok: false,
        reason: `${nameOf(aId)} is in a fixed team, so they can only be swapped with a full side on another court or a resting fixed team.`,
      };
    }
  } else if (locB.kind === 'court') {
    if (locB.courtIndex === locA.courtIndex && locB.side === locA.side) {
      return { ok: false, reason: `${nameOf(aId)} and ${nameOf(bId)} are already partners.` };
    }
    const replace = (ids: string[]) => ids.map((id) => (id === aId ? bId : id === bId ? aId : id));
    for (const loc of [locA, locB]) setSide(loc, replace(sideOf(loc)));
    movedPlayerIds = [aId, bId];
    summary =
      locA.courtIndex === locB.courtIndex
        ? `${nameOf(aId)} ↔ ${nameOf(bId)} (${courtLabel(round.courtNumbers, courts[locA.courtIndex].courtNumber)}, swapping sides)`
        : `${nameOf(aId)} (${courtLabel(round.courtNumbers, courts[locA.courtIndex].courtNumber)}) ↔ ${nameOf(bId)} (${courtLabel(round.courtNumbers, courts[locB.courtIndex].courtNumber)})`;
  } else {
    // A player on a court swaps with someone resting or not yet scheduled.
    const playerB = playersById.get(bId);
    if (!canTakeCourtSpot(playerB, round.roundNumber)) {
      const status = playerB?.availabilityStatus ?? 'available';
      return {
        ok: false,
        reason: `${nameOf(bId)} is marked ${dynamicPairingAvailabilityLabel(status)} — make them available before putting them on a court.`,
      };
    }
    if (bTeam) {
      return { ok: false, reason: `${nameOf(bId)} is in a fixed team and can't come onto a court without their partner.` };
    }
    setSide(locA, sideA.map((id) => (id === aId ? bId : id)));
    // A player who's actually away (late, unavailable, injured, left early)
    // leaves the round entirely rather than being counted as resting.
    const playerA = playersById.get(aId);
    const aStillHere = playerA != null && (isPlayerAvailable(playerA, round.roundNumber) || statusOfPlayer(playerA) === 'resting-this-round');
    resting = [...resting.filter((id) => id !== bId), ...(aStillHere ? [aId] : [])];
    movedPlayerIds = [aId, bId];
    summary = `${nameOf(aId)} (${courtLabel(round.courtNumbers, courts[locA.courtIndex].courtNumber)}) ↔ ${nameOf(bId)} (${locB.kind === 'resting' ? 'resting' : 'not scheduled'})`;
  }

  const hasEntrantIds = round.courts.some((c) => c.team1EntrantIds != null) || teams.length > 0;
  const nextCourts: DynamicPairingCourtAssignment[] = courts.map((court, index) => {
    const original = round.courts[index];
    const changed =
      court.team1PlayerIds.join() !== original.team1PlayerIds.join() || court.team2PlayerIds.join() !== original.team2PlayerIds.join();
    if (!changed) return original;
    return {
      ...court,
      playerIds: [...court.team1PlayerIds, ...court.team2PlayerIds],
      ...(hasEntrantIds
        ? { team1EntrantIds: sideEntrantIds(court.team1PlayerIds, teams), team2EntrantIds: sideEntrantIds(court.team2PlayerIds, teams) }
        : {}),
    };
  });
  const nextRound: DynamicPairingRound = {
    ...round,
    courts: nextCourts,
    restingPlayerIds: resting,
    restingEntrantIds: round.restingEntrantIds || teams.length > 0 ? restingEntrantIdsFor(resting, teams) : undefined,
  };

  // Belt and braces: never save a round with a player twice, a side that
  // isn't two players, or someone both playing and resting.
  const onCourt = nextCourts.flatMap((c) => c.playerIds);
  const valid =
    new Set(onCourt).size === onCourt.length &&
    nextCourts.every((c) => c.team1PlayerIds.length === 2 && c.team2PlayerIds.length === 2) &&
    !resting.some((id) => onCourt.includes(id)) &&
    new Set(resting).size === resting.length;
  if (!valid) return { ok: false, reason: 'That swap would leave the round in an invalid state, so it was not applied.' };

  const courtLine = (court: DynamicPairingCourtAssignment) =>
    `${courtLabel(round.courtNumbers, court.courtNumber)}: ${court.team1PlayerIds.map(nameOf).join(' / ')} vs ${court.team2PlayerIds.map(nameOf).join(' / ')}`;
  const restLine = (ids: string[]) => `Resting: ${ids.length > 0 ? ids.map(nameOf).join(', ') : 'nobody'}`;
  const changedIndexes = nextCourts.map((court, index) => (court !== round.courts[index] ? index : -1)).filter((i) => i !== -1);
  const before = changedIndexes.map((i) => courtLine(round.courts[i]));
  const after = changedIndexes.map((i) => courtLine(nextCourts[i]));
  if (resting.join() !== round.restingPlayerIds.join()) {
    before.push(restLine(round.restingPlayerIds));
    after.push(restLine(resting));
  }
  return { ok: true, plan: { round: nextRound, summary, before, after, movedPlayerIds } };
}

function statusOfPlayer(player: Player): PlayerAvailabilityStatus {
  return player.availabilityStatus ?? 'available';
}

// After a swap, the next saved round was planned around the old line-up —
// lists anything the swap made unfair there for the players it moved (a
// back-to-back opponent, temporary partner or bye), so the organiser can
// choose to refresh the upcoming rounds.
export function upcomingConflictsAfterSwap(
  rounds: DynamicPairingRound[],
  swappedRound: DynamicPairingRound,
  movedPlayerIds: string[],
  players: Player[],
  teams: DynamicPairingTeam[] = [],
): string[] {
  const next = rounds.find((r) => r.roundNumber === swappedRound.roundNumber + 1 && r.status === 'upcoming');
  if (!next) return [];
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name || 'Unknown player';
  const now = roundEncounterKeys(swappedRound);
  const later = roundEncounterKeys(next);
  const moved = new Set(movedPlayerIds);
  const involvesMoved = (key: string) => key.split('|').some((id) => moved.has(id));
  const names = (key: string) => key.split('|').map(nameOf).join(' and ');
  const conflicts: string[] = [];
  for (const key of later.opponents) {
    if (now.opponents.has(key) && involvesMoved(key)) conflicts.push(`${names(key)} would face each other again in Round ${next.roundNumber}.`);
  }
  for (const key of later.partners) {
    if (now.partners.has(key) && involvesMoved(key) && !isDynamicPairingFixedTeamSide(key.split('|'), teams)) {
      conflicts.push(`${names(key)} would partner again in Round ${next.roundNumber}.`);
    }
  }
  for (const id of movedPlayerIds) {
    if (swappedRound.restingPlayerIds.includes(id) && next.restingPlayerIds.includes(id)) {
      conflicts.push(`${nameOf(id)} would rest in both Round ${swappedRound.roundNumber} and Round ${next.roundNumber}.`);
    }
  }
  return conflicts;
}

// Clears one court's result in the current round so it can be re-entered
// or its players changed — the supported correction workflow for a scored
// court. Completed (locked) rounds are never changed.
export function clearDynamicPairingCourtResult(round: DynamicPairingRound, courtNumber: number): DynamicPairingRound {
  if (round.status !== 'current') return round;
  return {
    ...round,
    courts: round.courts.map((court) =>
      court.courtNumber === courtNumber
        ? { ...court, score1: undefined, score2: undefined, winnerTeam: undefined, status: 'pending' }
        : court,
    ),
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
    rounds.push(generateDynamicPairingRound(i === 0 ? players : playersForFutureRounds(players), settings, rounds));
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
    rounds.push(generateDynamicPairingRoundWithTeams(i === 0 ? players : playersForFutureRounds(players), teams, settings, rounds));
  }
  return rounds.map((round, index) => (index === 0 ? round : { ...round, status: 'upcoming' }));
}

// Ends the current round and activates the next one, exactly as saved:
// locks the current round, lets extendDynamicPairingLookahead turn any
// now-unblocked placeholder into a real round, then promotes the saved
// upcoming round with the next number to 'current'. Nothing that was
// already saved is regenerated, so the round that becomes current is the
// one All Rounds showed. Falls back to generating fresh only when no saved
// round exists (an otherwise-unreachable state, e.g. hand-edited storage),
// rather than leaving the organiser stuck. Returns null when there's no
// current round. `players` should already have this round's end-of-round
// status changes applied (see useDynamicPairingSocial.generateNextRound).
export function advanceDynamicPairingRound(
  players: Player[],
  teams: DynamicPairingTeam[],
  settings: DynamicPairingSettings,
  rounds: DynamicPairingRound[],
): DynamicPairingRound[] | null {
  const current = rounds.find((r) => r.status === 'current');
  if (!current) return null;
  const locked = rounds.map((r) => (r.id === current.id ? lockCompletedRound(r) : r));
  const withLookahead = extendDynamicPairingLookahead(players, teams, settings, locked);
  const upcoming = withLookahead.find((r) => r.roundNumber === current.roundNumber + 1 && r.status === 'upcoming');
  if (upcoming) return withLookahead.map((r) => (r.id === upcoming.id ? { ...r, status: 'current' } : r));
  const fresh = generateDynamicPairingRoundForEntrants(players, teams, settings, withLookahead);
  return [...withLookahead.filter((r) => r.roundNumber !== fresh.roundNumber), { ...fresh, status: 'current' }];
}

// Settings as saved by any version of the app → the current shape. The
// only schema migration this mode needs: every other field added since
// (Player/team gradingDivision, round gradingMode) is optional and simply
// reads as "not set".
export function normalizeDynamicPairingSettings(stored: DynamicPairingSettings): DynamicPairingSettings {
  return {
    ...stored,
    scoreRecordingMode: normalizeScoreRecordingMode(stored.scoreRecordingMode),
    useGradingDivisions: stored.useGradingDivisions === true,
    courtNumbers: resolveCourtNumbers(stored.courtNumbers, stored.numberOfCourts),
  };
}

// Historical gate, no longer part of the required flow (see
// extendDynamicPairingLookahead / generateNextRound in
// useDynamicPairingSocial.ts, which now generate and activate Round
// `gradingRounds + 1` automatically the moment the grading phase
// finishes — no admin ranking confirmation required). Kept only so
// useDynamicPairingSocial can detect, and self-heal, a session whose
// `rounds` were saved to localStorage by an older version of this app
// while genuinely stuck at this checkpoint; a normally-progressing
// session started under the current version can never reach this state
// (see the self-heal effect there).
export function isAwaitingSkillReview(rounds: DynamicPairingRound[], settings: DynamicPairingSettings): boolean {
  if (rounds.length === 0) return false;
  if (rounds.some((r) => r.status === 'current')) return false;
  return isGradingPhaseComplete(rounds, settings);
}

// Rounds that have actually been played (or are being played right now) —
// excludes 'upcoming' pre-generated rounds and 'pending-results'
// placeholders alike. Stats/rankings/rest-history must only ever be
// computed from this, never the raw `rounds` array, while grading rounds
// are still pre-generated but not yet reached, or a future Dynamic
// Pairing round already exists ahead of the current one — otherwise a
// not-yet-played round (real or placeholder) would inflate rest counts,
// win/loss records, and partner history before it's actually been played.
// (Round *generation* itself is the one deliberate exception — see
// generateInitialGradingRounds — since it's meant to plan fairness across
// the whole projected batch.)
export function playedDynamicPairingRounds(rounds: DynamicPairingRound[]): DynamicPairingRound[] {
  return rounds.filter((r) => r.status !== 'upcoming' && r.status !== 'pending-results');
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
    case 'pending-results':
      return 'Pending Results';
  }
}

// What the "advance" button on Current Round should say and do next.
// Under the current game-lag-driven flow, the round after `currentRound`
// always already exists as 'upcoming' by the time its scores are fully
// entered (either a still-pre-generated grading round, or a dynamic
// round extendDynamicPairingLookahead has already upgraded from a
// placeholder — see that function's doc comment for why this is
// guaranteed) — so this is normally just "Continue to Round N". The
// fallback below is only a safety net for an otherwise-unreachable state
// (e.g. hand-edited localStorage); useDynamicPairingSocial's
// generateNextRound always generates fresh in that case rather than
// leaving the organiser stuck.
export function nextRoundButtonLabel(currentRound: DynamicPairingRound, rounds: DynamicPairingRound[]): string {
  const upcoming = rounds.find((r) => r.roundNumber === currentRound.roundNumber + 1 && r.status === 'upcoming');
  if (upcoming) return `Continue to Round ${upcoming.roundNumber}`;
  return 'Generate Next Round';
}

// Display label for a round's phase — see DynamicPairingRoundPhase. Pass
// the round's gradingMode to label division-based grading rounds.
export function roundPhaseLabel(phase: DynamicPairingRoundPhase, gradingMode?: DynamicPairingRound['gradingMode']): string {
  if (phase !== 'grading') return 'Dynamic Pairing';
  return gradingMode === 'divisions' ? 'Division Grading' : 'Random Grading';
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
