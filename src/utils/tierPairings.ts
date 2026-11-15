// Tier-Based Pairings — the pure pairing engine. No React, no storage, no
// scores: everything here is a function of the roster (tier + availability)
// and the completed rounds, plus an injectable random source so tests are
// deterministic and the app can persist whatever it drew.
//
// Generation runs three stages, in the spec's priority order. Each stage is
// solved completely before the next one starts, so no lower priority can
// trade against a higher one:
//
//   1. Court count (maxValidMatches) — exact. Matches split into "top-side"
//      courts (A and B only) and "lower-side" courts (C and B only); pure-B
//      courts can count as either. With a/b/c playing players of each tier,
//      k full courts are possible iff ceil(a/4) + ceil(c/4) <= k: every A
//      needs a top-side seat, every C a lower-side seat, and B fills the
//      remaining seats on either side. We search every (a', b', c') choice
//      of who could play, so the count is provably the maximum.
//   2. Who sits out (selectRestingPlayers) — exact. For every split of the
//      sit-outs across tiers that still allows the maximum court count, the
//      most-due players in each tier rest; the splits are compared
//      lexicographically on fairness (see restKey).
//   3. Who plays with/against whom (arrangeMatches) — partner repeats, then
//      opponent repeats, then tier balance, compared as a tuple (never
//      summed with weights). Exhaustive for up to 3 courts; above that a
//      randomised local search with restarts and a time budget. Every
//      candidate it ever holds is valid, so the fallback can only be less
//      varied, never invalid, and the round records which method ran.
import type {
  PlayerTier,
  TierArrangementInfo,
  TierMatch,
  TierPlayer,
  TierPlayerStats,
  TierRound,
} from '../types';
import { courtLabel } from './courtNumbers';

export type RandomSource = () => number;

export const TIERS: PlayerTier[] = ['A', 'B', 'C'];

export const TIER_NAMES: Record<PlayerTier, string> = { A: 'Top', B: 'Inbetween', C: 'Lower' };

// Used only for competitive balance (team strength difference) — the
// lowest-priority objective.
const TIER_STRENGTH: Record<PlayerTier, number> = { A: 3, B: 2, C: 1 };

export function tierLabel(tier: PlayerTier): string {
  return `${tier} – ${TIER_NAMES[tier]}`;
}

// The hard rule: a match may not contain both an A and a C player.
export function isValidTierMix(tiers: PlayerTier[]): boolean {
  return !(tiers.includes('A') && tiers.includes('C'));
}

// "Top / Inbetween", "Inbetween", "Lower / Inbetween", ... for a court header.
export function courtTierLabel(tiers: PlayerTier[]): string {
  return TIERS.filter((t) => tiers.includes(t))
    .map((t) => TIER_NAMES[t])
    .join(' / ');
}

// --- Stage 1: court count ---------------------------------------------------

// Exactly a+b+c = 4k players can fill k valid courts iff the A players fit
// on top-side courts and the C players on lower-side courts.
export function canFillCourts(a: number, b: number, c: number, k: number): boolean {
  if (a < 0 || b < 0 || c < 0 || a + b + c !== 4 * k) return false;
  return Math.ceil(a / 4) + Math.ceil(c / 4) <= k;
}

// The maximum number of valid four-player matches from a available A, b
// available B and c available C players on `courts` courts.
export function maxValidMatches(a: number, b: number, c: number, courts: number): number {
  const upper = Math.max(0, Math.min(Math.floor(courts), Math.floor((a + b + c) / 4)));
  for (let k = upper; k > 0; k--) {
    if (playingMixesFor(a, b, c, k).length > 0) return k;
  }
  return 0;
}

// Every (a', b', c') playing mix that fills exactly k valid courts.
function playingMixesFor(a: number, b: number, c: number, k: number): [number, number, number][] {
  const mixes: [number, number, number][] = [];
  for (let pa = 0; pa <= Math.min(a, 4 * k); pa++) {
    for (let pc = 0; pc <= Math.min(c, 4 * k - pa); pc++) {
      const pb = 4 * k - pa - pc;
      if (pb <= b && canFillCourts(pa, pb, pc, k)) mixes.push([pa, pb, pc]);
    }
  }
  return mixes;
}

// --- History ------------------------------------------------------------------

function emptyStats(playerId: string): TierPlayerStats {
  return {
    playerId,
    roundsPlayed: 0,
    roundsSatOut: 0,
    eligibleRounds: 0,
    consecutiveSitOuts: 0,
    expectedSitOuts: 0,
    partnerHistory: {},
    opponentHistory: {},
    lastPartnerRound: {},
    lastOpponentRound: {},
  };
}

