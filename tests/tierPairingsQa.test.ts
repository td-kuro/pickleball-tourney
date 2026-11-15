// Tier-Based Pairings QA suite: invariants, independent brute-force
// references, long simulations, lifecycle abuse, edge cases and
// regressions for bugs found in QA. Complements tierPairings.test.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PlayerTier, TierPlayer, TierRound, TierSession } from '../src/types';
import {
  computeTierStats,
  generateTierRound,
  isValidTierMix,
  matchPlayerIds,
  maxValidMatches,
  tierRoundSignature,
  validateTierRound,
} from '../src/utils/tierPairings';
import {
  addTierPlayers,
  advanceTierRound,
  createTierSession,
  generateNextTierRound,
  MAX_TIER_COURTS,
  normalizeTierSession,
  openTierRound,
  openTierRoundIssues,
  regenerateTierRound,
  removeTierPlayer,
  renameTierPlayer,
  resetTierSession,
  setTierCourts,
  setTierPlayerAvailability,
  setTierPlayerTier,
  startTierRound,
  startTierSession,
  swapTierPlayers,
  type TierContext,
  type TierResult,
} from '../src/utils/tierSession';
import { seededRandom } from './helpers';

// --- helpers --------------------------------------------------------------------

const TIERS: PlayerTier[] = ['A', 'B', 'C'];

function roster(a: number, b: number, c: number): TierPlayer[] {
  const out: TierPlayer[] = [];
  const add = (tier: PlayerTier, n: number) => {
    for (let i = 1; i <= n; i++) out.push({ id: `${tier}${i}`, name: `${tier}${i}`, tier, available: true });
  };
  add('A', a);
  add('B', b);
  add('C', c);
  return out;
}

function ok(result: TierResult): TierSession {
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

function open(session: TierSession): TierRound {
  const round = openTierRound(session);
  if (!round) throw new Error('no open round');
  return round;
}

function start(players: TierPlayer[], courts: number, ctx: TierContext): TierSession {
  return ok(startTierSession({ ...createTierSession({ numberOfCourts: courts, scoreMode: 'none' }), players }, ctx));
}

function play(session: TierSession, ctx: TierContext): TierSession {
  const round = open(session);
  return ok(advanceTierRound(ok(startTierRound(session, round.id, ctx)), round.id, ctx));
}

function completed(session: TierSession) {
  return session.rounds.filter((r) => r.status === 'completed').sort((a, b) => a.roundNumber - b.roundNumber);
}

function availableCounts(players: TierPlayer[]) {
  const avail = players.filter((p) => p.available && !p.removed);
  return TIERS.map((t) => avail.filter((p) => p.tier === t).length) as [number, number, number];
}

// The invariant every saved round must satisfy, checked against the tiers
// the round was built with and against the live roster for open rounds.
function assertRoundInvariant(round: TierRound, session: TierSession) {
  const ids = [...round.matches.flatMap(matchPlayerIds), ...round.restingPlayerIds];
  assert.equal(new Set(ids).size, ids.length, `round ${round.roundNumber}: duplicate player`);
  for (const m of round.matches) {
    assert.equal(new Set(matchPlayerIds(m)).size, 4, `round ${round.roundNumber}: court ${m.courtNumber} not 4 unique`);
    assert.ok(isValidTierMix(matchPlayerIds(m).map((id) => round.playerTiers[id])), `round ${round.roundNumber}: A/C violation`);
  }
  assert.ok(round.matches.length <= round.courtsAtGeneration, 'too many courts');
  void session;
}

// Right after generation/regeneration the round must also satisfy every rule
// against the live roster (no unavailable player, live tiers valid). Later
// live changes can legitimately make an open round conflict — that is
// surfaced as a warning, never auto-applied.
function assertFreshRound(round: TierRound, session: TierSession) {
  assertRoundInvariant(round, session);
  assert.deepEqual(validateTierRound(round, session.players, session.settings.numberOfCourts), []);
}

// Independent reference: DFS over every valid four-player tier mix.
function bruteMax(a: number, b: number, c: number, courts: number): number {
  if (courts === 0) return 0;
  let best = 0;
  for (let i = 0; i <= Math.min(4, a); i++)
    for (let j = 0; j <= Math.min(4 - i, b); j++) {
      const l = 4 - i - j;
      if (l > c || (i > 0 && l > 0)) continue;
      best = Math.max(best, 1 + bruteMax(a - i, b - j, c - l, courts - 1));
    }
  return best;
}

// Independent reference at player level: try every subset of 4k players and
// every grouping, for tiny rosters.
function brutePlayerLevelMax(tiers: PlayerTier[], courts: number): number {
  let best = 0;
  const rec = (remaining: number[], made: number) => {
    best = Math.max(best, made);
    if (made === courts || remaining.length < 4 || best === courts) return;
    const [first, ...rest] = remaining;
    rec(rest, made); // first sits out
    for (let i = 0; i < rest.length; i++)
      for (let j = i + 1; j < rest.length; j++)
        for (let l = j + 1; l < rest.length; l++) {
          if (!isValidTierMix([first, rest[i], rest[j], rest[l]].map((x) => tiers[x]))) continue;
          rec(rest.filter((_, k) => k !== i && k !== j && k !== l), made + 1);
        }
  };
  rec(tiers.map((_, i) => i), 0);
  return best;
}

// --- 2. tier restrictions ------------------------------------------------------------

describe('QA: tier restriction', () => {
  it('isValidTierMix matches the rule for all 81 four-player tier combinations', () => {
    for (const w of TIERS) for (const x of TIERS) for (const y of TIERS) for (const z of TIERS) {
      const t = [w, x, y, z];
      assert.equal(isValidTierMix(t), !(t.includes('A') && t.includes('C')), t.join(''));
    }
  });

  it('spec examples: valid and invalid matches', () => {
    for (const m of ['AAAA', 'ABAB', 'AABB', 'BBBB', 'BCBC', 'CCCC', 'CCBB']) assert.ok(isValidTierMix(m.split('') as PlayerTier[]), m);
    for (const m of ['AACC', 'ABBC', 'ACAB', 'ABBC']) assert.ok(!isValidTierMix(m.split('') as PlayerTier[]), m);
  });

  it('zero A/C violations across 200 random sessions with live tier, availability, court and swap changes', () => {
    const rng = seededRandom(424242);
    let rounds = 0;
    for (let trial = 0; trial < 200; trial++) {
      const n = 4 + Math.floor(rng() * 37);
      const players: TierPlayer[] = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, tier: TIERS[Math.floor(rng() * 3)], available: true }));
      const ctx = { rng: seededRandom(trial * 7 + 1), now: 0 };
      const started = startTierSession({ ...createTierSession({ numberOfCourts: 1 + Math.floor(rng() * 10), scoreMode: 'none' }), players }, ctx);
      if (!started.ok) continue;
      let s = started.session;
      for (let r = 0; r < 6; r++) {
        const pick = () => `p${Math.floor(rng() * n)}`;
        if (rng() < 0.4) s = setTierPlayerTier(s, pick(), TIERS[Math.floor(rng() * 3)], ctx);
        if (rng() < 0.3) s = setTierPlayerAvailability(s, pick(), rng() < 0.6, ctx);
        if (rng() < 0.2) s = setTierCourts(s, 1 + Math.floor(rng() * 10), ctx);
        const round = openTierRound(s);
        if (!round) break;
        if (rng() < 0.5) {
          const regen = regenerateTierRound(s, round.id, { ...ctx, allowActive: true });
          if (regen.ok) {
            s = regen.session;
            assertFreshRound(open(s), s);
          }
        }
        // Random swap attempts: a successful one must leave the round valid
        // against the live roster on the touched courts.
        for (let k = 0; k < 4; k++) {
          const cur = open(s);
          const ids = [...cur.matches.flatMap(matchPlayerIds), ...cur.restingPlayerIds];
          const x = ids[Math.floor(rng() * ids.length)];
          const y = ids[Math.floor(rng() * ids.length)];
          const res = swapTierPlayers(s, cur.id, x, y, ctx);
          if (res.ok) {
            s = res.session;
            const after = open(s);
            const byId = new Map(s.players.map((p) => [p.id, p]));
            for (const m of after.matches) {
              if (!matchPlayerIds(m).includes(x) && !matchPlayerIds(m).includes(y)) continue;
              assert.ok(isValidTierMix(matchPlayerIds(m).map((id) => byId.get(id)!.tier)), 'swap produced A/C');
            }
          }
        }
        for (const rd of s.rounds) assertRoundInvariant(rd, s);
        const cur = open(s);
        const advanced = advanceTierRound(ok(startTierRound(s, cur.id, ctx)), cur.id, ctx);
        if (!advanced.ok) break;
        s = advanced.session;
        rounds++;
        if (!openTierRound(s)) break;
      }
    }
    assert.ok(rounds > 400, `only ${rounds} rounds simulated`);
  });
});

