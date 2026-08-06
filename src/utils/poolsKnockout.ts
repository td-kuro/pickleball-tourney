// Pure logic for the "Pools & Knockout" tournament format: forming teams,
// assigning pools, generating round-robin pool matches, ranking pool
// standings, seeding the knockout bracket, and progressing it match by
// match. No React or localStorage here — see src/hooks/usePoolsKnockout.ts
// for the stateful wrapper, mirroring how src/utils/tournament.ts relates
// to src/hooks/useTournament.ts.

import type {
  KnockoutBracket,
  KnockoutMatch,
  KnockoutRound,
  MatchType,
  Player,
  Pool,
  PoolKnockoutSettings,
  PoolMatch,
  PoolStanding,
  Team,
  TournamentSettings,
} from '../types';

export const DEFAULT_POOL_KNOCKOUT_SETTINGS: PoolKnockoutSettings = {
  numberOfPools: 2,
  teamsPerPool: 4,
  timesEachTeamPlays: 1,
  teamsAdvancingPerPool: 2,
};

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// 1 player per team in Singles, 2 in Doubles. Distinct from
// utils/tournament.ts's playersNeededPerMatch, which counts players needed
// to fill one *match* (both sides), not one team.
export function playersPerTeam(matchType: MatchType): number {
  return matchType === 'singles' ? 1 : 2;
}

export function teamsNeededFor(settings: PoolKnockoutSettings): number {
  return settings.numberOfPools * settings.teamsPerPool;
}

// Pools & Knockout needs an exact, fixed roster up front (teams are
// persistent for the whole tournament, unlike Leaderboard/Social's
// per-round rotation) — so unlike the rest of the app, this requires
// exactly enough players, not "at least". Keeping it exact avoids having
// to decide which extra players silently sit out.
export function validatePoolsKnockoutSetup(
  players: Player[],
  settings: TournamentSettings,
): { ok: true } | { ok: false; reason: string } {
  const pk = settings.poolKnockoutSettings;

  if (pk.numberOfPools < 1) return { ok: false, reason: 'Number of pools must be at least 1.' };
  if (pk.teamsPerPool < 2) return { ok: false, reason: 'Teams per pool must be at least 2.' };
  if (pk.timesEachTeamPlays < 1) {
    return { ok: false, reason: 'Times each team plays each other must be at least 1.' };
  }
  if (pk.teamsAdvancingPerPool < 1) {
    return { ok: false, reason: 'Teams advancing per pool must be at least 1.' };
  }
  if (pk.teamsAdvancingPerPool > pk.teamsPerPool) {
    return { ok: false, reason: 'Teams advancing per pool cannot be more than teams per pool.' };
  }
  if (pk.numberOfPools * pk.teamsAdvancingPerPool < 2) {
    return { ok: false, reason: 'At least 2 teams total must advance to the knockout bracket.' };
  }
  if (players.some((player) => player.name.trim() === '')) {
    return { ok: false, reason: 'Every player needs a name before starting matches.' };
  }

  const teamsNeeded = teamsNeededFor(pk);
  const perTeam = playersPerTeam(settings.matchType);
  const playersNeeded = teamsNeeded * perTeam;

  if (players.length !== playersNeeded) {
    return {
      ok: false,
      reason:
        `Pools & Knockout needs exactly ${playersNeeded} player${playersNeeded === 1 ? '' : 's'} ` +
        `(${teamsNeeded} team${teamsNeeded === 1 ? '' : 's'} of ${perTeam}) for ${pk.numberOfPools} ` +
        `pool${pk.numberOfPools === 1 ? '' : 's'} × ${pk.teamsPerPool} teams. You have ${players.length}.`,
    };
  }

  return { ok: true };
}

function averageRating(a?: number, b?: number): number | undefined {
  if (a == null && b == null) return undefined;
  if (a == null) return b;
  if (b == null) return a;
  return (a + b) / 2;
}

// Singles: one team per player. Doubles: teams are fixed pairs, formed by
// taking players two at a time in list order — simple and predictable,
// though it means player order matters (there's no separate "assign
// partners" step in this first version).
export function formTeams(players: Player[], matchType: MatchType): Team[] {
  if (matchType === 'singles') {
    return players.map((player) => ({
      id: `team-${player.id}`,
      name: player.name,
      playerIds: [player.id],
      rating: player.rating,
    }));
  }

  const teams: Team[] = [];
  for (let i = 0; i < players.length; i += 2) {
    const a = players[i];
    const b = players[i + 1];
    teams.push({
      id: makeId('team'),
      name: `${a.name} & ${b.name}`,
      playerIds: [a.id, b.id],
      rating: averageRating(a.rating, b.rating),
    });
  }
  return teams;
}