export function completedTierRounds(rounds: TierRound[]): TierRound[] {
  return rounds.filter((r) => r.status === 'completed').sort((x, y) => x.roundNumber - y.roundNumber);
}

// Participation and partner/opponent history, derived from completed rounds
// only. Nothing is stored incrementally, so completing a round twice, or
// regenerating/discarding a draft, can never double-count or leak history.
export function computeTierStats(players: TierPlayer[], rounds: TierRound[]): Map<string, TierPlayerStats> {
  const stats = new Map<string, TierPlayerStats>();
  const get = (id: string) => {
    let s = stats.get(id);
    if (!s) {
      s = emptyStats(id);
      stats.set(id, s);
    }
    return s;
  };
  for (const p of players) get(p.id);

  const completed = completedTierRounds(rounds);
  for (const round of completed) {
    const playing = round.matches.flatMap((m) => [...m.teamAPlayerIds, ...m.teamBPlayerIds]);
    const eligible = playing.length + round.restingPlayerIds.length;
    const restShare = eligible > 0 ? round.restingPlayerIds.length / eligible : 0;
    for (const match of round.matches) {
      for (const [team, other] of [
        [match.teamAPlayerIds, match.teamBPlayerIds],
        [match.teamBPlayerIds, match.teamAPlayerIds],
      ] as const) {
        for (const id of team) {
          const s = get(id);
          s.roundsPlayed += 1;
          s.eligibleRounds += 1;
          s.expectedSitOuts += restShare;
          s.lastPlayedRound = round.roundNumber;
          const partner = team[0] === id ? team[1] : team[0];
          s.partnerHistory[partner] = (s.partnerHistory[partner] ?? 0) + 1;
          s.lastPartnerRound[partner] = round.roundNumber;
          for (const opp of other) {
            s.opponentHistory[opp] = (s.opponentHistory[opp] ?? 0) + 1;
            s.lastOpponentRound[opp] = round.roundNumber;
          }
        }
      }
    }
    for (const id of round.restingPlayerIds) {
      const s = get(id);
      s.roundsSatOut += 1;
      s.eligibleRounds += 1;
      s.expectedSitOuts += restShare;
      s.lastSitOutRound = round.roundNumber;
    }
  }

  // Consecutive sit-outs: the unbroken run of sit-outs ending at the latest
  // completed round. Playing — or being unavailable — ends the run, so time
  // away is never counted as a bye.
  for (const s of stats.values()) {
    let run = 0;
    for (let i = completed.length - 1; i >= 0; i--) {
      if (completed[i].restingPlayerIds.includes(s.playerId)) run += 1;
      else break;
    }
    s.consecutiveSitOuts = run;
  }
  return stats;
}

// --- Stage 2: who sits out ----------------------------------------------------

// Lower = more due to sit out. Compared lexicographically:
//   [0] consecutive sit-outs so far — never rest someone again back to back
//       while anyone else could rest instead;
//   [1] 1 for a player who has not had a single eligible round yet (a late
//       arrival's first round, when others have played) — they play first;
//   [2] sit-out surplus = sit-outs taken − fair share of the sit-outs in the
//       rounds they were eligible for (milli-units). Measured only over
//       eligible rounds, so late arrivals and returning players start level
//       instead of looking "owed" a long run of byes;
//   [3] random — breaks exact ties so equal players don't always rest in
//       roster order.
type RestKey = [number, number, number, number];

function restKey(stats: TierPlayerStats | undefined, anyCompleted: boolean, rng: RandomSource): RestKey {
  const s = stats ?? emptyStats('');
  const fresh = anyCompleted && s.eligibleRounds === 0 ? 1 : 0;
  const surplus = Math.round((s.roundsSatOut - s.expectedSitOuts) * 1000);
  return [s.consecutiveSitOuts, fresh, surplus, rng()];
}