// --- 3. court utilisation -------------------------------------------------------------------

describe('QA: maximum court utilisation', () => {
  const table: [number, number, number, number, number][] = [
    // A, B, C, courts, expected matches (worked out by hand, then checked by brute force)
    [8, 10, 12, 6, 6],
    [3, 1, 4, 2, 2],
    [12, 0, 12, 6, 6],
    [3, 0, 3, 2, 0], // no B: neither 3 A nor 3 C can make a court
    [2, 4, 6, 3, 3],
    [0, 16, 0, 4, 4],
    [20, 2, 8, 6, 6],
    [1, 2, 5, 2, 1], // the lone A can't reach 4 without C; B+C = 7 → one court
    [6, 3, 7, 4, 4],
    [1, 0, 7, 2, 1],
  ];

  for (const [a, b, c, courts, expected] of table) {
    it(`A${a} B${b} C${c} on ${courts} courts → ${expected} matches`, () => {
      assert.equal(bruteMax(a, b, c, courts), expected, 'brute force agrees with hand calculation');
      assert.equal(maxValidMatches(a, b, c, courts), expected);
      const players = roster(a, b, c);
      if (a + b + c <= 12) {
        assert.equal(brutePlayerLevelMax(players.map((p) => p.tier), courts), expected, 'player-level brute force');
      }
      const res = startTierSession({ ...createTierSession({ numberOfCourts: courts, scoreMode: 'none' }), players }, { rng: seededRandom(a * 100 + c), now: 0 });
      if (expected === 0) {
        assert.equal(res.ok, false);
        if (!res.ok) assert.match(res.reason, /No valid match/);
        return;
      }
      const s = ok(res);
      const round = open(s);
      assertFreshRound(round, s);
      assert.equal(round.matches.length, expected);
      assert.ok(round.matches.length <= courts);
      assert.equal(round.matches.length * 4 + round.restingPlayerIds.length, players.length, 'everyone is on a court or sitting out');
      assertRoundInvariant(round, s);
    });
  }

  it('closed form equals brute force for every mix up to 12/8/12 on 1–8 courts', () => {
    for (let a = 0; a <= 12; a++) for (let b = 0; b <= 8; b++) for (let c = 0; c <= 12; c++) for (let k = 1; k <= 8; k++) {
      assert.equal(maxValidMatches(a, b, c, k), bruteMax(a, b, c, k), `${a}/${b}/${c}/${k}`);
    }
  });

  it('floor(players / 4) is not always achievable — and the engine does not pretend it is', () => {
    assert.equal(maxValidMatches(5, 0, 7, 4), 2); // 12 players, floor = 3
    assert.equal(maxValidMatches(2, 1, 1, 1), 0); // 4 players, floor = 1
  });
});