// Simple, predictable pool assignment: teams are split into consecutive
// chunks (Pool A gets the first `teamsPerPool`, Pool B the next, etc.)
// rather than interleaved — no manual assignment yet (see README).
export function assignPools(teams: Team[], numberOfPools: number, teamsPerPool: number): Pool[] {
  const pools: Pool[] = [];
  for (let i = 0; i < numberOfPools; i++) {
    const poolTeams = teams.slice(i * teamsPerPool, (i + 1) * teamsPerPool);
    pools.push({
      id: makeId('pool'),
      name: `Pool ${String.fromCharCode(65 + i)}`,
      teamIds: poolTeams.map((team) => team.id),
      matches: [],
    });
  }
  return pools;
}

// Every team in the pool plays every other team once, repeated
// `timesEachTeamPlays` times. Court numbers just cycle 1..courts across the
// pool's own match list for display purposes — pool matches aren't
// scheduled into synchronised "rounds" across courts the way Leaderboard/
// Social rounds are (see README's "Current limitations").
export function generatePoolMatches(teamIds: string[], timesEachTeamPlays: number, courts: number): PoolMatch[] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      pairs.push([teamIds[i], teamIds[j]]);
    }
  }

  const matches: PoolMatch[] = [];
  for (let rep = 0; rep < timesEachTeamPlays; rep++) {
    for (const [teamAId, teamBId] of pairs) {
      matches.push({
        id: makeId('poolmatch'),
        court: (matches.length % courts) + 1,
        teamAId,
        teamBId,
      });
    }
  }
  return matches;
}

export function isPoolComplete(pool: Pool): boolean {
  return pool.matches.length > 0 && pool.matches.every((match) => match.scoreA != null && match.scoreB != null);
}

export function allPoolsComplete(pools: Pool[]): boolean {
  return pools.length > 0 && pools.every(isPoolComplete);
}

interface TeamAggregate {
  teamId: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

function bumpHeadToHead(counts: Map<string, Map<string, number>>, winnerId: string, loserId: string) {
  const inner = counts.get(winnerId);
  if (!inner) return;
  inner.set(loserId, (inner.get(loserId) ?? 0) + 1);
}

// Pool ranking, applied in order: most wins; then highest point difference
// (PF - PA); then head-to-head record between the two teams being compared
// (this is a pairwise check, so it's simple and reliable for a 2-way tie —
// a 3-way cyclic tie, e.g. A beat B beat C beat A, isn't specially
// resolved and falls through to the next rule, which is an accepted
// simplification for a first version); then highest Points For; and
// finally each team's original position in the pool, which Array.sort's
// stability preserves for free by returning 0.
function compareStandings(
  a: TeamAggregate,
  b: TeamAggregate,
  headToHead: Map<string, Map<string, number>>,
): number {
  if (b.wins !== a.wins) return b.wins - a.wins;

  const aDiff = a.pointsFor - a.pointsAgainst;
  const bDiff = b.pointsFor - b.pointsAgainst;
  if (bDiff !== aDiff) return bDiff - aDiff;

  const aBeatB = headToHead.get(a.teamId)?.get(b.teamId) ?? 0;
  const bBeatA = headToHead.get(b.teamId)?.get(a.teamId) ?? 0;
  if (aBeatB !== bBeatA) return bBeatA - aBeatB;

  if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;

  return 0;
}

export function computePoolStandings(pool: Pool, teamsAdvancingPerPool: number): PoolStanding[] {
  const aggregates = new Map<string, TeamAggregate>(
    pool.teamIds.map((id) => [id, { teamId: id, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }]),
  );
  const headToHead = new Map<string, Map<string, number>>(pool.teamIds.map((id) => [id, new Map()]));

  for (const match of pool.matches) {
    if (match.scoreA == null || match.scoreB == null || match.scoreA === match.scoreB) continue;
    const a = aggregates.get(match.teamAId);
    const b = aggregates.get(match.teamBId);
    if (!a || !b) continue;

    a.pointsFor += match.scoreA;
    a.pointsAgainst += match.scoreB;
    b.pointsFor += match.scoreB;
    b.pointsAgainst += match.scoreA;

    if (match.scoreA > match.scoreB) {
      a.wins += 1;
      b.losses += 1;
      bumpHeadToHead(headToHead, match.teamAId, match.teamBId);
    } else {
      b.wins += 1;
      a.losses += 1;
      bumpHeadToHead(headToHead, match.teamBId, match.teamAId);
    }
  }

  const ranked = pool.teamIds.map((id) => aggregates.get(id)!).sort((x, y) => compareStandings(x, y, headToHead));

  return ranked.map((agg, index) => ({
    teamId: agg.teamId,
    wins: agg.wins,
    losses: agg.losses,
    pointsFor: agg.pointsFor,
    pointsAgainst: agg.pointsAgainst,
    pointDifference: agg.pointsFor - agg.pointsAgainst,
    rank: index + 1,
    qualifiesForKnockout: index < teamsAdvancingPerPool,
  }));
}

interface SeededTeam {
  teamId: string;
  poolRank: number;
  wins: number;
  pointDifference: number;
  pointsFor: number;
}

// Ranks every qualifying team across all pools: first by how they placed
// within their own pool (every 1st-place finisher outranks every 2nd-place
// finisher, and so on), then — within the same pool rank — by the same
// wins / point-difference / Points For order used for pool standings.
function seedQualifiedTeams(pools: Pool[], teamsAdvancingPerPool: number): SeededTeam[] {
  const seeded: SeededTeam[] = [];
  for (const pool of pools) {
    for (const standing of computePoolStandings(pool, teamsAdvancingPerPool)) {
      if (!standing.qualifiesForKnockout) continue;
      seeded.push({
        teamId: standing.teamId,
        poolRank: standing.rank,
        wins: standing.wins,
        pointDifference: standing.pointDifference,
        pointsFor: standing.pointsFor,
      });
    }
  }

  seeded.sort((a, b) => {
    if (a.poolRank !== b.poolRank) return a.poolRank - b.poolRank;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointDifference !== a.pointDifference) return b.pointDifference - a.pointDifference;
    return b.pointsFor - a.pointsFor;
  });
  return seeded;
}