function compareTuples(x: readonly number[], y: readonly number[]): number {
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

export interface RestSelection {
  playingIds: string[];
  restingIds: string[];
  maxMatches: number;
}

// Picks who plays so the maximum number of courts is filled and sit-outs go
// to the most-due players. For every tier split of the sit-outs that still
// fills maxMatches courts, the best candidates in each tier are the r most
// due (by restKey); splits are then compared by their resting players' keys
// sorted least-due first, so the split whose least-deserving rester is the
// most deserving wins. Exact — not greedy — over all splits.
export function selectRestingPlayers(
  eligible: TierPlayer[],
  stats: Map<string, TierPlayerStats>,
  courts: number,
  rng: RandomSource,
  anyCompleted: boolean,
): RestSelection {
  const byTier: Record<PlayerTier, { player: TierPlayer; key: RestKey }[]> = { A: [], B: [], C: [] };
  for (const player of eligible) byTier[player.tier].push({ player, key: restKey(stats.get(player.id), anyCompleted, rng) });
  for (const tier of TIERS) byTier[tier].sort((x, y) => compareTuples(x.key, y.key));

  const a = byTier.A.length;
  const b = byTier.B.length;
  const c = byTier.C.length;
  const k = maxValidMatches(a, b, c, courts);
  if (k === 0) return { playingIds: [], restingIds: eligible.map((p) => p.id), maxMatches: 0 };

  let best: { rest: [number, number, number]; vector: RestKey[] } | null = null;
  for (const [pa, pb, pc] of playingMixesFor(a, b, c, k)) {
    const rest: [number, number, number] = [a - pa, b - pb, c - pc];
    const restingKeys = [
      ...byTier.A.slice(0, rest[0]),
      ...byTier.B.slice(0, rest[1]),
      ...byTier.C.slice(0, rest[2]),
    ].map((e) => e.key);
    // Least-due rester first: that is the comparison that matters most.
    restingKeys.sort((x, y) => compareTuples(y, x));
    if (!best || compareKeyVectors(restingKeys, best.vector) < 0) best = { rest, vector: restingKeys };
  }
  const rest = best!.rest;
  const restingIds = TIERS.flatMap((tier, i) => byTier[tier].slice(0, rest[i]).map((e) => e.player.id));
  const resting = new Set(restingIds);
  return {
    playingIds: eligible.filter((p) => !resting.has(p.id)).map((p) => p.id),
    restingIds,
    maxMatches: k,
  };
}

function compareKeyVectors(x: RestKey[], y: RestKey[]): number {
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const cmp = compareTuples(x[i], y[i]);
    if (cmp !== 0) return cmp;
  }
  return x.length - y.length;
}

// --- Stage 3: who plays with/against whom -------------------------------------

// Per-court cost, compared lexicographically (index 0 most important):
//   [0] Σ (times already partnered)² over both partnerships — new partners
//       cost 0, and one partner repeated twice costs more than two
//       partners repeated once (prefer the least-frequent repeats);
//   [1] partnerships that also partnered in the latest completed round;
//   [2] Σ (times already opposed)² over the four opponent pairs;
//   [3] opponent pairs that also met in the latest completed round;
//   [4] tier-strength difference between the two teams (balance).
export const COST_LEVELS = 5;
export type ArrangementCost = number[];

export interface PairHistory {
  partner: (i: number, j: number) => number;
  opponent: (i: number, j: number) => number;
  partnerLast: (i: number, j: number) => boolean;
  opponentLast: (i: number, j: number) => boolean;
}

const SPLITS: [number, number, number, number][] = [
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [0, 3, 1, 2],
];

interface Engine {
  ids: string[];
  strength: number[];
  // bit 1 = A, bit 2 = C, per player index
  mask: number[];
  history: PairHistory;
}

function splitCost(engine: Engine, q: number[], split: [number, number, number, number]): ArrangementCost {
  const [w, x, y, z] = split.map((s) => q[s]);
  const h = engine.history;
  const p1 = h.partner(w, x);
  const p2 = h.partner(y, z);
  let opp = 0;
  let oppLast = 0;
  for (const i of [w, x]) {
    for (const j of [y, z]) {
      const o = h.opponent(i, j);
      opp += o * o;
      if (h.opponentLast(i, j)) oppLast += 1;
    }
  }
  return [
    p1 * p1 + p2 * p2,
    (h.partnerLast(w, x) ? 1 : 0) + (h.partnerLast(y, z) ? 1 : 0),
    opp,
    oppLast,
    Math.abs(engine.strength[w] + engine.strength[x] - engine.strength[y] - engine.strength[z]),
  ];
}

// Best split of a court's four players, plus every split tied with it.
function bestSplits(engine: Engine, q: number[]): { cost: ArrangementCost; splits: number[] } {
  let cost: ArrangementCost | null = null;
  let splits: number[] = [];
  for (let s = 0; s < SPLITS.length; s++) {
    const c = splitCost(engine, q, SPLITS[s]);
    const cmp = cost ? compareTuples(c, cost) : -1;
    if (cmp < 0) {
      cost = c;
      splits = [s];
    } else if (cmp === 0) splits.push(s);
  }
  return { cost: cost!, splits };
}

function courtMask(engine: Engine, q: number[]): number {
  return engine.mask[q[0]] | engine.mask[q[1]] | engine.mask[q[2]] | engine.mask[q[3]];
}