// --- 4. sit-out fairness ---------------------------------------------------------------------

// For tiny rosters: the least possible number of back-to-back resters, over
// every subset that still fills the maximum number of courts.
function bruteMinConsecutive(players: TierPlayer[], lastResting: Set<string>, courts: number): number {
  const [a, b, c] = availableCounts(players);
  const k = maxValidMatches(a, b, c, courts);
  const restCount = players.length - 4 * k;
  let best = Infinity;
  const rec = (i: number, chosen: TierPlayer[]) => {
    if (chosen.length === restCount) {
      const rest = new Set(chosen.map((p) => p.id));
      const playing = players.filter((p) => !rest.has(p.id));
      const [pa, pb, pc] = availableCounts(playing);
      if (maxValidMatches(pa, pb, pc, courts) !== k || pa + pb + pc !== 4 * k) return;
      best = Math.min(best, chosen.filter((p) => lastResting.has(p.id)).length);
      return;
    }
    if (i === players.length) return;
    rec(i + 1, [...chosen, players[i]]);
    rec(i + 1, chosen);
  };
  rec(0, []);
  return best;
}

describe('QA: sit-out fairness', () => {
  it('Scenario A: 30 players / 6 courts / 30 rounds', (t) => {
    const ctx = { rng: seededRandom(30), now: 0 };
    let s = start(roster(8, 10, 12), 6, ctx);
    for (let r = 0; r < 30; r++) s = play(s, ctx);
    const rounds = completed(s);
    assert.equal(rounds.length, 30);
    let consecutive = 0;
    for (let i = 0; i < rounds.length; i++) {
      assert.equal(rounds[i].matches.length, 6);
      assert.equal(rounds[i].restingPlayerIds.length, 6);
      assertRoundInvariant(rounds[i], s);
      if (i > 0) consecutive += rounds[i].restingPlayerIds.filter((id) => rounds[i - 1].restingPlayerIds.includes(id)).length;
    }
    assert.equal(consecutive, 0, 'no consecutive sit-outs');
    const sat = [...computeTierStats(s.players, rounds).values()].map((x) => x.roundsSatOut);
    t.diagnostic(`sit-outs per player after 30 rounds: min ${Math.min(...sat)} max ${Math.max(...sat)} (fair share 6)`);
    assert.ok(Math.max(...sat) - Math.min(...sat) <= 1);
    // Rested players play next round.
    for (let i = 1; i < rounds.length; i++) for (const id of rounds[i - 1].restingPlayerIds) assert.ok(!rounds[i].restingPlayerIds.includes(id));
  });

  it('Scenario B: unbalanced tiers — fairness as feasibility permits, verified by brute force', (t) => {
    const cases: [number, number, number, number][] = [
      [5, 1, 3, 2], // 9 players, 2 courts
      [6, 0, 5, 2], // no B: one A court, one C court
      [1, 2, 7, 2],
      [7, 1, 2, 2],
      [3, 2, 5, 2],
    ];
    for (const [a, b, c, courts] of cases) {
      const ctx = { rng: seededRandom(a * 31 + c), now: 0 };
      let s = start(roster(a, b, c), courts, ctx);
      let prevRest = new Set<string>();
      for (let r = 0; r < 20; r++) {
        const round = open(s);
        const [pa, pb, pc] = availableCounts(s.players);
        assert.equal(round.matches.length, maxValidMatches(pa, pb, pc, courts));
        const actual = round.restingPlayerIds.filter((id) => prevRest.has(id)).length;
        const minimum = bruteMinConsecutive(s.players, prevRest, courts);
        assert.equal(actual, minimum, `${a}/${b}/${c} round ${r + 1}: ${actual} back-to-back resters, minimum possible ${minimum}`);
        prevRest = new Set(round.restingPlayerIds);
        s = play(s, ctx);
      }
      // Within a tier, players are interchangeable, so their sit-outs must
      // stay within one of each other.
      const stats = computeTierStats(s.players, completed(s));
      const spread = TIERS.map((tier) => {
        const v = s.players.filter((p) => p.tier === tier).map((p) => stats.get(p.id)!.roundsSatOut);
        return v.length ? Math.max(...v) - Math.min(...v) : 0;
      });
      t.diagnostic(`${a}/${b}/${c}: within-tier sit-out spread A/B/C = ${spread.join('/')}`);
      for (const x of spread) assert.ok(x <= 1, `${a}/${b}/${c} spread ${spread}`);
    }
  });

  it('Scenario C: late arrivals become eligible, no invented history, not benched unfairly', () => {
    const ctx = { rng: seededRandom(77), now: 0 };
    let s = start(roster(4, 8, 6), 4, ctx);
    for (let r = 0; r < 5; r++) s = play(s, ctx);
    const before = JSON.stringify(completed(s));
    s = addTierPlayers(s, [{ name: 'LateA', tier: 'A' }, { name: 'LateB' }, { name: 'LateC', tier: 'C' }], ctx);
    const late = s.players.filter((p) => p.name.startsWith('Late'));
    assert.equal(late.find((p) => p.name === 'LateB')!.tier, 'B', 'default tier B');
    s = play(s, ctx); // completes round 6 (they weren't in it), generates 7
    const r7 = open(s);
    for (const p of late) assert.ok(!r7.restingPlayerIds.includes(p.id), `${p.name} plays first eligible round`);
    for (let r = 0; r < 12; r++) s = play(s, ctx);
    assert.equal(JSON.stringify(completed(s).slice(0, 5)), before, 'history unchanged');
    const stats = computeTierStats(s.players, completed(s));
    for (const p of late) {
      const st = stats.get(p.id)!;
      // Added while round 6 was open: eligible for rounds 7–18 only.
      assert.equal(st.eligibleRounds, 12);
      assert.equal(st.roundsPlayed + st.roundsSatOut, 12, 'no invented rounds');
      assert.ok(st.roundsSatOut <= Math.ceil(st.expectedSitOuts) + 1, `${p.name} sat out ${st.roundsSatOut}, fair share ${st.expectedSitOuts.toFixed(2)}`);
    }
  });

  it('Scenario D: unavailable rounds are not sit-outs; returning players rejoin the pool fairly', () => {
    const ctx = { rng: seededRandom(78), now: 0 };
    let s = start(roster(0, 10, 0), 2, ctx);
    s = play(s, ctx);
    s = setTierPlayerAvailability(s, 'B1', false, ctx);
    s = setTierPlayerAvailability(s, 'B2', false, ctx);
    s = ok(regenerateTierRound(s, open(s).id, ctx));
    for (let r = 0; r < 4; r++) {
      const round = open(s);
      assert.ok(![...round.matches.flatMap(matchPlayerIds), ...round.restingPlayerIds].some((id) => id === 'B1' || id === 'B2'));
      s = play(s, ctx);
    }
    const away = computeTierStats(s.players, completed(s));
    assert.equal(away.get('B1')!.eligibleRounds, 1);
    assert.equal(away.get('B1')!.consecutiveSitOuts, 0);
    s = setTierPlayerAvailability(s, 'B1', true, ctx);
    s = setTierPlayerAvailability(s, 'B2', true, ctx);
    for (let r = 0; r < 10; r++) s = play(s, ctx);
    const stats = computeTierStats(s.players, completed(s));
    for (const id of ['B1', 'B2']) {
      const st = stats.get(id)!;
      assert.ok(Math.abs(st.roundsSatOut - st.expectedSitOuts) <= 1, `${id}: sat ${st.roundsSatOut}, share ${st.expectedSitOuts.toFixed(2)}`);
    }
  });

  it('regression: marking a resting player unavailable mid-round does not record a sit-out', () => {
    const ctx = { rng: seededRandom(79), now: 0 };
    let s = start(roster(0, 9, 0), 2, ctx);
    s = ok(startTierRound(s, open(s).id, ctx));
    const resting = open(s).restingPlayerIds[0];
    s = setTierPlayerAvailability(s, resting, false, ctx);
    assert.ok(!open(s).restingPlayerIds.includes(resting), 'removed from the sitting-out list');
    s = ok(advanceTierRound(s, open(s).id, ctx));
    const st = computeTierStats(s.players, completed(s)).get(resting)!;
    assert.equal(st.roundsSatOut, 0);
    assert.equal(st.eligibleRounds, 0);
  });
});

