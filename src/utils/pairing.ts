// Pairing-style-aware round generation, and the mixed fixed-team /
// individual-player doubles engine, for Tournament Mode's Leaderboard
// format and Social Play. The "original" 'balanced' pairing algorithm
// (fewest-prior-meetings, greedy with random restarts) still lives in
// utils/tournament.ts as createRound/createFixedTeamRound — this file adds
// the 'leaderboard-based'/'random' styles on top of them, plus
// generateMixedDoublesRound for when the Doubles roster has both fixed
// Teams and individual Players at once (see ParticipantSetup).
//
// This file imports the shared primitives (MeetingCounts, buildMatchHistory,
// pairByFewestMeetings, computePlayerStats, ...) from utils/tournament.ts,
// which imports a few dispatch functions back from here — see the comment
// on that import in tournament.ts for why the circularity is safe.

import type {
  Match,
  PairingStyle,
  Player,
  PlayerStats,
  Round,
  RoundStatus,
  Team,
  TeamInstance,
  TeamStats,
  TournamentSettings,
} from '../types';
import {
  buildMatchHistory,
  computePlayerStats,
  computeTeamStats,
  createFixedTeamRound,
  createRound,
  makeId,
  meetingCount,
  pairByFewestMeetings,
  type MeetingCounts,
  shuffled,
} from './tournament';

// A generic "who's playing" unit: 1 player id for a Singles competitor, 2
// for a doubles side (fixed team or temporary partnership). Every style
// dispatcher below works off this shape so the same rank/random/repeat-
// avoidance logic applies whether the unit is a lone player or a pair.
interface Pairable {
  id: string;
  playerIds: string[];
}

function pairAdjacent<T>(items: T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i + 1 < items.length; i += 2) {
    pairs.push([items[i], items[i + 1]]);
  }
  return pairs;
}

// --- Repeat-avoidance / rating-balance scoring ----------------------------
// Used directly by the 'balanced' style for mixed doubles (and by
// createFixedTeamRound/createRound's non-balanced branches, indirectly, via
// the dispatchers below). Repeats dominate the score (REPEAT_WEIGHT) so two
// units that have never met always rank above two that have, no matter the
// rating gap — rating is only a tiebreaker among equally-fresh matchups.
const REPEAT_WEIGHT = 1000;

export function getOpponentHistoryCount(opponents: MeetingCounts, aId: string, bId: string): number {
  return meetingCount(opponents, aId, bId);
}

export function getPartnerHistoryCount(teammates: MeetingCounts, aId: string, bId: string): number {
  return meetingCount(teammates, aId, bId);
}

export function scorePotentialMatchup(
  unitA: Pairable,
  unitB: Pairable,
  opponents: MeetingCounts,
  ratingByPlayerId?: Map<string, number>,
): number {
  let repeatCount = 0;
  for (const a of unitA.playerIds) {
    for (const b of unitB.playerIds) {
      repeatCount += getOpponentHistoryCount(opponents, a, b);
    }
  }
  if (!ratingByPlayerId) return repeatCount * REPEAT_WEIGHT;

  const averageRating = (ids: string[]): number | undefined => {
    const rated = ids.map((id) => ratingByPlayerId.get(id)).filter((r): r is number => r != null);
    return rated.length > 0 ? rated.reduce((sum, r) => sum + r, 0) / rated.length : undefined;
  };
  const ratingA = averageRating(unitA.playerIds);
  const ratingB = averageRating(unitB.playerIds);
  const ratingGap = ratingA != null && ratingB != null ? Math.abs(ratingA - ratingB) : 0;

  return repeatCount * REPEAT_WEIGHT + ratingGap;
}

export function scorePotentialPartnering(playerA: Player, playerB: Player, teammates: MeetingCounts): number {
  return getPartnerHistoryCount(teammates, playerA.id, playerB.id);
}