const INVALID_MASK = 3; // has an A (1) and a C (2)

function addInto(target: ArrangementCost, source: ArrangementCost, sign = 1) {
  for (let i = 0; i < COST_LEVELS; i++) target[i] += sign * source[i];
}

function totalCost(costs: ArrangementCost[]): ArrangementCost {
  const total = new Array(COST_LEVELS).fill(0);
  for (const c of costs) addInto(total, c);
  return total;
}

function shuffleInPlace<T>(items: T[], rng: RandomSource): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// Exhaustive search is used while the number of ways to split the players
// into courts stays small (3 courts = 5,775 groupings).
export const EXHAUSTIVE_MAX_COURTS = 3;
const LOCAL_SEARCH_RESTARTS = 30;
const LOCAL_SEARCH_TIME_BUDGET_MS = 120;
const HARD_LIMIT_FACTOR = 3;

export interface ArrangeOptions {
  // Tests: force the local search even for small rounds.
  method?: 'exhaustive' | 'local-search';
  restarts?: number;
  timeBudgetMs?: number;
}

export interface Arrangement {
  // Player indices per court, already in [teamA0, teamA1, teamB0, teamB1] order.
  courts: number[][];
  cost: ArrangementCost;
  method: 'exhaustive' | 'local-search';
}

function enumerateGroupings(n: number, visit: (courts: number[][]) => void) {
  const used = new Array(n).fill(false);
  const courts: number[][] = [];
  function next() {
    const first = used.indexOf(false);
    if (first === -1) {
      visit(courts);
      return;
    }
    used[first] = true;
    for (let i = first + 1; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      for (let j = i + 1; j < n; j++) {
        if (used[j]) continue;
        used[j] = true;
        for (let l = j + 1; l < n; l++) {
          if (used[l]) continue;
          used[l] = true;
          courts.push([first, i, j, l]);
          next();
          courts.pop();
          used[l] = false;
        }
        used[j] = false;
      }
      used[i] = false;
    }
    used[first] = false;
  }
  next();
}

function materialise(engine: Engine, courts: number[][], rng: RandomSource): number[][] {
  return courts.map((q) => {
    const { splits } = bestSplits(engine, q);
    const [w, x, y, z] = SPLITS[splits[Math.floor(rng() * splits.length)]].map((s) => q[s]);
    return rng() < 0.5 ? [w, x, y, z] : [y, z, w, x];
  });
}

function arrangeExhaustive(engine: Engine, rng: RandomSource): Arrangement {
  const cache = new Map<string, ArrangementCost>();
  const courtCost = (q: number[]) => {
    const key = q.join(',');
    let c = cache.get(key);
    if (!c) {
      c = courtMask(engine, q) === INVALID_MASK ? [] : bestSplits(engine, q).cost;
      cache.set(key, c);
    }
    return c;
  };
  let best: number[][] | null = null;
  let bestCost: ArrangementCost | null = null;
  let ties = 0;
  enumerateGroupings(engine.ids.length, (courts) => {
    const costs = courts.map(courtCost);
    if (costs.some((c) => c.length === 0)) return;
    const total = totalCost(costs);
    const cmp = bestCost ? compareTuples(total, bestCost) : -1;
    if (cmp < 0) {
      best = courts.map((q) => [...q]);
      bestCost = total;
      ties = 1;
    } else if (cmp === 0) {
      // Reservoir sampling: every tied optimum is equally likely.
      ties += 1;
      if (rng() * ties < 1) best = courts.map((q) => [...q]);
    }
  });
  if (!best) throw new Error('No valid arrangement exists for these players.');
  return { courts: materialise(engine, best, rng), cost: bestCost!, method: 'exhaustive' };
}