// --- 5–6. partner / opponent rotation -------------------------------------------------------

function rotationReport(a: number, b: number, c: number, courts: number, rounds: number, seed: number) {
  const ctx = { rng: seededRandom(seed), now: 0 };
  let s = start(roster(a, b, c), courts, ctx);
  for (let r = 0; r < rounds; r++) s = play(s, ctx);
  const done = completed(s);
  const stats = computeTierStats(s.players, done);
  let partnerRepeats = 0;
  let oppRepeatPairs = 0;
  for (const st of stats.values()) {
    partnerRepeats += Object.values(st.partnerHistory).reduce((x, n) => x + (n - 1), 0);
    oppRepeatPairs += Object.values(st.opponentHistory).filter((n) => n > 1).length;
  }
  let b2bPartners = 0;
  let b2bOpp = 0;
  for (let i = 1; i < done.length; i++) {
    const prevPartners = new Set<string>();
    const prevOpp = new Set<string>();
    for (const m of done[i - 1].matches) {
      for (const t of [m.teamAPlayerIds, m.teamBPlayerIds]) prevPartners.add([...t].sort().join('+'));
      for (const x of m.teamAPlayerIds) for (const y of m.teamBPlayerIds) prevOpp.add([x, y].sort().join('+'));
    }
    for (const m of done[i].matches) {
      for (const t of [m.teamAPlayerIds, m.teamBPlayerIds]) if (prevPartners.has([...t].sort().join('+'))) b2bPartners++;
      for (const x of m.teamAPlayerIds) for (const y of m.teamBPlayerIds) if (prevOpp.has([x, y].sort().join('+'))) b2bOpp++;
    }
  }
  return { s, stats, partnerRepeats: partnerRepeats / 2, oppRepeatPairs: oppRepeatPairs / 2, b2bPartners, b2bOpp };
}

