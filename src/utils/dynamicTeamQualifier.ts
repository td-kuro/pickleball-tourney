// Pure logic for Dynamic Team Qualifier — a Tournament Mode format (see
// TournamentFormat in ../types) where fixed-partner doubles Teams (never
// individual players) play a dynamic, results-based qualifying stage with a
// fair rest rotation, then the top 4 teams face off in a Semis/Gold/Bronze
// medal bracket. Deliberately self-contained: nothing here is imported by
// (or imports from) utils/tournament.ts, utils/pairing.ts,
// utils/poolsKnockout.ts, utils/kingCourt.ts, or utils/dynamicPairingSocial.ts,
// so this format can't affect any other mode.
//
// Three systems are kept intentionally independent, the same design brief
// as Dynamic Pairing Social:
// - Standings (calculateProvisionalStandings / calculateFinalStandings)
//   decide how competitive/successful a team has been — never who rests.
// - Rest selection (generateRestSchedule) is a pure fairness rotation,
//   generated once up front for the whole qualifying stage — it never looks
//   at team strength or standings.
// - Pairing (generateQualifyingPairings) and court allocation
//   (orderPairsByCourtStrength) only run on whoever is left *after* rest has
//   already been decided.

import type {
  DynamicTeam,
  DynamicTeamQualifierSettings,
  MedalBracket,
  MedalBracketMatch,
  MedalBracketMatchLabel,
  QualifyingMatch,
  QualifyingRound,
  QualifyingRoundStatus,
  RestAssignment,
  TeamStanding,
} from '../types';

export const DEFAULT_DYNAMIC_TEAM_QUALIFIER_SETTINGS: DynamicTeamQualifierSettings = {
  divisionName: '',
  numberOfCourts: 6,
  numberOfTeams: 18,
  qualifyingRounds: 9,
  qualifyingGameDurationMinutes: 8,
  resultBufferMinutes: 2,
  gamesPerTeam: 6,
  restsPerTeam: 3,
  bracketSize: 4,
  bracketGameTarget: 11,
  bracketWinBy: 2,
  bracketCap: 15,
  randomSeed: makeRandomSeed(),
};

// A fresh, genuinely random seed — used once at Setup time and again each
// time the organiser clicks "Regenerate Rest Schedule" (see
// useDynamicTeamQualifier). Every *use* of this seed elsewhere
// (generateRestSchedule, generateQualifyingPairings, ...) is deterministic —
// only the initial roll is real randomness, so the same seed always
// reproduces the same schedule (useful for support/debugging), but hitting
// "Regenerate" actually tries something different.
export function makeRandomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

type SeededRandom = () => number;

// A small, fast, deterministic PRNG (mulberry32) — not cryptographic, just
// reproducible: the same seed always produces the same sequence of values in
// [0, 1). This is what makes the rest schedule and Round 1/2 pairings
// "transparent" per the design brief — regenerating with the same seed
// always regenerates the exact same result.
function makeSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], rng: SeededRandom): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Deterministic (not Math.random()) last-resort tiebreaker — order must stay
// stable across re-renders for genuinely tied teams, or standings tables
// would visibly shuffle themselves on every re-render. Antisymmetric by
// construction: swapping the two ids negates the result. Mirrors
// utils/dynamicPairingSocial.ts's stableRandomTiebreak, duplicated (not
// imported) to keep this file fully independent — see the file-level
// comment above.
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}

function stableTiebreak(aId: string, bId: string): number {
  return hashString(`${aId}|${bId}`) - hashString(`${bId}|${aId}`);
}

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `dtq-${prefix}-${Date.now()}-${idCounter}-${Math.floor(Math.random() * 10000)}`;
}

// --- Teams -----------------------------------------------------------------

// "T01", "T02", ... in registration order — purely cosmetic display codes;
// `DynamicTeam.id` is the stable identity used by every reference. Called
// with the roster size *after* the new team would be added, so
// `generateTeamCodes(teams.length + 1).at(-1)` is the next team's code.
export function generateTeamCodes(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);
}

export function validateCheckedInTeams(
  teams: DynamicTeam[],
  numberOfCourts: number,
): { ok: true } | { ok: false; reason: string } {
  if (numberOfCourts < 1) return { ok: false, reason: 'Number of courts must be at least 1.' };

  const active = teams.filter((t) => t.checkedIn && !t.withdrawn);
  if (active.length < 4) {
    return {
      ok: false,
      reason: `At least 4 checked-in teams are required to start (2 teams per court, minimum 1 court). ${active.length} checked in so far.`,
    };
  }
  if (active.some((t) => t.playerAName.trim() === '' || t.playerBName.trim() === '')) {
    return { ok: false, reason: 'Every checked-in team needs both player names before starting.' };
  }
  return { ok: true };
}

// Every team that has appeared in at least one *completed* qualifying
// match — used to lock partner changes (see DynamicTeam.partnerLocked and
// README's "Partner changes").
export function getPlayedTeamIds(rounds: QualifyingRound[]): Set<string> {
  const ids = new Set<string>();
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.status !== 'completed') continue;
      ids.add(match.teamAId);
      ids.add(match.teamBId);
    }
  }
  return ids;
}

// --- Court / rest capacity ---------------------------------------------