// A random valid starting grouping: pick how many courts are top-side
// (every feasible count is possible), seat A players and enough B players
// there, C players and the remaining B players on the lower side.
function randomValidGrouping(engine: Engine, rng: RandomSource): number[][] {
  const k = engine.ids.length / 4;
  const as: number[] = [];
  const bs: number[] = [];
  const cs: number[] = [];
  engine.mask.forEach((m, i) => (m === 1 ? as : m === 2 ? cs : bs).push(i));
  const topOptions: number[] = [];
  for (let t = 0; t <= k; t++) if (as.length <= 4 * t && cs.length <= 4 * (k - t)) topOptions.push(t);
  const t = topOptions[Math.floor(rng() * topOptions.length)];
  shuffleInPlace(as, rng);
  shuffleInPlace(bs, rng);
  shuffleInPlace(cs, rng);
  const topNeed = 4 * t - as.length;
  const top = shuffleInPlace([...as, ...bs.slice(0, topNeed)], rng);
  const lower = shuffleInPlace([...cs, ...bs.slice(topNeed)], rng);
  const seats = [...top, ...lower];
  const courts: number[][] = [];
  for (let i = 0; i < k; i++) courts.push(seats.slice(i * 4, i * 4 + 4));
  return courts;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function arrangeLocalSearch(engine: Engine, rng: RandomSource, options: ArrangeOptions): Arrangement {
  const restarts = options.restarts ?? LOCAL_SEARCH_RESTARTS;
  const budget = options.timeBudgetMs ?? LOCAL_SEARCH_TIME_BUDGET_MS;
  const started = now();
  let best: number[][] | null = null;
  let bestCost: ArrangementCost | null = null;
  let ties = 0;

  for (let attempt = 0; attempt < restarts; attempt++) {
    if (attempt > 0 && now() - started > budget) break;
    const courts = randomValidGrouping(engine, rng);
    const costs = courts.map((q) => bestSplits(engine, q).cost);
    const total = totalCost(costs);

    // First-improvement hill climb over every two-player swap between two
    // courts (swaps within a court are covered by trying all three splits).
    // Swaps that would put an A and a C on one court are skipped, so every
    // grouping visited is valid.
    // Every grouping visited is valid, so the climb can stop at any point:
    // past a hard limit (a slow device, a very large session) it keeps what
    // it has rather than overrunning.
    let improved = true;
    while (improved && now() - started < budget * HARD_LIMIT_FACTOR) {
      improved = false;
      const courtOrder = shuffleInPlace(courts.map((_, i) => i), rng);
      outer: for (const x of courtOrder) {
        for (let y = 0; y < courts.length; y++) {
          if (y === x) continue;
          for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
              const qx = [...courts[x]];
              const qy = [...courts[y]];
              [qx[i], qy[j]] = [qy[j], qx[i]];
              if (courtMask(engine, qx) === INVALID_MASK || courtMask(engine, qy) === INVALID_MASK) continue;
              const cx = bestSplits(engine, qx).cost;
              const cy = bestSplits(engine, qy).cost;
              const candidate = [...total];
              addInto(candidate, costs[x], -1);
              addInto(candidate, costs[y], -1);
              addInto(candidate, cx);
              addInto(candidate, cy);
              if (compareTuples(candidate, total) < 0) {
                courts[x] = qx;
                courts[y] = qy;
                costs[x] = cx;
                costs[y] = cy;
                for (let l = 0; l < COST_LEVELS; l++) total[l] = candidate[l];
                improved = true;
                break outer;
              }
            }
          }
        }
      }
    }

    const cmp = bestCost ? compareTuples(total, bestCost) : -1;
    if (cmp < 0) {
      best = courts.map((q) => [...q]);
      bestCost = [...total];
      ties = 1;
    } else if (cmp === 0) {
      ties += 1;
      if (rng() * ties < 1) best = courts.map((q) => [...q]);
    }
    // Nothing left to improve on: a zero cost is optimal.
    if (bestCost && bestCost.every((v) => v === 0)) break;
  }
  return { courts: materialise(engine, best!, rng), cost: bestCost!, method: 'local-search' };
}

export function historyFromStats(ids: string[], stats: Map<string, TierPlayerStats>, latestRound: number | undefined): PairHistory {
  const statsByIndex = ids.map((id) => stats.get(id));
  return {
    partner: (i, j) => statsByIndex[i]?.partnerHistory[ids[j]] ?? 0,
    opponent: (i, j) => statsByIndex[i]?.opponentHistory[ids[j]] ?? 0,
    partnerLast: (i, j) => latestRound !== undefined && statsByIndex[i]?.lastPartnerRound[ids[j]] === latestRound,
    opponentLast: (i, j) => latestRound !== undefined && statsByIndex[i]?.lastOpponentRound[ids[j]] === latestRound,
  };
}