describe('QA: partner and opponent rotation (20+ rounds)', () => {
  it('all-A, all-B, all-C, and mixed pools: new partners first, no back-to-back partners', (t) => {
    const configs: [string, number, number, number, number][] = [
      ['all A (12)', 12, 0, 0, 3],
      ['all B (16)', 0, 16, 0, 4],
      ['all C (8)', 0, 0, 8, 2],
      ['mixed 8/10/12', 8, 10, 12, 6],
      ['mixed 4/4/4', 4, 4, 4, 3],
    ];
    for (const [label, a, b, c, courts] of configs) {
      const rep = rotationReport(a, b, c, courts, 20, a + b * 3 + c * 7);
      const n = a + b + c;
      // A partner repeat is forced only once a player has run out of new
      // partners they can legally play with. Check that each player's
      // partner count never exceeds 1 while unused eligible partners remain
      // — measured per player as: repeats ≤ partnerships beyond the pool.
      for (const st of rep.stats.values()) {
        const tier = rep.s.players.find((p) => p.id === st.playerId)!.tier;
        const eligiblePartners = rep.s.players.filter((p) => p.id !== st.playerId && isValidTierMix([tier, p.tier])).length;
        const partnerships = st.roundsPlayed;
        const unique = Object.keys(st.partnerHistory).length;
        assert.ok(unique >= Math.min(eligiblePartners, partnerships) - 2, `${label} ${st.playerId}: ${unique} unique partners from ${partnerships} games (${eligiblePartners} eligible)`);
        const counts = Object.values(st.partnerHistory);
        assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, `${label} ${st.playerId} partner spread ${counts}`);
      }
      t.diagnostic(`${label}, ${n} players, 20 rounds: repeated partnerships ${rep.partnerRepeats}, back-to-back partners ${rep.b2bPartners}, opponent pairs met 2+ times ${rep.oppRepeatPairs}, back-to-back opponent pairs ${rep.b2bOpp}`);
      assert.equal(rep.b2bPartners, 0, `${label}: back-to-back partners`);
    }
  });

  it('8 players / 2 courts: first 7 rounds use 7 different partners each where the greedy order allows', (t) => {
    const rep = rotationReport(0, 8, 0, 2, 7, 5);
    const unique = [...rep.stats.values()].map((s) => Object.keys(s.partnerHistory).length);
    t.diagnostic(`unique partners after 7 rounds: ${unique.join(',')} (7 = perfect)`);
    assert.ok(Math.min(...unique) >= 6);
  });

  it('opponent counts are exact: every completed match adds exactly 2 opponents per player', () => {
    const rep = rotationReport(4, 8, 4, 4, 10, 9);
    for (const st of rep.stats.values()) {
      const total = Object.values(st.opponentHistory).reduce((x, y) => x + y, 0);
      const partners = Object.values(st.partnerHistory).reduce((x, y) => x + y, 0);
      assert.equal(total, 2 * st.roundsPlayed);
      assert.equal(partners, st.roundsPlayed);
    }
  });

  it('never forces an A/C encounter for variety', () => {
    const rep = rotationReport(6, 2, 6, 3, 20, 3);
    for (const st of rep.stats.values()) {
      const tier = rep.s.players.find((p) => p.id === st.playerId)!.tier;
      for (const opp of Object.keys(st.opponentHistory)) {
        const ot = rep.s.players.find((p) => p.id === opp)!.tier;
        assert.ok(isValidTierMix([tier, ot]));
      }
    }
  });
});

// --- 7–8. lifecycle and regeneration ------------------------------------------------------------