export function knockoutRoundName(teamsInRound: number): string {
  switch (teamsInRound) {
    case 2:
      return 'Final';
    case 4:
      return 'Semifinals';
    case 8:
      return 'Quarterfinals';
    default:
      return `Round of ${teamsInRound}`;
  }
}

function nextPowerOfTwo(n: number): number {
  let value = 1;
  while (value < n) value *= 2;
  return value;
}

// Forwards a completed match's winner into its pre-wired slot in the next
// round (if any). Used both for real, scored matches and for byes, which
// are resolved the same way at bracket-build time.
function forwardWinner(bracket: KnockoutBracket, completed: KnockoutMatch): KnockoutBracket {
  if (!completed.winnerId || !completed.nextMatchId) return bracket;
  const rounds = bracket.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => {
      if (match.id !== completed.nextMatchId) return match;
      const updated = { ...match };
      if (completed.nextMatchSlot === 'A') updated.teamAId = completed.winnerId;
      else updated.teamBId = completed.winnerId;
      if (updated.teamAId && updated.teamBId) updated.status = 'ready';
      return updated;
    }),
  }));
  return { ...bracket, rounds };
}

// Forwards a completed semifinal's loser into the 3rd Place Match.
function forwardLoserToThirdPlace(bracket: KnockoutBracket, completed: KnockoutMatch): KnockoutBracket {
  if (!completed.loserId || !completed.loserNextMatchId || !bracket.thirdPlaceMatch) return bracket;
  if (bracket.thirdPlaceMatch.id !== completed.loserNextMatchId) return bracket;
  const updated = { ...bracket.thirdPlaceMatch };
  if (completed.loserNextMatchSlot === 'A') updated.teamAId = completed.loserId;
  else updated.teamBId = completed.loserId;
  if (updated.teamAId && updated.teamBId) updated.status = 'ready';
  return { ...bracket, thirdPlaceMatch: updated };
}