// Groups exactly 4k playing players into k valid courts and splits each
// into two teams. Throws if no valid grouping exists — callers only pass
// sets chosen by selectRestingPlayers, which always admit one.
export function arrangeMatches(
  playingIds: string[],
  tierOf: (id: string) => PlayerTier,
  history: PairHistory,
  rng: RandomSource,
  options: ArrangeOptions = {},
): Arrangement {
  if (playingIds.length % 4 !== 0) throw new Error('Playing players must fill whole courts.');
  const tiers = playingIds.map(tierOf);
  const engine: Engine = {
    ids: playingIds,
    strength: tiers.map((t) => TIER_STRENGTH[t]),
    mask: tiers.map((t) => (t === 'A' ? 1 : t === 'C' ? 2 : 0)),
    history,
  };
  const k = playingIds.length / 4;
  const counts = { A: 0, B: 0, C: 0 };
  for (const t of tiers) counts[t] += 1;
  if (!canFillCourts(counts.A, counts.B, counts.C, k)) throw new Error('These players cannot fill valid courts.');
  if (k === 0) return { courts: [], cost: new Array(COST_LEVELS).fill(0), method: 'exhaustive' };
  const method = options.method ?? (k <= EXHAUSTIVE_MAX_COURTS ? 'exhaustive' : 'local-search');
  return method === 'exhaustive' ? arrangeExhaustive(engine, rng) : arrangeLocalSearch(engine, rng, options);
}

// --- Whole round ---------------------------------------------------------------

export function makeTierId(prefix: string, rng: RandomSource = Math.random): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(rng() * 1e9).toString(36)}`;
}

export interface GenerateTierRoundInput {
  players: TierPlayer[];
  rounds: TierRound[];
  numberOfCourts: number;
  roundNumber: number;
  rng: RandomSource;
  nowMs?: number;
  arrangeOptions?: ArrangeOptions;
  // Physical court numbers in use; match i is played on courtNumbers[i - 1].
  // Without them, match i is shown as Court i.
  courtNumbers?: number[];
}

export function eligibleTierPlayers(players: TierPlayer[]): TierPlayer[] {
  return players.filter((p) => p.available && !p.removed);
}

// Sorts courts strongest-first (Top courts on Court 1) for a stable,
// readable display, then numbers them.
function courtOrderKey(tiers: PlayerTier[]): number {
  return -tiers.reduce((sum, t) => sum + TIER_STRENGTH[t], 0);
}

export function generateTierRound(input: GenerateTierRoundInput): TierRound {
  const { players, rounds, numberOfCourts, roundNumber, rng } = input;
  const eligible = eligibleTierPlayers(players);
  const stats = computeTierStats(players, rounds);
  const completed = completedTierRounds(rounds);
  const latest = completed.length > 0 ? completed[completed.length - 1].roundNumber : undefined;
  const selection = selectRestingPlayers(eligible, stats, numberOfCourts, rng, completed.length > 0);
  const tierById = new Map(players.map((p) => [p.id, p.tier]));
  const tierOf = (id: string) => tierById.get(id)!;
  const arrangement = arrangeMatches(
    selection.playingIds,
    tierOf,
    historyFromStats(selection.playingIds, stats, latest),
    rng,
    input.arrangeOptions,
  );

  const courtIds = arrangement.courts
    .map((q) => q.map((i) => selection.playingIds[i]))
    .map((ids) => ({ ids, order: courtOrderKey(ids.map(tierOf)), tiebreak: rng() }))
    .sort((x, y) => x.order - y.order || x.tiebreak - y.tiebreak);

  const matches: TierMatch[] = courtIds.map(({ ids }, i) => ({
    id: makeTierId('tier-match', rng),
    courtNumber: i + 1,
    ...(input.courtNumbers?.[i] !== undefined ? { physicalCourt: input.courtNumbers[i] } : {}),
    teamAPlayerIds: [ids[0], ids[1]],
    teamBPlayerIds: [ids[2], ids[3]],
  }));

  const upperBound = Math.min(Math.floor(numberOfCourts), Math.floor(eligible.length / 4));
  const arrangementInfo: TierArrangementInfo = {
    method: arrangement.method,
    maxMatches: selection.maxMatches,
    tierLimitedSitOuts: 4 * (upperBound - selection.maxMatches),
  };
  const playerTiers: Record<string, PlayerTier> = {};
  for (const id of [...selection.playingIds, ...selection.restingIds]) playerTiers[id] = tierOf(id);

  return {
    id: makeTierId('tier-round', rng),
    roundNumber,
    status: 'draft',
    matches,
    restingPlayerIds: selection.restingIds,
    playerTiers,
    courtsAtGeneration: numberOfCourts,
    createdAt: input.nowMs ?? Date.now(),
    regenerationCount: 0,
    manuallyAdjusted: false,
    arrangement: arrangementInfo,
  };
}

// Order-independent fingerprint of a round's assignments — used to make
// Regenerate Round produce a different arrangement when one exists.
export function tierRoundSignature(round: Pick<TierRound, 'matches' | 'restingPlayerIds'>): string {
  const team = (ids: readonly string[]) => [...ids].sort().join('+');
  const courts = round.matches
    .map((m) => [team(m.teamAPlayerIds), team(m.teamBPlayerIds)].sort().join(' v '))
    .sort();
  return `${courts.join(' | ')} || ${[...round.restingPlayerIds].sort().join(',')}`;
}

// --- Validation -----------------------------------------------------------------

export function matchPlayerIds(match: TierMatch): string[] {
  return [...match.teamAPlayerIds, ...match.teamBPlayerIds];
}

// Every hard rule, checked against the roster as it is now (current tiers
// and availability). Used after every manual swap, by the tests, and as a
// warning on the current round when a live tier/availability change has
// made a saved round conflict.
export function validateTierRound(round: TierRound, players: TierPlayer[], numberOfCourts: number): string[] {
  const issues: string[] = [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const seen = new Set<string>();
  const courtNumbers = new Set<string>();
  for (const match of round.matches) {
    const ids = matchPlayerIds(match);
    const label = matchCourtLabel(match);
    if (ids.length !== 4 || new Set(ids).size !== 4) issues.push(`${label} does not have four different players.`);
    const courtKey = String(match.physicalCourt ?? `#${match.courtNumber}`);
    if (courtNumbers.has(courtKey)) issues.push(`${label} is used twice.`);
    courtNumbers.add(courtKey);
    for (const id of ids) {
      if (seen.has(id)) issues.push(`${name(id)} is assigned more than once.`);
      seen.add(id);
      const player = byId.get(id);
      if (!player) issues.push(`${label} has an unknown player.`);
      else if (!player.available || player.removed) issues.push(`${player.name} is unavailable but assigned to ${label}.`);
    }
    const tiers = ids.map((id) => byId.get(id)?.tier).filter((t): t is PlayerTier => t !== undefined);
    if (!isValidTierMix(tiers)) issues.push(`${label} mixes Top (A) and Lower (C) players.`);
  }
  for (const id of round.restingPlayerIds) {
    if (seen.has(id)) issues.push(`${name(id)} is both playing and sitting out.`);
    seen.add(id);
  }
  if (round.matches.length > numberOfCourts) {
    issues.push(`This round uses ${round.matches.length} courts but only ${numberOfCourts} are available.`);
  }
  return issues;
}