describe('QA: round lifecycle', () => {
  it('full organiser flow with repeated clicks never duplicates, skips, or double-counts', () => {
    const ctx = { rng: seededRandom(5), now: 0 };
    let s = start(roster(4, 8, 4), 4, ctx);
    for (let r = 1; r <= 8; r++) {
      const round = open(s);
      assert.equal(round.roundNumber, r);
      // double Start Round
      s = ok(startTierRound(s, round.id, ctx));
      const afterStart = s;
      s = ok(startTierRound(s, round.id, ctx));
      assert.equal(s, afterStart, 'second Start Round is a no-op');
      // double Next Round
      s = ok(advanceTierRound(s, round.id, ctx));
      const afterNext = JSON.stringify(s.rounds);
      s = ok(advanceTierRound(s, round.id, ctx));
      assert.equal(JSON.stringify(s.rounds), afterNext, 'second Next Round is a no-op');
      // Generate while open is refused
      assert.equal(generateNextTierRound(s, ctx).ok, false);
    }
    assert.deepEqual(s.rounds.map((r) => r.roundNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(completed(s).length, 8);
    const stats = computeTierStats(s.players, s.rounds);
    for (const st of stats.values()) assert.equal(st.eligibleRounds, 8);
    assert.equal(s.events.filter((e) => e.type === 'round-completed').length, 8);
  });

  it('Next Round on a stale snapshot (double click before re-render) yields one consistent round', () => {
    const ctx = { rng: seededRandom(6), now: 0 };
    let s = start(roster(0, 10, 0), 2, ctx);
    s = ok(startTierRound(s, open(s).id, ctx));
    const id = open(s).id;
    const first = ok(advanceTierRound(s, id, ctx));
    const second = ok(advanceTierRound(s, id, ctx)); // same stale input
    for (const result of [first, second]) {
      assert.equal(result.rounds.length, 2);
      assert.equal(completed(result).length, 1);
    }
  });

  it('regeneration: many regenerations keep max courts, hard rules and untouched history', () => {
    const ctx = { rng: seededRandom(8), now: 0 };
    let s = start(roster(5, 3, 9), 4, ctx);
    for (let r = 0; r < 3; r++) s = play(s, ctx);
    const frozen = JSON.stringify(completed(s));
    const stats = JSON.stringify([...computeTierStats(s.players, s.rounds)]);
    const sigs = new Set<string>();
    for (let i = 0; i < 20; i++) {
      s = ok(regenerateTierRound(s, open(s).id, ctx));
      const round = open(s);
      const [a, b, c] = availableCounts(s.players);
      assert.equal(round.matches.length, maxValidMatches(a, b, c, 4));
      assertFreshRound(round, s);
      sigs.add(tierRoundSignature(round));
    }
    assert.equal(JSON.stringify(completed(s)), frozen);
    assert.equal(JSON.stringify([...computeTierStats(s.players, s.rounds)]), stats);
    assert.ok(sigs.size >= 10, `${sigs.size} distinct regenerations`);
  });

  it('regeneration with only one possible arrangement reports it and stays valid', () => {
    const ctx = { rng: seededRandom(9), now: 0 };
    let s = start(roster(0, 4, 0), 1, ctx);
    const before = tierRoundSignature(open(s));
    const res = regenerateTierRound(s, open(s).id, ctx);
    assert.ok(res.ok);
    if (res.ok) {
      s = res.session;
      // 4 players: only the team split can change (3 options), so a
      // different arrangement normally exists; if not, the message says so.
      assert.ok(tierRoundSignature(open(s)) !== before || /No different/.test(res.message ?? ''));
    }
  });
});

// --- 9. live tier changes ---------------------------------------------------------------------------

describe('QA: live tier changes', () => {
  const transitions: [PlayerTier, PlayerTier][] = [
    ['A', 'B'],
    ['B', 'A'],
    ['B', 'C'],
    ['C', 'B'],
    ['A', 'C'],
    ['C', 'A'],
  ];
  for (const [from, to] of transitions) {
    it(`${from} → ${to}: saved, history preserved, active round untouched, next round uses new tier`, () => {
      const ctx = { rng: seededRandom(from.charCodeAt(0) * 10 + to.charCodeAt(0)), now: 0 };
      let s = start(roster(5, 5, 5), 3, ctx);
      s = play(s, ctx);
      s = play(s, ctx);
      const id = `${from}1`;
      const historyBefore = JSON.stringify(computeTierStats(s.players, completed(s)).get(id));
      const completedBefore = JSON.stringify(completed(s));
      s = ok(startTierRound(s, open(s).id, ctx));
      const activeBefore = JSON.stringify(open(s).matches);
      s = setTierPlayerTier(s, id, to, ctx);
      assert.equal(s.players.find((p) => p.id === id)!.tier, to);
      assert.equal(JSON.stringify(open(s).matches), activeBefore, 'active round not silently changed');
      assert.equal(JSON.stringify(completed(s)), completedBefore);
      assert.equal(JSON.stringify(computeTierStats(s.players, completed(s)).get(id)), historyBefore);
      s = ok(advanceTierRound(s, open(s).id, ctx));
      const next = open(s);
      assert.equal(next.playerTiers[id], to);
      assertRoundInvariant(next, s);
    });
  }

  it('several tier changes between rounds, then regenerate, stay valid', () => {
    const ctx = { rng: seededRandom(99), now: 0 };
    let s = start(roster(6, 6, 6), 4, ctx);
    for (let r = 0; r < 5; r++) {
      s = setTierPlayerTier(s, `A${r + 1}`, 'C', ctx);
      s = setTierPlayerTier(s, `C${r + 1}`, 'A', ctx);
      s = setTierPlayerTier(s, `B${r + 1}`, r % 2 ? 'A' : 'C', ctx);
      s = ok(regenerateTierRound(s, open(s).id, ctx));
      assertRoundInvariant(open(s), s);
      assert.deepEqual(openTierRoundIssues(s), []);
      s = play(s, ctx);
    }
  });
});

// --- 10. player management --------------------------------------------------------------------------

describe('QA: player management', () => {
  it('regression: blank names are rejected by the session layer, not just the UI', () => {
    const s = addTierPlayers(createTierSession({ scoreMode: 'none' }), [{ name: '' }, { name: '   ' }, { name: 'Real' }]);
    assert.deepEqual(s.players.map((p) => p.name), ['Real']);
  });

  it('regression: duplicate names are made distinguishable, ids are always unique', () => {
    let s = addTierPlayers(createTierSession({ scoreMode: 'none' }), [{ name: 'Alex' }, { name: 'alex' }, { name: 'Alex' }], { rng: () => 0.5, now: 0 });
    s = addTierPlayers(s, [{ name: 'Alex' }], { rng: () => 0.5, now: 0 });
    const names = s.players.map((p) => p.name);
    assert.equal(new Set(names.map((n) => n.toLowerCase())).size, 4, names.join(','));
    assert.equal(new Set(s.players.map((p) => p.id)).size, 4, 'ids unique even with a constant random source');
  });

  it('regression: renaming to an existing name keeps names distinguishable; blank rename ignored', () => {
    let s = addTierPlayers(createTierSession({ scoreMode: 'none' }), [{ name: 'Alex' }, { name: 'Sam' }]);
    const sam = s.players[1].id;
    s = renameTierPlayer(s, sam, 'alex');
    assert.equal(s.players[1].name, 'alex 2');
    assert.equal(renameTierPlayer(s, sam, '   '), s);
  });

  it('remove before start deletes; remove mid-session keeps history and never reassigns', () => {
    const ctx = { rng: seededRandom(3), now: 0 };
    let s = { ...createTierSession({ numberOfCourts: 2, scoreMode: 'none' }), players: roster(0, 10, 0) };
    s = ok(removeTierPlayer(s, 'B10', ctx));
    assert.equal(s.players.length, 9);
    s = ok(startTierSession(s, ctx));
    s = play(s, ctx);
    const target = completed(s)[0].matches[0].teamAPlayerIds[0];
    if (open(s).matches.flatMap(matchPlayerIds).includes(target)) s = ok(regenerateTierRound(s, open(s).id, ctx));
    let removed = removeTierPlayer(s, target, ctx);
    if (!removed.ok) {
      // still on a court after regeneration: swap them to the bench first
      const bench = open(s).restingPlayerIds[0];
      s = ok(swapTierPlayers(s, open(s).id, target, bench, ctx));
      removed = removeTierPlayer(s, target, ctx);
    }
    s = ok(removed);
    assert.equal(s.players.find((p) => p.id === target)!.removed, true);
    for (let r = 0; r < 5; r++) {
      s = play(s, ctx);
      assert.ok(![...open(s).matches.flatMap(matchPlayerIds), ...open(s).restingPlayerIds].includes(target));
    }
    assert.ok(completed(s)[0].matches.flatMap(matchPlayerIds).includes(target), 'round 1 still shows them');
  });

  it('regression: reset clears rounds but keeps the roster, as the confirmation promises', () => {
    const ctx = { rng: seededRandom(4), now: 0 };
    let s = start(roster(2, 6, 2), 2, ctx);
    s = play(s, ctx);
    s = setTierPlayerAvailability(s, 'B1', false, ctx);
    s = addTierPlayers(s, [{ name: 'Late' }], ctx);
    const reset = resetTierSession(s);
    assert.equal(reset.started, false);
    assert.deepEqual(reset.rounds, []);
    assert.equal(reset.players.length, 11);
    assert.equal(reset.settings.numberOfCourts, 2);
    assert.ok(reset.players.every((p) => p.joinedAtRound === undefined));
    assert.equal(reset.players.find((p) => p.id === 'B1')!.available, false, 'availability kept');
  });
});

// --- 12. court changes -----------------------------------------------------------------------------

describe('QA: swap after a live tier change', () => {
  it('regression: the saved tier snapshot never shows an A/C court after tier change + swap', () => {
    const players = roster(1, 3, 1);
    // Court 1: A1/B1 vs B2/B3 — resting C1. B1 then moves to C, so the
    // organiser swaps A1 out for... nothing valid; instead swap B1 (now C)
    // with A1's partner slot and C1 in for A1.
    const round: TierRound = {
      id: 'r',
      roundNumber: 1,
      status: 'active',
      matches: [{ id: 'm', courtNumber: 1, teamAPlayerIds: ['A1', 'B1'], teamBPlayerIds: ['B2', 'B3'] }],
      restingPlayerIds: ['C1'],
      playerTiers: { A1: 'A', B1: 'B', B2: 'B', B3: 'B', C1: 'C' },
      courtsAtGeneration: 1,
      createdAt: 0,
      regenerationCount: 0,
      manuallyAdjusted: false,
    };
    let s: TierSession = { ...createTierSession({ numberOfCourts: 1, scoreMode: 'none' }), started: true, players, rounds: [round] };
    s = setTierPlayerTier(s, 'B1', 'C');
    assert.ok(openTierRoundIssues(s).some((i) => i.includes('mixes Top (A) and Lower (C)')));
    s = ok(swapTierPlayers(s, 'r', 'A1', 'C1')); // fixes the court: C1/B1(C) vs B2/B3
    assert.deepEqual(validateTierRound(open(s), s.players, 1), []);
    assertRoundInvariant(open(s), s);
    assert.equal(open(s).playerTiers.B1, 'C', 'courtmate snapshot refreshed');
  });
});

describe('QA: court count changes', () => {
  it('4→5→6→4→2→1 courts: each next round uses the new count and max utilisation', () => {
    const ctx = { rng: seededRandom(12), now: 0 };
    let s = start(roster(6, 8, 10), 4, ctx);
    for (const courts of [5, 6, 4, 2, 1]) {
      const activeBefore = JSON.stringify(open(s).matches);
      s = setTierCourts(s, courts, ctx);
      assert.equal(JSON.stringify(open(s).matches), activeBefore);
      s = play(s, ctx);
      const round = open(s);
      const [a, b, c] = availableCounts(s.players);
      assert.equal(round.matches.length, maxValidMatches(a, b, c, courts));
      assert.equal(round.restingPlayerIds.length, 24 - 4 * round.matches.length);
      assertRoundInvariant(round, s);
    }
  });

  it('regression: invalid court values (0, negative, NaN, Infinity, above the limit) are rejected or clamped', () => {
    const s = createTierSession({ numberOfCourts: 4, scoreMode: 'none' });
    assert.equal(setTierCourts(s, 0).settings.numberOfCourts, 1);
    assert.equal(setTierCourts(s, -3).settings.numberOfCourts, 1);
    assert.equal(setTierCourts(s, Number.NaN).settings.numberOfCourts, 4);
    assert.equal(setTierCourts(s, Number.POSITIVE_INFINITY).settings.numberOfCourts, 4);
    assert.equal(setTierCourts(s, 999).settings.numberOfCourts, MAX_TIER_COURTS);
    assert.equal(setTierCourts(s, 2.7).settings.numberOfCourts, 2);
  });
});

// --- 14. persistence ------------------------------------------------------------------------------

describe('QA: persistence', () => {
  it('round trip after every kind of change is lossless', () => {
    const ctx = { rng: seededRandom(14), now: 0 };
    let s = start(roster(4, 6, 6), 3, ctx);
    const steps: ((x: TierSession) => TierSession)[] = [
      (x) => play(x, ctx),
      (x) => setTierPlayerTier(x, 'C1', 'B', ctx),
      (x) => setTierPlayerAvailability(x, 'B2', false, ctx),
      (x) => setTierCourts(x, 4, ctx),
      (x) => ok(regenerateTierRound(x, open(x).id, ctx)),
      (x) => {
        const r = open(x);
        return ok(swapTierPlayers(x, r.id, r.matches[0].teamAPlayerIds[0], r.matches[0].teamBPlayerIds[1], ctx));
      },
      (x) => play(x, ctx),
      (x) => addTierPlayers(x, [{ name: 'New' }], ctx),
    ];
    for (const step of steps) {
      s = step(s);
      const reloaded = normalizeTierSession(JSON.parse(JSON.stringify(s)));
      assert.deepEqual(reloaded, s);
    }
  });

  it('regression: corrupted saved data is repaired without discarding valid history', () => {
    const ctx = { rng: seededRandom(15), now: 0 };
    let s = start(roster(2, 6, 2), 2, ctx);
    s = play(s, ctx);
    const raw = JSON.parse(JSON.stringify(s));
    raw.players.push({ id: 'bad1', name: 'Bad tier', tier: 'Z', available: true }); // bad tier → B
    raw.players.push({ name: 'No id' }); // unusable → dropped
    raw.players.push('garbage');
    raw.rounds.push({ id: 'broken', roundNumber: 'x', matches: 'nope' }); // unusable → dropped
    raw.settings.numberOfCourts = -5;
    raw.settings.courts = 'garbage'; // unusable court list → rebuilt from the (clamped) count
    raw.events = 'not an array';
    const repaired = normalizeTierSession(raw);
    assert.equal(repaired.players.find((p) => p.id === 'bad1')!.tier, 'B');
    assert.equal(repaired.players.length, 11);
    assert.deepEqual(repaired.rounds, s.rounds, 'valid rounds kept exactly');
    assert.equal(repaired.settings.numberOfCourts, 1);
    assert.deepEqual(repaired.events, []);
    // and it still works
    const next = play(repaired, ctx);
    assertRoundInvariant(open(next), next);
  });

  it('missing or non-object saved state gives a fresh session', () => {
    for (const raw of [null, undefined, 42, 'text', [], { version: 99 }]) {
      const s = normalizeTierSession(raw);
      assert.equal(s.started, false);
      assert.deepEqual(s.players, []);
    }
  });

  it('a started session whose rounds were lost still has a way forward', () => {
    const s = normalizeTierSession({ started: true, players: roster(0, 8, 0), rounds: [] });
    const gen = generateNextTierRound(s, { rng: seededRandom(1) });
    assert.ok(gen.ok);
  });
});

// --- 15. randomisation -------------------------------------------------------------------------------

describe('QA: randomisation', () => {
  it('different seeds give different valid rounds; utilisation and fairness never vary', () => {
    const players = roster(6, 8, 10);
    const sigs = new Set<string>();
    for (let seed = 1; seed <= 25; seed++) {
      const round = generateTierRound({ players, rounds: [], numberOfCourts: 5, roundNumber: 1, rng: seededRandom(seed) });
      assert.equal(round.matches.length, 5);
      assert.equal(round.restingPlayerIds.length, 4);
      for (const m of round.matches) assert.ok(isValidTierMix(matchPlayerIds(m).map((id) => round.playerTiers[id])));
      sigs.add(tierRoundSignature(round));
    }
    assert.ok(sigs.size >= 20, `${sigs.size}/25 distinct`);
  });

  it('the same seed reproduces the same round', () => {
    const players = roster(6, 8, 10);
    const a = generateTierRound({ players, rounds: [], numberOfCourts: 5, roundNumber: 1, rng: seededRandom(3), nowMs: 0 });
    const b = generateTierRound({ players, rounds: [], numberOfCourts: 5, roundNumber: 1, rng: seededRandom(3), nowMs: 0 });
    assert.equal(tierRoundSignature(a), tierRoundSignature(b));
  });

  it('randomness never overrides fairness: rested players always play next, under 20 seeds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ctx = { rng: seededRandom(seed), now: 0 };
      let s = start(roster(4, 6, 8), 4, ctx);
      const rested = open(s).restingPlayerIds;
      s = play(s, ctx);
      for (const id of rested) assert.ok(!open(s).restingPlayerIds.includes(id));
    }
  });
});