// Each "team" is already a doubles pair, so a court seats 2 teams (not 4
// players) — the team-level equivalent of
// utils/dynamicPairingSocial.ts's calculateCourtsUsed. Handles uneven team
// counts the same way: whatever doesn't fit on a court rests, no need for
// exact multiples.
export function calculateQualifyingCapacity(
  teamCount: number,
  numberOfCourts: number,
): { courtsUsed: number; activeTeamCount: number; restingTeamCount: number } {
  const courtsUsed = Math.min(Math.max(0, numberOfCourts), Math.floor(Math.max(0, teamCount) / 2));
  const activeTeamCount = courtsUsed * 2;
  const restingTeamCount = Math.max(0, teamCount - activeTeamCount);
  return { courtsUsed, activeTeamCount, restingTeamCount };
}

// --- Rest schedule -------------------------------------------------------
// Generated once, for every qualifying round, before Round 1 starts — see
// README's "Rest schedule" section. Team strength never factors in here;
// only how many times each team has rested so far and whether it rested
// last round (mirrors selectRestingPlayers in utils/dynamicPairingSocial.ts).

// Splits the total number of rest slots across the roster as evenly as
// possible (every team gets `floor` or `ceil` rests, never more than 1
// apart) — this is what generalises past the clean 18-team/3-rest default
// to any checked-in team count (e.g. 15-17 teams) without a special case.
// Which specific teams get the "+1" is decided by a seeded shuffle, not
// team order, so it's transparent and unbiased.
function buildRestQuota(teamIds: string[], totalRestSlots: number, rng: SeededRandom): Map<string, number> {
  const base = Math.floor(totalRestSlots / teamIds.length);
  const remainder = totalRestSlots % teamIds.length;
  const shuffled = seededShuffle(teamIds, rng);
  const quota = new Map<string, number>();
  shuffled.forEach((id, index) => quota.set(id, base + (index < remainder ? 1 : 0)));
  return quota;
}

// One pass at filling every round's rest slots, round by round. Priority
// each round (highest first):
// 1. "Forced" teams — their remaining rest quota equals the number of
//    rounds left (including this one), so they must rest *now* or they'll
//    miss their quota entirely (classic "least slack first" scheduling).
// 2. Most rests still owed (equivalently: fewest rests so far).
// 3. Seeded-random tiebreak.
// Teams that already hit their quota, or rested last round (no consecutive
// rests), are excluded outright. Not guaranteed to always fully fill every
// round on one pass — see generateRestSchedule's retry loop.
function attemptRestSchedule(
  teamIds: string[],
  qualifyingRounds: number,
  restingPerRound: number,
  restQuotaByTeam: Map<string, number>,
  rng: SeededRandom,
): RestAssignment[] {
  const restsSoFar = new Map<string, number>(teamIds.map((id) => [id, 0]));
  let lastRoundRestingIds = new Set<string>();
  const assignments: RestAssignment[] = [];

  for (let round = 1; round <= qualifyingRounds; round++) {
    const roundsRemaining = qualifyingRounds - round + 1;
    const candidates = teamIds
      .filter((id) => (restsSoFar.get(id) ?? 0) < (restQuotaByTeam.get(id) ?? 0))
      .filter((id) => !lastRoundRestingIds.has(id))
      .map((id) => {
        const remainingQuota = (restQuotaByTeam.get(id) ?? 0) - (restsSoFar.get(id) ?? 0);
        return { id, forced: remainingQuota >= roundsRemaining, remainingQuota, tiebreak: rng() };
      })
      .sort((a, b) => {
        if (a.forced !== b.forced) return a.forced ? -1 : 1;
        if (b.remainingQuota !== a.remainingQuota) return b.remainingQuota - a.remainingQuota;
        return a.tiebreak - b.tiebreak;
      });

    const resting = candidates.slice(0, restingPerRound).map((c) => c.id);
    for (const id of resting) restsSoFar.set(id, (restsSoFar.get(id) ?? 0) + 1);
    lastRoundRestingIds = new Set(resting);
    for (const id of resting) assignments.push({ teamId: id, roundNumber: round, source: 'schedule', locked: false });
  }

  return assignments;
}

// Generates the full qualifying-stage rest schedule up front (every round,
// before Round 1 starts) so the organiser — and All Rounds — can see the
// whole plan immediately. `attemptRestSchedule`'s greedy fill isn't
// provably guaranteed to fully satisfy every constraint on the first try
// (e.g. a run of bad luck in the seeded shuffle could leave a round
// under-filled near the end), so this tries a bounded number of reshuffled
// attempts, drawing fresh randomness from the same continuing seeded
// stream, and keeps the first one that validates. If none validate, the
// last attempt is still returned so validateRestSchedule can explain
// exactly what's wrong and the organiser can hit "Regenerate".
export function generateRestSchedule(
  teamIds: string[],
  qualifyingRounds: number,
  numberOfCourts: number,
  seed: number,
): RestAssignment[] {
  const { restingTeamCount } = calculateQualifyingCapacity(teamIds.length, numberOfCourts);
  if (restingTeamCount <= 0 || qualifyingRounds <= 0 || teamIds.length === 0) return [];

  const rng = makeSeededRandom(seed);
  const totalRestSlots = qualifyingRounds * restingTeamCount;
  const restQuotaByTeam = buildRestQuota(teamIds, totalRestSlots, rng);

  const MAX_ATTEMPTS = 25;
  let best: RestAssignment[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const assignments = attemptRestSchedule(teamIds, qualifyingRounds, restingTeamCount, restQuotaByTeam, rng);
    best = assignments;
    if (assignments.length === totalRestSlots) return assignments;
  }
  return best;
}