// --- Manual swaps -----------------------------------------------------------------

export type TierSlot = { kind: 'court'; matchIndex: number; team: 'A' | 'B'; position: 0 | 1 } | { kind: 'resting'; index: number };

export function findTierSlot(round: TierRound, playerId: string): TierSlot | null {
  for (let m = 0; m < round.matches.length; m++) {
    const match = round.matches[m];
    for (const team of ['A', 'B'] as const) {
      const ids = team === 'A' ? match.teamAPlayerIds : match.teamBPlayerIds;
      const position = ids.indexOf(playerId);
      if (position !== -1) return { kind: 'court', matchIndex: m, team, position: position as 0 | 1 };
    }
  }
  const index = round.restingPlayerIds.indexOf(playerId);
  return index === -1 ? null : { kind: 'resting', index };
}

export function describeTierSlot(round: TierRound, slot: TierSlot): string {
  return slot.kind === 'resting' ? 'Sitting Out' : matchCourtLabel(round.matches[slot.matchIndex]);
}

export function describeTierMatch(match: TierMatch, players: TierPlayer[]): string {
  const byId = new Map(players.map((p) => [p.id, p]));
  const label = (id: string) => {
    const p = byId.get(id);
    return p ? `${p.name} (${p.tier})` : id;
  };
  return `${matchCourtLabel(match)}: ${match.teamAPlayerIds.map(label).join(' / ')} vs ${match.teamBPlayerIds.map(label).join(' / ')}`;
}

export type TierSwapPlan =
  | { ok: true; round: TierRound; summary: string; before: string[]; after: string[] }
  | { ok: false; reason: string };

function placeAt(round: TierRound, slot: TierSlot, playerId: string) {
  if (slot.kind === 'resting') {
    round.restingPlayerIds[slot.index] = playerId;
    return;
  }
  const match = round.matches[slot.matchIndex];
  const ids = [...(slot.team === 'A' ? match.teamAPlayerIds : match.teamBPlayerIds)] as [string, string];
  ids[slot.position] = playerId;
  round.matches[slot.matchIndex] = slot.team === 'A' ? { ...match, teamAPlayerIds: ids } : { ...match, teamBPlayerIds: ids };
}