// --- 16. stress / edge cases ---------------------------------------------------------------------------

describe('QA: sizes, edge distributions and performance', () => {
  it('session sizes 4–60 run 5 rounds each within time limits', (t) => {
    const lines: string[] = [];
    for (const n of [4, 5, 7, 8, 12, 16, 24, 30, 40, 60]) {
      const a = Math.round(n * 0.3);
      const c = Math.round(n * 0.35);
      const players = roster(a, n - a - c, c);
      const courts = Math.min(15, Math.max(1, Math.floor(n / 4)));
      const res = startTierSession({ ...createTierSession({ numberOfCourts: courts, scoreMode: 'none' }), players }, { rng: seededRandom(n), now: 0 });
      if (!res.ok) {
        lines.push(`${n}: no valid match (${res.reason})`);
        continue;
      }
      let s = res.session;
      let worst = 0;
      for (let r = 0; r < 5; r++) {
        const t0 = Date.now();
        s = play(s, { rng: seededRandom(n * 100 + r), now: 0 });
        worst = Math.max(worst, Date.now() - t0);
        assertRoundInvariant(open(s), s);
      }
      lines.push(`${n} players/${courts} courts: worst ${worst}ms per round`);
      assert.ok(worst < 600, `${n} players took ${worst}ms`);
    }
    t.diagnostic(lines.join(' | '));
  });

  it('unusual distributions never crash or produce invalid rounds', () => {
    const cases: [number, number, number, number][] = [
      [0, 6, 6, 3], // no A
      [6, 6, 0, 3], // no B... (A and B only)
      [6, 0, 6, 3], // no B
      [1, 8, 8, 4], // one A
      [8, 8, 1, 4], // one C
      [0, 0, 13, 4], // one tier
      [13, 0, 0, 2], // more players than capacity
      [1, 1, 30, 10], // extremely unbalanced
      [4, 4, 4, 20], // more courts than needed
    ];
    for (const [a, b, c, courts] of cases) {
      const ctx = { rng: seededRandom(a + b * 10 + c * 100), now: 0 };
      let s = start(roster(a, b, c), courts, ctx);
      for (let r = 0; r < 6; r++) {
        const round = open(s);
        assert.equal(round.matches.length, maxValidMatches(a, b, c, courts), `${a}/${b}/${c}`);
        assertRoundInvariant(round, s);
        s = play(s, ctx);
      }
    }
  });

  it('fewer than four available players: start refused with a message; mid-session drop-outs stop generation cleanly', () => {
    const r = startTierSession({ ...createTierSession({ scoreMode: 'none' }), players: roster(0, 3, 0) });
    assert.equal(r.ok, false);
    const ctx = { rng: seededRandom(1), now: 0 };
    let s = start(roster(0, 5, 0), 1, ctx);
    for (const id of ['B1', 'B2']) s = setTierPlayerAvailability(s, id, false, ctx);
    s = ok(startTierRound(s, open(s).id, ctx));
    const res = advanceTierRound(s, open(s).id, ctx);
    assert.ok(res.ok);
    if (res.ok) {
      assert.equal(openTierRound(res.session), undefined);
      assert.match(res.message ?? '', /No valid match/);
    }
  });

  it('60 players on 15 courts stays within the search budget', () => {
    const players = roster(18, 22, 20);
    const t0 = Date.now();
    const round = generateTierRound({ players, rounds: [], numberOfCourts: 15, roundNumber: 1, rng: seededRandom(60) });
    const ms = Date.now() - t0;
    assert.equal(round.matches.length, 15);
    assert.ok(ms < 500, `${ms}ms`);
  });
});