// Validates the fairness invariants a rest schedule must satisfy — see
// README's "Rest schedule" section. Deliberately checks the *evenly
// distributed* invariant (every team's total rests within 1 of every other
// team's) rather than a single fixed constant, so it generalises past the
// clean 18-team/3-rest default to any checked-in team count.
export function validateRestSchedule(
  assignments: RestAssignment[],
  teams: DynamicTeam[],
  qualifyingRounds: number,
  numberOfCourts: number,
): { ok: true } | { ok: false; reason: string } {
  const { restingTeamCount } = calculateQualifyingCapacity(teams.length, numberOfCourts);
  if (restingTeamCount <= 0) return { ok: true };

  const totalRestSlots = qualifyingRounds * restingTeamCount;
  const minQuota = Math.floor(totalRestSlots / teams.length);
  const maxQuota = Math.ceil(totalRestSlots / teams.length);

  const roundsByTeam = new Map<string, number[]>(teams.map((t) => [t.id, []]));
  for (const a of assignments) roundsByTeam.get(a.teamId)?.push(a.roundNumber);

  for (const team of teams) {
    const rounds = (roundsByTeam.get(team.id) ?? []).sort((a, b) => a - b);
    if (rounds.length < minQuota || rounds.length > maxQuota) {
      const expected = minQuota === maxQuota ? `exactly ${minQuota}` : `${minQuota}-${maxQuota}`;
      return {
        ok: false,
        reason: `${team.teamCode} (${team.displayName}) has ${rounds.length} scheduled rest${rounds.length === 1 ? '' : 's'}; expected ${expected}.`,
      };
    }
    for (let i = 1; i < rounds.length; i++) {
      if (rounds[i] === rounds[i - 1] + 1) {
        return {
          ok: false,
          reason: `${team.teamCode} (${team.displayName}) is scheduled to rest in consecutive rounds ${rounds[i - 1]} and ${rounds[i]}.`,
        };
      }
    }
  }

  for (let round = 1; round <= qualifyingRounds; round++) {
    const restingCount = assignments.filter((a) => a.roundNumber === round).length;
    if (restingCount !== restingTeamCount) {
      return {
        ok: false,
        reason: `Round ${round} has ${restingCount} resting team${restingCount === 1 ? '' : 's'} scheduled; expected exactly ${restingTeamCount}.`,
      };
    }
  }

  return { ok: true };
}

// Teams actually taking the court this round — checked-in, active, and not
// on the rest schedule for this round.
export function getActiveTeamsForRound(teams: DynamicTeam[], round: QualifyingRound): DynamicTeam[] {
  const restingSet = new Set(round.restingTeamIds);
  return teams.filter((t) => t.checkedIn && !t.withdrawn && !restingSet.has(t.id));
}

// --- Standings -------------------------------------------------------------
// Per-team stats and provisional/final rankings, always computed fresh from
// `matches` + `restAssignments` (never stored separately) — same
// "derived, not duplicated" approach as calculateDynamicPairingStats in
// utils/dynamicPairingSocial.ts, so there's a single source of truth.

// Per-match ranking contribution, capped so one lopsided blowout can't
// dominate standings the way raw point differential could — see README's
// "Point differential" section. The actual score is still stored on
// QualifyingMatch untouched; only this derived ranking figure is capped.
export function calculateCappedPointDifferential(scoreFor: number, scoreAgainst: number): number {
  const CAP = 7;
  return Math.max(-CAP, Math.min(CAP, scoreFor - scoreAgainst));
}

// Strength-of-schedule tiebreaker: the average win % of every opponent a
// team has faced so far. Takes each opponent's *own* win % (computed
// independently in the same pass, not recursively) so there's no
// circularity — see calculateProvisionalStandings.
export function calculateOpponentWinPercentage(opponentIds: string[], winPercentageById: Map<string, number>): number {
  if (opponentIds.length === 0) return 0;
  const total = opponentIds.reduce((sum, id) => sum + (winPercentageById.get(id) ?? 0), 0);
  return total / opponentIds.length;
}

interface StandingAccumulator {
  teamId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  cappedPointDifferential: number;
  totalPointsScored: number;
  restCount: number;
}

function emptyAccumulator(teamId: string): StandingAccumulator {
  return {
    teamId,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    cappedPointDifferential: 0,
    totalPointsScored: 0,
    restCount: 0,
  };
}

// Provisional standings order (see README's "Standings during qualifying"):
// 1. win %, 2. opponent win %, 3. total wins, 4. capped point differential,
// 5. a stable deterministic tiebreak. Used both for the live Standings tab
// and to order Round 3+ pairing (see generateQualifyingPairings) — teams
// may have played different numbers of games (because of scheduled rests),
// which is exactly why win *percentage*, not raw wins, leads.
export function calculateProvisionalStandings(
  teamIds: string[],
  matches: QualifyingMatch[],
  restAssignments: RestAssignment[],
): TeamStanding[] {
  const accByTeam = new Map<string, StandingAccumulator>(teamIds.map((id) => [id, emptyAccumulator(id)]));
  const opponentsByTeam = new Map<string, string[]>(teamIds.map((id) => [id, []]));

  for (const match of matches) {
    if (match.scoreA == null || match.scoreB == null || match.scoreA === match.scoreB) continue;
    const a = accByTeam.get(match.teamAId);
    const b = accByTeam.get(match.teamBId);
    if (!a || !b) continue;

    a.gamesPlayed += 1;
    b.gamesPlayed += 1;
    a.pointsFor += match.scoreA;
    a.pointsAgainst += match.scoreB;
    b.pointsFor += match.scoreB;
    b.pointsAgainst += match.scoreA;
    a.totalPointsScored += match.scoreA;
    b.totalPointsScored += match.scoreB;

    const cappedA = calculateCappedPointDifferential(match.scoreA, match.scoreB);
    a.cappedPointDifferential += cappedA;
    b.cappedPointDifferential -= cappedA;

    if (match.scoreA > match.scoreB) {
      a.wins += 1;
      b.losses += 1;
    } else {
      b.wins += 1;
      a.losses += 1;
    }

    opponentsByTeam.get(match.teamAId)?.push(match.teamBId);
    opponentsByTeam.get(match.teamBId)?.push(match.teamAId);
  }

  for (const rest of restAssignments) {
    const acc = accByTeam.get(rest.teamId);
    if (acc) acc.restCount += 1;
  }

  const winPercentageById = new Map<string, number>(
    Array.from(accByTeam.values()).map((acc) => [acc.teamId, acc.gamesPlayed > 0 ? acc.wins / acc.gamesPlayed : 0]),
  );

  const standings: TeamStanding[] = Array.from(accByTeam.values()).map((acc) => ({
    ...acc,
    winPercentage: winPercentageById.get(acc.teamId) ?? 0,
    opponentWinPercentage: calculateOpponentWinPercentage(opponentsByTeam.get(acc.teamId) ?? [], winPercentageById),
    rank: 0,
  }));

  return rankByProvisionalOrder(standings);
}