// Swaps any two players in an unplayed (draft or active) round: court ↔
// court, within one court (changes partners), or court ↔ sitting out.
// Moving a player to another court is a swap with someone there, since
// every court must keep exactly four. Returns the new round only if every
// hard rule still holds against the current roster.
export function planTierSwap(round: TierRound, playerAId: string, playerBId: string, players: TierPlayer[]): TierSwapPlan {
  if (round.status === 'completed') return { ok: false, reason: 'Completed rounds cannot be changed.' };
  if (playerAId === playerBId) return { ok: false, reason: 'Pick two different players.' };
  const slotA = findTierSlot(round, playerAId);
  const slotB = findTierSlot(round, playerBId);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameA = byId.get(playerAId)?.name ?? playerAId;
  const nameB = byId.get(playerBId)?.name ?? playerBId;
  if (!slotA || !slotB) return { ok: false, reason: 'Both players must be in this round (on a court or sitting out).' };
  if (slotA.kind === 'resting' && slotB.kind === 'resting') return { ok: false, reason: `${nameA} and ${nameB} are both sitting out — swapping them changes nothing.` };
  if (slotA.kind === 'court' && slotB.kind === 'court' && slotA.matchIndex === slotB.matchIndex && slotA.team === slotB.team) {
    return { ok: false, reason: `${nameA} and ${nameB} are already partners — swapping them changes nothing.` };
  }

  // A recorded result belongs to the four players who played it; moving
  // someone onto or off that court would hand it to the wrong people.
  for (const slot of [slotA, slotB]) {
    if (slot.kind === 'court' && round.matches[slot.matchIndex].result) {
      return { ok: false, reason: `${matchCourtLabel(round.matches[slot.matchIndex])} already has a result. Clear the result before swapping players there.` };
    }
  }

  const next: TierRound = {
    ...round,
    matches: round.matches.map((m) => ({ ...m })),
    restingPlayerIds: [...round.restingPlayerIds],
    playerTiers: { ...round.playerTiers },
    manuallyAdjusted: true,
  };
  placeAt(next, slotA, playerBId);
  placeAt(next, slotB, playerAId);

  // Only the courts this swap touched are checked against the hard rules —
  // an unrelated pre-existing conflict (e.g. from a later tier change) must
  // not block a swap that fixes or doesn't touch it.
  const touched = new Set<number>();
  for (const slot of [slotA, slotB]) if (slot.kind === 'court') touched.add(slot.matchIndex);
  for (const m of touched) {
    const match = next.matches[m];
    const ids = matchPlayerIds(match);
    for (const id of ids) {
      const p = byId.get(id);
      if (!p || !p.available || p.removed) {
        return { ok: false, reason: `${p?.name ?? 'That player'} is unavailable and can't be put on ${matchCourtLabel(match)}.` };
      }
    }
    if (!isValidTierMix(ids.map((id) => byId.get(id)!.tier))) {
      return { ok: false, reason: `Not allowed: ${matchCourtLabel(match)} would have Top (A) and Lower (C) players in the same match.` };
    }
  }
  const allIds = [...next.matches.flatMap(matchPlayerIds), ...next.restingPlayerIds];
  if (new Set(allIds).size !== allIds.length) return { ok: false, reason: 'That swap would assign a player twice.' };

  // The round's tier snapshot is refreshed for everyone on the courts this
  // swap touched (exactly the courts just validated against live tiers),
  // plus both swapped players. Refreshing only the two swapped players
  // could leave a courtmate's stale tier from before a live tier change,
  // making history show an A/C court that was valid when played.
  const refresh = new Set<string>([playerAId, playerBId]);
  for (const m of touched) for (const id of matchPlayerIds(next.matches[m])) refresh.add(id);
  for (const id of refresh) {
    const tier = byId.get(id)?.tier;
    if (tier) next.playerTiers[id] = tier;
  }

  const changed = [...touched].sort((x, y) => x - y);
  const before = changed.map((m) => describeTierMatch(round.matches[m], players));
  const after = changed.map((m) => describeTierMatch(next.matches[m], players));
  if (slotA.kind === 'resting' || slotB.kind === 'resting') {
    const resting = slotA.kind === 'resting' ? nameA : nameB;
    const playing = slotA.kind === 'resting' ? nameB : nameA;
    after.push(`Sitting out: ${playing} (instead of ${resting})`);
  }
  return {
    ok: true,
    round: next,
    summary: `${nameA} (${describeTierSlot(round, slotA)}) ↔ ${nameB} (${describeTierSlot(round, slotB)})`,
    before,
    after,
  };
}

// "Court 3" — the physical court a match is on (position for older saves).
export function matchCourtLabel(match: Pick<TierMatch, 'physicalCourt' | 'courtNumber'>): string {
  return match.physicalCourt !== undefined ? `Court ${match.physicalCourt}` : courtLabel(undefined, match.courtNumber);
}