// Builds the full bracket in one pass once the pool stage is done: seeds
// every qualified team, pads to the next power of two with byes (given to
// the top seeds, so the strongest teams get the automatic pass), wires
// every round's matches to forward their winner into the next round, and
// wires the semifinals to forward their loser into a 3rd Place Match.
export function buildKnockoutBracket(pools: Pool[], teamsAdvancingPerPool: number): KnockoutBracket {
  const seeded = seedQualifiedTeams(pools, teamsAdvancingPerPool);
  const bracketSize = nextPowerOfTwo(seeded.length);
  // Real teams fill the best seeds (index 0 = strongest); the rest are
  // byes. Pairing seed i against seed (bracketSize - 1 - i) below means a
  // bye at the bottom of the list always lands opposite a real top seed.
  const slots: (string | null)[] = Array.from({ length: bracketSize }, (_, i) => seeded[i]?.teamId ?? null);

  const firstRoundMatches: KnockoutMatch[] = [];
  for (let i = 0; i < slots.length / 2; i++) {
    const teamAId = slots[i] ?? undefined;
    const teamBId = slots[slots.length - 1 - i] ?? undefined;
    const isBye = teamAId == null || teamBId == null;
    firstRoundMatches.push({
      id: makeId('ko'),
      roundName: knockoutRoundName(slots.length),
      teamAId,
      teamBId,
      winnerId: isBye ? (teamAId ?? teamBId) : undefined,
      status: isBye ? 'bye' : 'ready',
    });
  }

  const rounds: KnockoutRound[] = [{ name: knockoutRoundName(slots.length), matches: firstRoundMatches }];

  let previousRoundMatches = firstRoundMatches;
  let teamsRemaining = slots.length / 2;
  while (teamsRemaining >= 2) {
    const nextMatches: KnockoutMatch[] = Array.from({ length: teamsRemaining / 2 }, () => ({
      id: makeId('ko'),
      roundName: knockoutRoundName(teamsRemaining),
      status: 'pending' as const,
    }));
    previousRoundMatches.forEach((match, index) => {
      const nextMatch = nextMatches[Math.floor(index / 2)];
      match.nextMatchId = nextMatch.id;
      match.nextMatchSlot = index % 2 === 0 ? 'A' : 'B';
    });
    rounds.push({ name: knockoutRoundName(teamsRemaining), matches: nextMatches });
    previousRoundMatches = nextMatches;
    teamsRemaining = teamsRemaining / 2;
  }

  // A 3rd Place Match only makes sense once there's a real Semifinals
  // round — and only if neither semifinal is a bye, since a bye means that
  // team never had a "loser" opponent to send to it.
  const semifinalRound = rounds.length >= 2 ? rounds[rounds.length - 2] : undefined;
  let thirdPlaceMatch: KnockoutMatch | undefined;
  if (semifinalRound && semifinalRound.matches.every((match) => match.status !== 'bye')) {
    thirdPlaceMatch = {
      id: makeId('ko'),
      roundName: '3rd Place Match',
      status: 'pending',
      isThirdPlaceMatch: true,
    };
    semifinalRound.matches.forEach((match, index) => {
      match.loserNextMatchId = thirdPlaceMatch!.id;
      match.loserNextMatchSlot = index % 2 === 0 ? 'A' : 'B';
    });
  }

  let bracket: KnockoutBracket = { rounds, thirdPlaceMatch };
  for (const match of firstRoundMatches) {
    if (match.status === 'bye') bracket = forwardWinner(bracket, match);
  }
  return bracket;
}

function findKnockoutMatch(bracket: KnockoutBracket, matchId: string): KnockoutMatch | undefined {
  if (bracket.thirdPlaceMatch?.id === matchId) return bracket.thirdPlaceMatch;
  return bracket.rounds.flatMap((round) => round.matches).find((match) => match.id === matchId);
}

// Records a knockout score, determines the winner (ties aren't allowed —
// see the score form's validation), forwards the winner (and, for
// semifinals, the loser) to their next match, and — if this was the Final
// or the 3rd Place Match — records the final placements.
export function recordKnockoutScore(
  bracket: KnockoutBracket,
  matchId: string,
  scoreA: number,
  scoreB: number,
): KnockoutBracket {
  const target = findKnockoutMatch(bracket, matchId);
  if (!target || target.teamAId == null || target.teamBId == null || scoreA === scoreB) return bracket;

  const winnerId = scoreA > scoreB ? target.teamAId : target.teamBId;
  const loserId = scoreA > scoreB ? target.teamBId : target.teamAId;
  const completed: KnockoutMatch = { ...target, scoreA, scoreB, winnerId, loserId, status: 'completed' };
  const isThirdPlace = bracket.thirdPlaceMatch?.id === matchId;

  let next: KnockoutBracket = isThirdPlace
    ? { ...bracket, thirdPlaceMatch: completed }
    : {
        ...bracket,
        rounds: bracket.rounds.map((round) => ({
          ...round,
          matches: round.matches.map((match) => (match.id === matchId ? completed : match)),
        })),
      };

  if (!isThirdPlace) {
    next = forwardWinner(next, completed);
    next = forwardLoserToThirdPlace(next, completed);
  }

  const isFinal = !isThirdPlace && next.rounds[next.rounds.length - 1].matches.some((match) => match.id === matchId);
  if (isFinal) next = { ...next, champion: winnerId, runnerUp: loserId };
  if (isThirdPlace) next = { ...next, thirdPlace: winnerId, fourthPlace: loserId };

  return next;
}

export function isKnockoutComplete(bracket: KnockoutBracket): boolean {
  const finalRound = bracket.rounds[bracket.rounds.length - 1];
  const finalDone = finalRound.matches.every((match) => match.status === 'completed' || match.status === 'bye');
  const thirdPlaceDone = !bracket.thirdPlaceMatch || bracket.thirdPlaceMatch.status === 'completed';
  return finalDone && thirdPlaceDone;
}