// Generic greedy nearest-neighbour matchup pairing (same idea as
// tournament.ts's greedyPairTeamsInOrder, generalised to any Pairable unit
// and pluggable score function) with random restarts, keeping whichever
// ordering minimises total matchup cost.
const PAIRING_TRIALS = 40;

function pairUnitsByFewestMeetings<T extends Pairable>(
  units: T[],
  opponents: MeetingCounts,
  ratingByPlayerId?: Map<string, number>,
): [T, T][] {
  function greedyPass(order: T[]): [T, T][] {
    const remaining = [...order];
    const pairs: [T, T][] = [];
    while (remaining.length >= 2) {
      const unit = remaining.shift()!;
      let bestIndex = 0;
      let bestScore = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const score = scorePotentialMatchup(unit, remaining[i], opponents, ratingByPlayerId);
        if (score < bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      const [opponent] = remaining.splice(bestIndex, 1);
      pairs.push([unit, opponent]);
    }
    return pairs;
  }

  function totalCost(pairs: [T, T][]): number {
    return pairs.reduce((sum, [a, b]) => sum + scorePotentialMatchup(a, b, opponents, ratingByPlayerId), 0);
  }

  let best = greedyPass(units);
  let bestCost = totalCost(best);
  for (let attempt = 0; attempt < PAIRING_TRIALS && bestCost > 0; attempt++) {
    const candidate = greedyPass(shuffled(units));
    const cost = totalCost(candidate);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best;
}

// 'random' and 'leaderboard-based' both pair units in a fixed order
// (shuffled, or rank-sorted) rather than searching for a repeat-minimal
// arrangement — by design, per the spec these styles trade optimality for
// simplicity/unpredictability. This single-pass safeguard swaps a matchup
// with its neighbour when it exactly repeats the immediately preceding
// round's matchup, so "still avoid obvious immediate repeat matchups" is
// honoured without turning either style into a full repeat-avoidance search
// (that's what 'balanced' is for).
function sameMatchup(unitAIds: string[], unitBIds: string[], match: Match): boolean {
  const a = new Set(unitAIds);
  const b = new Set(unitBIds);
  const matchA = new Set(match.teamA.playerIds);
  const matchB = new Set(match.teamB.playerIds);
  const setsEqual = (x: Set<string>, y: Set<string>) => x.size === y.size && [...x].every((v) => y.has(v));
  return (setsEqual(a, matchA) && setsEqual(b, matchB)) || (setsEqual(a, matchB) && setsEqual(b, matchA));
}

function avoidImmediatePriorRoundRepeat<T extends Pairable>(matchups: [T, T][], previousRound: Round | undefined): [T, T][] {
  if (!previousRound || previousRound.matches.length === 0) return matchups;
  const result = [...matchups];
  for (let i = 0; i < result.length; i++) {
    const [unitA, unitB] = result[i];
    const isRepeat = previousRound.matches.some((match) => sameMatchup(unitA.playerIds, unitB.playerIds, match));
    if (!isRepeat) continue;
    const next = result[i + 1];
    if (!next) continue;
    // Swap this matchup's second unit with the next matchup's second unit —
    // a small, local repair rather than a full re-pairing.
    result[i] = [unitA, next[1]];
    result[i + 1] = [next[0], unitB];
  }
  return result;
}

function lastRound(priorRounds: Round[]): Round | undefined {
  return priorRounds.length > 0 ? priorRounds[priorRounds.length - 1] : undefined;
}

// --- Leaderboard-based ranking --------------------------------------------
// Single source of truth for "current standing" — used both to render the
// Leaderboard (see components/Leaderboard.tsx) and, when Pairing Style is
// 'leaderboard-based', to decide who pairs with/against whom. Sort order
// matches the spec: wins, then total points, then point differential, then
// fewest byes, then rating.
export interface LeaderboardRow {
  player: Player;
  stats: PlayerStats;
  rank: number;
}

export function calculateLeaderboardStats(players: Player[], rounds: Round[]): LeaderboardRow[] {
  const statsByPlayer = new Map(computePlayerStats(players, rounds).map((s) => [s.playerId, s]));
  const sorted = players
    .map((player) => ({ player, stats: statsByPlayer.get(player.id)! }))
    .sort((a, b) => {
      if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
      if (b.stats.totalPoints !== a.stats.totalPoints) return b.stats.totalPoints - a.stats.totalPoints;
      if (b.stats.pointDifferential !== a.stats.pointDifferential) return b.stats.pointDifferential - a.stats.pointDifferential;
      if (a.stats.byes !== b.stats.byes) return a.stats.byes - b.stats.byes;
      const ratingA = a.player.rating ?? -Infinity;
      const ratingB = b.player.rating ?? -Infinity;
      return ratingB - ratingA;
    });
  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}

export interface TeamLeaderboardRow {
  team: Team;
  stats: TeamStats;
  rank: number;
}

// Same precedence as calculateLeaderboardStats, applied to fixed Teams
// (pointsFor stands in for "total points", pointDifference for point
// differential — see TeamStats).
export function calculateTeamLeaderboardStats(teams: Team[], rounds: Round[]): TeamLeaderboardRow[] {
  const statsByTeam = new Map(computeTeamStats(teams, rounds).map((s) => [s.teamId, s]));
  const sorted = teams
    .map((team) => ({ team, stats: statsByTeam.get(team.id)! }))
    .sort((a, b) => {
      if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
      if (b.stats.pointsFor !== a.stats.pointsFor) return b.stats.pointsFor - a.stats.pointsFor;
      if (b.stats.pointDifference !== a.stats.pointDifference) return b.stats.pointDifference - a.stats.pointDifference;
      if (a.stats.byes !== b.stats.byes) return a.stats.byes - b.stats.byes;
      const ratingA = a.team.rating ?? -Infinity;
      const ratingB = b.team.rating ?? -Infinity;
      return ratingB - ratingA;
    });
  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}

function rankMap(rows: { player: Player; rank: number }[]): Map<string, number> {
  return new Map(rows.map((row) => [row.player.id, row.rank]));
}

// --- Style dispatchers used by tournament.ts's createRound/createFixedTeamRound ---

// Singles pairing for the 'leaderboard-based'/'random' styles ('balanced'
// stays on tournament.ts's original pairByFewestMeetings — see createRound).
// `_opponents` isn't used directly here — 'leaderboard-based'/'random' only
// do the lightweight immediate-repeat check (avoidImmediatePriorRoundRepeat),
// not a full repeat-avoidance search (that's what 'balanced' is for, via
// pairByFewestMeetings) — kept as a parameter anyway so the call sites in
// createRound read the same regardless of style.
export function pairPlayerUnitsByStyle(
  playing: Player[],
  _opponents: MeetingCounts,
  style: PairingStyle,
  priorRounds: Round[],
): [Player, Player][] {
  if (style === 'leaderboard-based') {
    const ranks = rankMap(calculateLeaderboardStats(playing, priorRounds));
    const ranked = [...playing].sort((a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0));
    return avoidImmediatePriorRoundRepeat(pairAdjacent(ranked.map(toUnit)), lastRound(priorRounds)).map(
      ([a, b]) => [playerById(playing, a.id), playerById(playing, b.id)],
    );
  }
  // 'random'
  return avoidImmediatePriorRoundRepeat(pairAdjacent(shuffled(playing).map(toUnit)), lastRound(priorRounds)).map(
    ([a, b]) => [playerById(playing, a.id), playerById(playing, b.id)],
  );
}

function toUnit(player: Player): Pairable {
  return { id: player.id, playerIds: [player.id] };
}

function playerById(players: Player[], id: string): Player {
  return players.find((p) => p.id === id)!;
}

// Rotating Doubles pairing (no fixed teams involved) for the
// 'leaderboard-based'/'random' styles: form partners, then pair the
// resulting temporary teams against each other, both by the chosen style.
// Returns playerId pairs directly (rather than Player/Team objects) since
// that's all a Match needs.
export function pairTeamUnitsByStyle(
  playing: Player[],
  opponents: MeetingCounts,
  teammates: MeetingCounts,
  style: PairingStyle,
  priorRounds: Round[],
): [string[], string[]][] {
  const rankByPlayerId = style === 'leaderboard-based' ? rankMap(calculateLeaderboardStats(playing, priorRounds)) : undefined;
  const partnerPairs = formPartnersByStyle(playing, teammates, style, rankByPlayerId);
  const units: TeamInstance[] = partnerPairs.map(([a, b]) => ({
    id: `temp-${a.id}-${b.id}`,
    playerIds: [a.id, b.id],
    isFixedTeam: false,
    displayName: `${a.name} / ${b.name}`,
  }));
  const ratingByPlayerId = ratingMapFor(playing);
  const matchups = pairUnitsByStyle(units, style, opponents, lastRound(priorRounds), ratingByPlayerId, rankByPlayerId);
  return matchups.map(([a, b]) => [a.playerIds, b.playerIds]);
}

// Doubles + Fixed Teams pairing for the 'leaderboard-based'/'random'
// styles — 'balanced' stays on tournament.ts's original
// buildTeamMatchHistory-based pairByFewestMeetings (team-id history rather
// than player-id history — see createFixedTeamRound).
export function pairFixedTeamsByStyle(
  playingTeams: Team[],
  style: PairingStyle,
  priorRounds: Round[],
): [string[], string[]][] {
  const { opponents } = buildMatchHistory(priorRounds);
  const units: TeamInstance[] = playingTeams.map((team) => ({
    id: team.id,
    playerIds: team.playerIds,
    isFixedTeam: true,
    fixedTeamId: team.id,
    displayName: team.name,
  }));
  const ratingByPlayerId = new Map<string, number>();
  for (const team of playingTeams) {
    if (team.rating != null) for (const id of team.playerIds) ratingByPlayerId.set(id, team.rating);
  }
  const rankByTeamId =
    style === 'leaderboard-based'
      ? new Map(calculateTeamLeaderboardStats(playingTeams, priorRounds).map((row) => [row.team.id, row.rank]))
      : undefined;
  const matchups = pairUnitsByStyle(units, style, opponents, lastRound(priorRounds), ratingByPlayerId, undefined, rankByTeamId);
  return matchups.map(([a, b]) => [a.playerIds, b.playerIds]);
}

function ratingMapFor(players: Player[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of players) if (p.rating != null) map.set(p.id, p.rating);
  return map;
}

// --- Building blocks reused by generateMixedDoublesRound ------------------

// Groups loose individual players into 2-player temporary teams for one
// round, per the chosen Pairing Style:
// - balanced: favour partners who've been teamed the fewest times before
//   (identical logic to tournament.ts's rotating-Doubles partner step).
// - leaderboard-based: "snake" pairing (strongest current rank with
//   weakest) so each temporary team is roughly balanced in strength,
//   rather than pairing adjacent ranks directly as partners.
// - random: shuffle and pair sequentially.
export function buildTemporaryTeamsFromIndividuals(
  individuals: Player[],
  teammates: MeetingCounts,
  style: PairingStyle,
  rankByPlayerId?: Map<string, number>,
): TeamInstance[] {
  return formPartnersByStyle(individuals, teammates, style, rankByPlayerId).map(([a, b]) => ({
    id: `temp-${a.id}-${b.id}`,
    playerIds: [a.id, b.id],
    isFixedTeam: false,
    displayName: `${a.name} / ${b.name}`,
  }));
}

export function formPartnersByStyle(
  individuals: Player[],
  teammates: MeetingCounts,
  style: PairingStyle,
  rankByPlayerId?: Map<string, number>,
): [Player, Player][] {
  if (style === 'leaderboard-based') {
    const ranked = [...individuals].sort((a, b) => (rankByPlayerId?.get(a.id) ?? 0) - (rankByPlayerId?.get(b.id) ?? 0));
    const pairs: [Player, Player][] = [];
    let lo = 0;
    let hi = ranked.length - 1;
    while (lo < hi) {
      pairs.push([ranked[lo], ranked[hi]]);
      lo += 1;
      hi -= 1;
    }
    return pairs;
  }
  if (style === 'random') {
    return pairAdjacent(shuffled(individuals));
  }
  return pairByFewestMeetings(individuals, teammates);
}

// A fixed Team is already a complete doubles unit; wrap it in the same
// TeamInstance shape as a temporary team so both can be pained against each
// other identically (see pairUnitsByStyle) — the mixed-doubles engine's
// core idea: from the pairing step's point of view, a fixed team and a
// temporary team are interchangeable.
export function mergeFixedTeamsAndTemporaryTeams(fixedTeams: Team[], temporaryTeams: TeamInstance[]): TeamInstance[] {
  const fixedUnits: TeamInstance[] = fixedTeams.map((team) => ({
    id: team.id,
    playerIds: team.playerIds,
    isFixedTeam: true,
    fixedTeamId: team.id,
    displayName: team.name,
  }));
  return [...fixedUnits, ...temporaryTeams];
}

// Pairs already-formed doubles units (fixed teams and/or temporary teams)
// against each other for the round, per Pairing Style.
export function pairUnitsByStyle(
  units: TeamInstance[],
  style: PairingStyle,
  opponents: MeetingCounts,
  previousRound: Round | undefined,
  ratingByPlayerId?: Map<string, number>,
  rankByPlayerId?: Map<string, number>,
  rankByUnitId?: Map<string, number>,
): [TeamInstance, TeamInstance][] {
  if (style === 'leaderboard-based') {
    const rankOf = (unit: TeamInstance): number => {
      if (rankByUnitId?.has(unit.id)) return rankByUnitId.get(unit.id)!;
      if (rankByPlayerId) {
        const ranks = unit.playerIds.map((id) => rankByPlayerId.get(id) ?? 0);
        return ranks.reduce((sum, r) => sum + r, 0) / Math.max(1, ranks.length);
      }
      return 0;
    };
    const ranked = [...units].sort((a, b) => rankOf(a) - rankOf(b));
    return avoidImmediatePriorRoundRepeat(pairAdjacent(ranked), previousRound);
  }
  if (style === 'random') {
    return avoidImmediatePriorRoundRepeat(pairAdjacent(shuffled(units)), previousRound);
  }
  return pairUnitsByFewestMeetings(units, opponents, ratingByPlayerId);
}

// --- Bye selection across a mixed fixed-team / individual-player pool -----
// Fixed teams sit out as a whole pair whenever possible (favouring fewest
// byes so far, same fairness rule as everywhere else in the app); an
// individual player fills a single leftover slot. A fixed team is only
// temporarily split (one player sits, the other keeps playing solo — see
// Round.splitTeamIds) as a last resort, when a single slot is left and no
// individual player is available to take it — see the loop below.
export function selectByeParticipants(
  players: Player[],
  teams: Team[],
  teamPlayers: Player[],
  byeSlotsNeeded: number,
  playerByeCounts: Map<string, number>,
  teamByeCounts: Map<string, number>,
): {
  byeTeamIds: string[];
  splitTeamIds: string[];
  byePlayerIds: string[];
  playingTeams: Team[];
  playingIndividuals: Player[];
} {
  if (byeSlotsNeeded <= 0) {
    return { byeTeamIds: [], splitTeamIds: [], byePlayerIds: [], playingTeams: teams, playingIndividuals: players };
  }

  type Candidate =
    | { kind: 'team'; team: Team; index: number; byes: number }
    | { kind: 'player'; player: Player; index: number; byes: number };

  const candidates: Candidate[] = [
    ...teams.map((team, index): Candidate => ({ kind: 'team', team, index, byes: teamByeCounts.get(team.id) ?? 0 })),
    ...players.map((player, index): Candidate => ({ kind: 'player', player, index, byes: playerByeCounts.get(player.id) ?? 0 })),
  ].sort((a, b) => a.byes - b.byes || a.index - b.index);

  let remaining = byeSlotsNeeded;
  const byeTeamIds: string[] = [];
  const byePlayerIds: string[] = [];
  const sittingTeamIds = new Set<string>();
  const sittingPlayerIds = new Set<string>();

  for (const candidate of candidates) {
    if (remaining <= 0) break;
    if (candidate.kind === 'player') {
      byePlayerIds.push(candidate.player.id);
      sittingPlayerIds.add(candidate.player.id);
      remaining -= 1;
    } else if (remaining >= 2) {
      byeTeamIds.push(candidate.team.id);
      sittingTeamIds.add(candidate.team.id);
      byePlayerIds.push(...candidate.team.playerIds);
      remaining -= 2;
    }
    // A team candidate with only 1 slot remaining doesn't fit — it's left
    // for the next candidate (which may be an individual player able to
    // take that single slot) rather than splitting immediately.
  }

  const splitTeamIds: string[] = [];
  if (remaining === 1) {
    const splitCandidate = candidates.find((c): c is Candidate & { kind: 'team' } => c.kind === 'team' && !sittingTeamIds.has(c.team.id));
    if (splitCandidate) {
      splitTeamIds.push(splitCandidate.team.id);
      sittingTeamIds.add(splitCandidate.team.id);
      byePlayerIds.push(splitCandidate.team.playerIds[0]);
      remaining -= 1;
    }
  }

  const teamPlayerById = new Map(teamPlayers.map((p) => [p.id, p]));
  const splitOverflowPlayers = splitTeamIds
    .map((teamId) => teams.find((t) => t.id === teamId)!.playerIds[1])
    .map((id) => teamPlayerById.get(id))
    .filter((p): p is Player => p != null);

  return {
    byeTeamIds,
    splitTeamIds,
    byePlayerIds,
    playingTeams: teams.filter((t) => !sittingTeamIds.has(t.id)),
    playingIndividuals: [...players.filter((p) => !sittingPlayerIds.has(p.id)), ...splitOverflowPlayers],
  };
}

// --- Mixed Doubles round generation ---------------------------------------
// Used whenever the Doubles roster has both fixed Teams and individual
// Players at the same time (see ParticipantSetup/App.tsx). Fixed teams stay
// together; individual players are grouped into temporary teams fresh each
// round (see buildTemporaryTeamsFromIndividuals) — the two kinds are then
// merged (mergeFixedTeamsAndTemporaryTeams) and paired against each other
// exactly like any other doubles unit (pairUnitsByStyle). Bye fairness is
// shared across both kinds — see selectByeParticipants.
export function generateMixedDoublesRound(
  players: Player[],
  teams: Team[],
  teamPlayers: Player[],
  settings: TournamentSettings,
  roundNumber: number,
  priorRounds: Round[] = [],
  status: RoundStatus = 'current',
  pairingStyle: PairingStyle = 'balanced',
): Round {
  const allIndividuals = [...players, ...teamPlayers];
  const totalSlots = teams.length * 2 + players.length;
  const usableCourts = Math.min(settings.courts, Math.floor(totalSlots / 4));
  const playingSlots = usableCourts * 4;
  const byeSlotsNeeded = totalSlots - playingSlots;

  const playerByeCounts = new Map(computePlayerStats(allIndividuals, priorRounds).map((s) => [s.playerId, s.byes]));
  const teamByeCounts = new Map(computeTeamStats(teams, priorRounds).map((s) => [s.teamId, s.byes]));

  const { byeTeamIds, splitTeamIds, byePlayerIds, playingTeams, playingIndividuals } = selectByeParticipants(
    players,
    teams,
    teamPlayers,
    byeSlotsNeeded,
    playerByeCounts,
    teamByeCounts,
  );

  const { opponents, teammates } = buildMatchHistory(priorRounds);

  const rankByPlayerId =
    pairingStyle === 'leaderboard-based' ? rankMap(calculateLeaderboardStats(allIndividuals, priorRounds)) : undefined;

  const tempTeams = buildTemporaryTeamsFromIndividuals(playingIndividuals, teammates, pairingStyle, rankByPlayerId);
  const allUnits = mergeFixedTeamsAndTemporaryTeams(playingTeams, tempTeams);

  const ratingByPlayerId = ratingMapFor(allIndividuals);
  for (const team of teams) {
    if (team.rating == null) continue;
    for (const id of team.playerIds) if (!ratingByPlayerId.has(id)) ratingByPlayerId.set(id, team.rating);
  }

  const rankByUnitId =
    pairingStyle === 'leaderboard-based' && rankByPlayerId
      ? new Map(
          allUnits.map((unit) => {
            const ranks = unit.playerIds.map((id) => rankByPlayerId.get(id) ?? 0);
            return [unit.id, ranks.reduce((sum, r) => sum + r, 0) / Math.max(1, ranks.length)] as const;
          }),
        )
      : undefined;

  const matchups = pairUnitsByStyle(
    allUnits,
    pairingStyle,
    opponents,
    lastRound(priorRounds),
    ratingByPlayerId,
    rankByPlayerId,
    rankByUnitId,
  );

  const matches: Match[] = matchups.map(([unitA, unitB], index) => ({
    id: makeId('match'),
    court: index + 1,
    teamA: { playerIds: unitA.playerIds },
    teamB: { playerIds: unitB.playerIds },
  }));

  return {
    id: makeId('round'),
    roundNumber,
    matches,
    byePlayerIds,
    byeTeamIds,
    splitTeamIds,
    status,
  };
}

// Top-level dispatcher — the single entry point useTournament.ts's
// generateRound calls into for every Leaderboard/Social Play round,
// regardless of match type or roster shape. See generateSinglesMatches /
// generateDoublesMatches below for the two branches; mixed doubles is
// handled by generateMixedDoublesRound above.
export function generateLeaderboardRound(
  players: Player[],
  teams: Team[],
  teamPlayers: Player[],
  settings: TournamentSettings,
  roundNumber: number,
  priorRounds: Round[] = [],
  status: RoundStatus = 'current',
  pairingStyle: PairingStyle = 'balanced',
): Round {
  if (settings.matchType === 'singles') {
    return generateSinglesMatches(players, settings, roundNumber, priorRounds, status, pairingStyle);
  }
  return generateDoublesMatches(players, teams, teamPlayers, settings, roundNumber, priorRounds, status, pairingStyle);
}

// Re-exported from tournament.ts under the spec's suggested names, so
// callers (and this module's own generateLeaderboardRound) don't need to
// know createRound/createFixedTeamRound live there for historical reasons.
export function generateSinglesMatches(
  players: Player[],
  settings: TournamentSettings,
  roundNumber: number,
  priorRounds: Round[],
  status: RoundStatus,
  pairingStyle: PairingStyle,
): Round {
  return createRound(players, settings, roundNumber, priorRounds, status, pairingStyle);
}

export function generateDoublesMatches(
  players: Player[],
  teams: Team[],
  teamPlayers: Player[],
  settings: TournamentSettings,
  roundNumber: number,
  priorRounds: Round[],
  status: RoundStatus,
  pairingStyle: PairingStyle,
): Round {
  if (teams.length > 0 && players.length > 0) {
    return generateMixedDoublesRound(players, teams, teamPlayers, settings, roundNumber, priorRounds, status, pairingStyle);
  }
  if (teams.length > 0) {
    return createFixedTeamRound(teams, settings, roundNumber, priorRounds, status, pairingStyle);
  }
  return createRound(players, settings, roundNumber, priorRounds, status, pairingStyle);
}