function rankByProvisionalOrder(standings: TeamStanding[]): TeamStanding[] {
  const sorted = [...standings].sort((a, b) => {
    if (b.winPercentage !== a.winPercentage) return b.winPercentage - a.winPercentage;
    if (b.opponentWinPercentage !== a.opponentWinPercentage) return b.opponentWinPercentage - a.opponentWinPercentage;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.cappedPointDifferential !== a.cappedPointDifferential) return b.cappedPointDifferential - a.cappedPointDifferential;
    return stableTiebreak(a.teamId, b.teamId);
  });
  return sorted.map((standing, index) => ({ ...standing, rank: index + 1 }));
}

// --- Final standings ---------------------------------------------------
// Only meaningful once every qualifying round is locked (see
// isQualifyingComplete) — final order (see README's "Final standings after
// Round N"): 1. total wins, 2. opponent win %, 3. head-to-head (only when a
// *complete* mini round-robin exists among the exact set of tied teams —
// see resolveHeadToHeadGroup), 4. capped point differential, 5. total
// points scored, 6. a stable deterministic tiebreak standing in for a
// tournament-director draw.

function roundForGrouping(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function tieGroupKey(standing: TeamStanding): string {
  return `${standing.wins}|${roundForGrouping(standing.opponentWinPercentage)}`;
}

function compareByRemainingFinalTiebreakers(a: TeamStanding, b: TeamStanding): number {
  if (b.cappedPointDifferential !== a.cappedPointDifferential) return b.cappedPointDifferential - a.cappedPointDifferential;
  if (b.totalPointsScored !== a.totalPointsScored) return b.totalPointsScored - a.totalPointsScored;
  return stableTiebreak(a.teamId, b.teamId);
}

// Head-to-head only applies within a *clean* tied group: every pair in the
// group must have played each other exactly once among the given matches,
// so a complete mini round-robin table can be built. Any group where at
// least one pair never met (common once rest scheduling is involved) skips
// head-to-head entirely and falls straight through to capped point
// differential — see README's "Final standings" section for why a partial
// table isn't used.
function resolveHeadToHeadGroup(group: TeamStanding[], matches: QualifyingMatch[]): TeamStanding[] {
  if (group.length < 2) return group;

  const idsInGroup = new Set(group.map((s) => s.teamId));
  const withinGroupMatches = matches.filter(
    (m) => idsInGroup.has(m.teamAId) && idsInGroup.has(m.teamBId) && m.scoreA != null && m.scoreB != null && m.scoreA !== m.scoreB,
  );
  const expectedPairs = (group.length * (group.length - 1)) / 2;
  const seenPairs = new Set(withinGroupMatches.map((m) => [m.teamAId, m.teamBId].sort().join('|')));
  const isCompleteMiniRoundRobin = seenPairs.size === expectedPairs && withinGroupMatches.length === expectedPairs;

  if (!isCompleteMiniRoundRobin) return [...group].sort(compareByRemainingFinalTiebreakers);

  const miniWins = new Map<string, number>(group.map((s) => [s.teamId, 0]));
  for (const match of withinGroupMatches) {
    const winnerId = match.scoreA! > match.scoreB! ? match.teamAId : match.teamBId;
    miniWins.set(winnerId, (miniWins.get(winnerId) ?? 0) + 1);
  }

  return [...group].sort((a, b) => {
    const miniDiff = (miniWins.get(b.teamId) ?? 0) - (miniWins.get(a.teamId) ?? 0);
    if (miniDiff !== 0) return miniDiff;
    return compareByRemainingFinalTiebreakers(a, b);
  });
}

export function calculateFinalStandings(
  teamIds: string[],
  matches: QualifyingMatch[],
  restAssignments: RestAssignment[],
): TeamStanding[] {
  const provisional = calculateProvisionalStandings(teamIds, matches, restAssignments);

  const groups = new Map<string, TeamStanding[]>();
  for (const standing of provisional) {
    const key = tieGroupKey(standing);
    const bucket = groups.get(key) ?? [];
    bucket.push(standing);
    groups.set(key, bucket);
  }

  const groupOrder = Array.from(groups.keys()).sort((keyA, keyB) => {
    const [winsA, oppA] = keyA.split('|').map(Number);
    const [winsB, oppB] = keyB.split('|').map(Number);
    if (winsB !== winsA) return winsB - winsA;
    return oppB - oppA;
  });

  const ordered = groupOrder.flatMap((key) => resolveHeadToHeadGroup(groups.get(key)!, matches));
  return ordered.map((standing, index) => ({ ...standing, rank: index + 1 }));
}

// True once every scheduled qualifying round has been played through to
// 'locked' (or a still-'completed'-but-not-yet-locked final round) — see
// README's "Final standings after Round N": final standings are only
// meaningful once every active team has actually completed all of their
// qualifying games.
export function isQualifyingComplete(rounds: QualifyingRound[], qualifyingRounds: number): boolean {
  const lastRound = rounds.find((r) => r.roundNumber === qualifyingRounds);
  if (!lastRound) return false;
  if (lastRound.status !== 'locked' && lastRound.status !== 'completed') return false;
  return lastRound.matches.length > 0 && lastRound.matches.every((m) => m.status === 'completed');
}

// Rounds that have actually been reached (current, completed, or locked) —
// excludes 'upcoming' pre-listed rounds whose pairings don't exist yet.
// Standings/rest-history must only ever be computed from this, mirroring
// playedDynamicPairingRounds in utils/dynamicPairingSocial.ts.
export function reachedQualifyingRounds(rounds: QualifyingRound[]): QualifyingRound[] {
  return rounds.filter((r) => r.status !== 'upcoming');
}

// --- Pairing (Round 3+) -------------------------------------------------
// Hard rule, never relaxed: no qualifying opponent pair may appear more
// than once (see validateNoRepeatQualifyingMatchups). Rounds 1-2 use
// seeded-random pairing (too little data yet for results-based pairing to
// mean anything); Round 3 onwards orders teams by provisional standing and
// greedily pairs the closest-performing teams that haven't already played —
// see README's "Pairing rules".

function buildOpponentHistory(matches: QualifyingMatch[]): Map<string, Set<string>> {
  const history = new Map<string, Set<string>>();
  for (const match of matches) {
    if (!history.has(match.teamAId)) history.set(match.teamAId, new Set());
    if (!history.has(match.teamBId)) history.set(match.teamBId, new Set());
    history.get(match.teamAId)!.add(match.teamBId);
    history.get(match.teamBId)!.add(match.teamAId);
  }
  return history;
}

// Orders teams by rank, with a small random jitter (strictly less than one
// rank position) so retrying with a different seed draw can actually
// produce a different pairing order among close-performing teams, without
// ever letting a team leapfrog past teams meaningfully ahead of/behind it
// in the standings.
function jitteredRankOrder(teamIds: string[], rankById: Map<string, number>, rng: SeededRandom): string[] {
  return teamIds
    .map((id) => ({ id, key: (rankById.get(id) ?? Number.MAX_SAFE_INTEGER) + rng() }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.id);
}

// Readable greedy matcher: walks the ordered team list front-to-back,
// pairing each team with the *nearest* remaining team (in list order) it
// hasn't already played. Returns null if some team runs out of eligible
// opponents entirely (every remaining team is a repeat) — the caller
// retries with a different order, and if nothing works, attempts a rest-
// slot repair (see generateNextQualifyingRound).
//
// This is intentionally simple, not globally optimal — a minimum-cost
// perfect matching (e.g. the blossom algorithm) over a graph weighted by
// standings-closeness would find a valid pairing more reliably and could
// replace this for a future version, at the cost of being much harder to
// read and reason about.
function greedyPairByProximity(orderedTeamIds: string[], opponentHistory: Map<string, Set<string>>): [string, string][] | null {
  const remaining = [...orderedTeamIds];
  const pairs: [string, string][] = [];
  while (remaining.length > 0) {
    const teamA = remaining.shift()!;
    const alreadyPlayed = opponentHistory.get(teamA) ?? new Set<string>();
    const partnerIndex = remaining.findIndex((id) => !alreadyPlayed.has(id));
    if (partnerIndex === -1) return null;
    const [teamB] = remaining.splice(partnerIndex, 1);
    pairs.push([teamA, teamB]);
  }
  return pairs;
}

export type PairingResult = { ok: true; pairs: [string, string][] } | { ok: false; reason: string };

export function generateQualifyingPairings(
  roundNumber: number,
  activeTeamIds: string[],
  standings: TeamStanding[],
  priorMatches: QualifyingMatch[],
  seed: number,
): PairingResult {
  if (activeTeamIds.length < 2) {
    return { ok: false, reason: 'Not enough active teams to form a match.' };
  }
  if (activeTeamIds.length % 2 !== 0) {
    return { ok: false, reason: 'Active team count must be even to pair every team.' };
  }

  const opponentHistory = buildOpponentHistory(priorMatches);
  const rankById = new Map(standings.map((s) => [s.teamId, s.rank]));

  // Rounds 1-2: results are too thin to mean anything yet, so pairing is
  // seeded-random (see README's "Pairing rules"). Round 3+: order by
  // provisional standing so "closest performance" pairs meet — see
  // jitteredRankOrder. Retrying (with fresh randomness drawn from the same
  // seeded stream each time) gives the greedy matcher multiple chances to
  // find a fully valid no-repeat pairing before falling back to a rest-slot
  // repair at the caller.
  const MAX_ATTEMPTS = 30;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = makeSeededRandom(seed + roundNumber * 7919 + attempt * 104729);
    const order = roundNumber <= 2 ? seededShuffle(activeTeamIds, rng) : jitteredRankOrder(activeTeamIds, rankById, rng);
    const pairs = greedyPairByProximity(order, opponentHistory);
    if (pairs) return { ok: true, pairs };
  }

  return {
    ok: false,
    reason: `Could not find a pairing for Round ${roundNumber} where no two teams face a repeat opponent.`,
  };
}

// Sanity double-check that a proposed set of pairs contains no repeat
// matchup, run before a round is published — even though
// generateQualifyingPairings' construction already guarantees this, this
// makes the "never silently create a repeat" rule verifiable independently
// of how the pairs were produced (e.g. after a rest-slot repair swap).
export function validateNoRepeatQualifyingMatchups(
  pairs: [string, string][],
  priorMatches: QualifyingMatch[],
): { ok: true } | { ok: false; reason: string } {
  const alreadyPlayed = new Set(priorMatches.map((m) => [m.teamAId, m.teamBId].sort().join('|')));
  for (const [teamAId, teamBId] of pairs) {
    if (alreadyPlayed.has([teamAId, teamBId].sort().join('|'))) {
      return { ok: false, reason: `Teams ${teamAId} and ${teamBId} have already played each other during qualifying.` };
    }
  }
  return { ok: true };
}

// --- Court allocation --------------------------------------------------
// Court 1 gets the strongest available matchup; court number itself never
// awards ranking points (see README's "Court allocation"). Rounds 1-2 have
// no meaningful standings yet, so court order is just the seeded-random
// pairing order.
function orderPairsByCourtStrength(
  pairs: [string, string][],
  standings: TeamStanding[],
  roundNumber: number,
  seed: number,
): [string, string][] {
  if (roundNumber <= 2) {
    const rng = makeSeededRandom(seed + roundNumber * 65599);
    return seededShuffle(pairs, rng);
  }
  const rankById = new Map(standings.map((s) => [s.teamId, s.rank]));
  return [...pairs].sort((a, b) => {
    const strengthA = (rankById.get(a[0]) ?? 0) + (rankById.get(a[1]) ?? 0);
    const strengthB = (rankById.get(b[0]) ?? 0) + (rankById.get(b[1]) ?? 0);
    return strengthA - strengthB;
  });
}

function buildMatches(pairs: [string, string][], roundNumber: number): QualifyingMatch[] {
  return pairs.map((pair, index) => ({
    id: makeId('qm'),
    roundNumber,
    courtNumber: index + 1,
    teamAId: pair[0],
    teamBId: pair[1],
    goldenPoint: false,
    forfeit: false,
    status: 'pending',
    sourcePairingVersion: 1,
  }));
}

// --- Starting qualifying (Round 1) --------------------------------------

export type StartQualifyingResult =
  | { ok: true; rounds: QualifyingRound[]; restAssignments: RestAssignment[] }
  | { ok: false; reason: string };

// Called once, when the organiser locks the roster and starts the
// tournament (see README's "Recommended generation behaviour"): validates
// check-in, generates the full rest schedule for every qualifying round up
// front, and generates Round 1's pairings immediately (Rounds 2+ stay
// 'upcoming' with just their resting teams known, since their pairings
// depend on results that don't exist yet).
export function lockRosterAndStartQualifying(
  teams: DynamicTeam[],
  settings: DynamicTeamQualifierSettings,
): StartQualifyingResult {
  const rosterCheck = validateCheckedInTeams(teams, settings.numberOfCourts);
  if (!rosterCheck.ok) return rosterCheck;

  const activeTeamIds = teams.filter((t) => t.checkedIn && !t.withdrawn).map((t) => t.id);
  const activeTeams = teams.filter((t) => activeTeamIds.includes(t.id));

  const restAssignments = generateRestSchedule(activeTeamIds, settings.qualifyingRounds, settings.numberOfCourts, settings.randomSeed);
  const scheduleCheck = validateRestSchedule(restAssignments, activeTeams, settings.qualifyingRounds, settings.numberOfCourts);
  if (!scheduleCheck.ok) {
    return { ok: false, reason: `Rest schedule failed validation — ${scheduleCheck.reason} Try Regenerate Rest Schedule.` };
  }

  const round1RestingIds = new Set(restAssignments.filter((a) => a.roundNumber === 1).map((a) => a.teamId));
  const round1PlayableIds = activeTeamIds.filter((id) => !round1RestingIds.has(id));
  const round1Standings = calculateProvisionalStandings(activeTeamIds, [], []);
  const pairingResult = generateQualifyingPairings(1, round1PlayableIds, round1Standings, [], settings.randomSeed);
  if (!pairingResult.ok) {
    return { ok: false, reason: `Could not generate Round 1 pairings: ${pairingResult.reason}` };
  }

  const courtOrder = orderPairsByCourtStrength(pairingResult.pairs, round1Standings, 1, settings.randomSeed);
  const round1Matches = buildMatches(courtOrder, 1);

  const rounds: QualifyingRound[] = Array.from({ length: settings.qualifyingRounds }, (_, i) => {
    const roundNumber = i + 1;
    const restingTeamIds = restAssignments.filter((a) => a.roundNumber === roundNumber).map((a) => a.teamId);
    const status: QualifyingRoundStatus = roundNumber === 1 ? 'current' : 'upcoming';
    return {
      roundNumber,
      stage: 'qualifying' as const,
      durationMinutes: settings.qualifyingGameDurationMinutes,
      status,
      restingTeamIds,
      matches: roundNumber === 1 ? round1Matches : [],
    };
  });

  return { ok: true, rounds, restAssignments };
}

// --- Score entry ---------------------------------------------------------

export function processQualifyingResult(
  match: QualifyingMatch,
  result: { scoreA?: number; scoreB?: number; winnerId?: string; goldenPoint?: boolean; forfeit?: boolean },
): QualifyingMatch {
  const winnerId = result.forfeit
    ? result.winnerId
    : result.scoreA != null && result.scoreB != null && result.scoreA !== result.scoreB
      ? result.scoreA > result.scoreB
        ? match.teamAId
        : match.teamBId
      : undefined;

  return {
    ...match,
    scoreA: result.forfeit ? undefined : result.scoreA,
    scoreB: result.forfeit ? undefined : result.scoreB,
    winnerId,
    goldenPoint: result.goldenPoint ?? false,
    forfeit: result.forfeit ?? false,
    status: winnerId != null ? 'completed' : 'pending',
    submittedAt: winnerId != null ? Date.now() : match.submittedAt,
  };
}

export function isQualifyingRoundComplete(round: QualifyingRound): boolean {
  return round.matches.length > 0 && round.matches.every((m) => m.status === 'completed');
}

// "Close Round" (Director Dashboard): marks every result final and takes
// score entry offline, but doesn't yet activate the next round — that's a
// deliberately separate action (see generateNextQualifyingRound) so the
// organiser can review a round's results before committing to the next
// one's pairings.
export function closeQualifyingRound(round: QualifyingRound): QualifyingRound {
  return { ...round, status: 'completed' };
}

// "Generate Next Round" (Director Dashboard): permanently locks the just-
// closed round (read-only from here on) and activates the following
// pre-listed round — generating its pairings now, since Round 3+ pairing
// depends on standings as of the round that just closed.
export function lockQualifyingRound(round: QualifyingRound): QualifyingRound {
  return { ...round, status: 'locked' };
}

// A simple rest-slot repair: if the scheduled active/resting split can't be
// paired without a repeat matchup, try swapping one resting team in for one
// scheduled-to-play team, one pair at a time, and keep the first swap that
// unblocks a fully valid pairing. Bounded (restingCount × activeCount
// attempts) and easy to reason about; a smarter repair (e.g. searching for
// the swap that best preserves each team's rest fairness, rather than the
// first one that merely works) could replace this later — see README's
// "Current MVP limitations".
function attemptRestSlotRepair(
  roundNumber: number,
  playableIds: string[],
  restingIds: string[],
  standings: TeamStanding[],
  priorMatches: QualifyingMatch[],
  seed: number,
): { playableIds: string[]; restingIds: string[]; pairs: [string, string][]; swappedIn: string; swappedOut: string } | null {
  for (const restingId of restingIds) {
    for (const playableId of playableIds) {
      const swappedPlayable = playableIds.map((id) => (id === playableId ? restingId : id));
      const attempt = generateQualifyingPairings(roundNumber, swappedPlayable, standings, priorMatches, seed);
      if (attempt.ok) {
        const swappedResting = restingIds.map((id) => (id === restingId ? playableId : id));
        return { playableIds: swappedPlayable, restingIds: swappedResting, pairs: attempt.pairs, swappedIn: playableId, swappedOut: restingId };
      }
    }
  }
  return null;
}

export type GenerateNextRoundResult =
  | { ok: true; rounds: QualifyingRound[]; restAssignments: RestAssignment[] }
  | { ok: false; reason: string };

// The full "advance to the next qualifying round" sequence (see README's
// "Dynamic qualifying rounds"): locks the just-closed round, computes fresh
// standings from every round played so far, pairs the next round's active
// teams (attempting a rest-slot repair if the scheduled split can't be
// paired cleanly), assigns courts strongest-first, and activates it.
// Returns a failure (never silently skipping) if even the repair can't
// produce a valid pairing — see README's "Pairing rules".
export function generateNextQualifyingRound(
  teams: DynamicTeam[],
  rounds: QualifyingRound[],
  restAssignments: RestAssignment[],
  seed: number,
): GenerateNextRoundResult {
  const closedRound = rounds.find((r) => r.status === 'completed');
  if (!closedRound) return { ok: false, reason: 'Close the current round before generating the next one.' };

  const nextRoundNumber = closedRound.roundNumber + 1;
  if (!rounds.some((r) => r.roundNumber === nextRoundNumber)) {
    return { ok: false, reason: `Round ${nextRoundNumber} is not on the qualifying schedule.` };
  }

  const lockedRounds = rounds.map((r) => (r.roundNumber === closedRound.roundNumber ? lockQualifyingRound(r) : r));
  const priorMatches = lockedRounds.filter((r) => r.status === 'locked' || r.status === 'completed').flatMap((r) => r.matches);

  const activeTeamIds = teams.filter((t) => t.checkedIn && !t.withdrawn).map((t) => t.id);
  const scheduledRestingIds = restAssignments.filter((a) => a.roundNumber === nextRoundNumber).map((a) => a.teamId);
  const scheduledRestingSet = new Set(scheduledRestingIds);
  const scheduledPlayableIds = activeTeamIds.filter((id) => !scheduledRestingSet.has(id));

  const priorRestAssignments = restAssignments.filter((a) => a.roundNumber < nextRoundNumber);
  const standings = calculateProvisionalStandings(activeTeamIds, priorMatches, priorRestAssignments);

  let pairingResult = generateQualifyingPairings(nextRoundNumber, scheduledPlayableIds, standings, priorMatches, seed);
  let restingTeamIds = scheduledRestingIds;
  let updatedRestAssignments = restAssignments;

  if (!pairingResult.ok) {
    const repair = attemptRestSlotRepair(nextRoundNumber, scheduledPlayableIds, scheduledRestingIds, standings, priorMatches, seed);
    if (repair) {
      pairingResult = { ok: true, pairs: repair.pairs };
      restingTeamIds = repair.restingIds;
      updatedRestAssignments = [
        ...restAssignments.filter((a) => !(a.roundNumber === nextRoundNumber && a.teamId === repair.swappedOut)),
        { teamId: repair.swappedIn, roundNumber: nextRoundNumber, source: 'repair', locked: false },
      ];
    }
  }

  if (!pairingResult.ok) {
    return {
      ok: false,
      reason: `${pairingResult.reason} A rest-slot repair was also attempted and didn't resolve it — you may need to adjust the rest schedule manually or accept a rare repeat for this round.`,
    };
  }

  const repeatCheck = validateNoRepeatQualifyingMatchups(pairingResult.pairs, priorMatches);
  if (!repeatCheck.ok) return { ok: false, reason: repeatCheck.reason };

  const courtOrder = orderPairsByCourtStrength(pairingResult.pairs, standings, nextRoundNumber, seed);
  const matches = buildMatches(courtOrder, nextRoundNumber);

  const updatedRounds = lockedRounds.map((r) =>
    r.roundNumber === nextRoundNumber ? { ...r, status: 'current' as const, restingTeamIds, matches } : r,
  );

  return { ok: true, rounds: updatedRounds, restAssignments: updatedRestAssignments };
}

// --- Medal bracket -------------------------------------------------------
// Fixed Semis/Gold/Bronze structure for the top 4 final-standings teams —
// see README's "Medal bracket". Both semifinals are playable at once
// (unlike a normal single-elimination bracket's strictly-sequential "one
// current match" convention), since they're independent courts.

export function generateMedalBracket(finalStandings: TeamStanding[]): MedalBracket {
  const [seed1, seed2, seed3, seed4] = finalStandings.slice(0, 4).map((s) => s.teamId);
  return {
    semifinal1: { id: makeId('mb'), label: 'semifinal1', roundName: 'Semifinal 1', teamAId: seed1, teamBId: seed4, status: 'current' },
    semifinal2: { id: makeId('mb'), label: 'semifinal2', roundName: 'Semifinal 2', teamAId: seed2, teamBId: seed3, status: 'current' },
    goldMatch: { id: makeId('mb'), label: 'gold', roundName: 'Gold Match', status: 'upcoming' },
    bronzeMatch: { id: makeId('mb'), label: 'bronze', roundName: 'Bronze Match', status: 'upcoming' },
  };
}

function bracketMatchKey(label: MedalBracketMatchLabel): 'semifinal1' | 'semifinal2' | 'goldMatch' | 'bronzeMatch' {
  switch (label) {
    case 'semifinal1':
      return 'semifinal1';
    case 'semifinal2':
      return 'semifinal2';
    case 'gold':
      return 'goldMatch';
    case 'bronze':
      return 'bronzeMatch';
  }
}

// Records one bracket match's score, determines the winner (no draws — same
// validation as qualifying), and — for a semifinal — forwards both winners
// into the Gold Match and both losers into the Bronze Match the moment the
// *second* semifinal completes (not one at a time), since either semifinal
// finishing first still has to wait for its counterpart. Completing the
// Gold or Bronze Match records the final placements directly.
export function processBracketResult(bracket: MedalBracket, label: MedalBracketMatchLabel, scoreA: number, scoreB: number): MedalBracket {
  const key = bracketMatchKey(label);
  const target = bracket[key];
  if (target.teamAId == null || target.teamBId == null || scoreA === scoreB) return bracket;

  const winnerId = scoreA > scoreB ? target.teamAId : target.teamBId;
  const loserId = scoreA > scoreB ? target.teamBId : target.teamAId;
  const completed: MedalBracketMatch = { ...target, scoreA, scoreB, winnerId, loserId, status: 'completed' };

  let next: MedalBracket = { ...bracket, [key]: completed };

  if (label === 'semifinal1' || label === 'semifinal2') {
    const otherSemi = label === 'semifinal1' ? next.semifinal2 : next.semifinal1;
    if (otherSemi.status === 'completed') {
      next = {
        ...next,
        goldMatch: { ...next.goldMatch, teamAId: next.semifinal1.winnerId, teamBId: next.semifinal2.winnerId, status: 'current' },
        bronzeMatch: { ...next.bronzeMatch, teamAId: next.semifinal1.loserId, teamBId: next.semifinal2.loserId, status: 'current' },
      };
    }
  } else if (label === 'gold') {
    next = { ...next, champion: winnerId, runnerUp: loserId };
  } else if (label === 'bronze') {
    next = { ...next, thirdPlace: winnerId, fourthPlace: loserId };
  }

  return next;
}

export function isMedalBracketComplete(bracket: MedalBracket): boolean {
  return bracket.goldMatch.status === 'completed' && bracket.bronzeMatch.status === 'completed';
}

// --- All Rounds ------------------------------------------------------------
// Backs the "All Rounds" view — see README's "All Rounds view". Every
// generated round (including 'upcoming' ones with only resting teams known
// so far) is shown; the medal bracket is rendered as its own trailing
// section by the component directly from `MedalBracket`, since its
// Semis/Gold/Bronze shape doesn't fit the same per-round list.
export function getAllRoundsForDisplay(rounds: QualifyingRound[]): QualifyingRound[] {
  return [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
}

// --- Display labels ----------------------------------------------------

// Shared by Standings and the Director Dashboard so a point differential
// always reads the same way (e.g. "+3" / "-2") everywhere it's shown.
export function formatSignedPoints(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function qualifyingRoundStatusLabel(status: QualifyingRoundStatus): string {
  switch (status) {
    case 'upcoming':
      return 'Upcoming';
    case 'current':
      return 'Current';
    case 'completed':
      return 'Completed';
    case 'locked':
      return 'Locked';
  }
}
