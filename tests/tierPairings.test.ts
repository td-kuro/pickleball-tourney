// Tier-Based Pairings: pairing engine + session behaviour (spec scenarios
// A–J), plus brute-force reference checks for the court-count objective and
// the arrangement search.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PlayerTier, TierPlayer, TierRound, TierSession } from '../src/types';
import {
  arrangeMatches,
  computeTierStats,
  isValidTierMix,
  matchPlayerIds,
  maxValidMatches,
  tierRoundSignature,
  validateTierRound,
  type ArrangementCost,
  type PairHistory,
} from '../src/utils/tierPairings';
import {
  addTierPlayers,
  advanceTierRound,
  createTierSession,
  generateNextTierRound,
  normalizeTierSession,
  openTierRound,
  openTierRoundIssues,
  parseTierPlayerLines,
  regenerateTierRound,
  removeTierPlayer,
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

// --- fixtures ------------------------------------------------------------------

function roster(spec: Partial<Record<PlayerTier, number>>): TierPlayer[] {
  const players: TierPlayer[] = [];
  for (const tier of ['A', 'B', 'C'] as const) {
    for (let i = 1; i <= (spec[tier] ?? 0); i++) players.push({ id: `${tier}${i}`, name: `${tier}${i}`, tier, available: true });
  }
  return players;
}

function ok(result: TierResult): TierSession {
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

function sessionWith(players: TierPlayer[], courts: number, ctx: TierContext): TierSession {
  const base = { ...createTierSession({ numberOfCourts: courts }), players };
  return ok(startTierSession(base, ctx));
}

function current(session: TierSession): TierRound {
  const round = openTierRound(session);
  if (!round) throw new Error('No open round');
  return round;
}

// Start the open round, then Next Round.
function playRound(session: TierSession, ctx: TierContext): TierSession {
  const round = current(session);
  const started = ok(startTierRound(session, round.id, ctx));
  return ok(advanceTierRound(started, round.id, ctx));
}

function completed(session: TierSession): TierRound[] {
  return session.rounds.filter((r) => r.status === 'completed');
}

function assertHardRules(round: TierRound, players: TierPlayer[], courts: number) {
  assert.deepEqual(validateTierRound(round, players, courts), []);
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const match of round.matches) {
    assert.ok(isValidTierMix(matchPlayerIds(match).map((id) => round.playerTiers[id] ?? byId.get(id)!.tier)));
  }
  const all = [...round.matches.flatMap(matchPlayerIds), ...round.restingPlayerIds];
  assert.equal(new Set(all).size, all.length, 'no player appears twice');
}

function tierCounts(round: TierRound) {
  return round.matches.map((m) => matchPlayerIds(m).map((id) => round.playerTiers[id]).sort().join(''));
}

// --- brute-force references ----------------------------------------------------

// Independent reference for the court-count objective: depth-first search
// over every way to take one valid four-player tier mix at a time.
function bruteForceMaxMatches(a: number, b: number, c: number, courts: number): number {
  if (courts === 0) return 0;
  let best = 0;
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4 - i; j++) {
      const l = 4 - i - j;
      if (i > a || j > b || l > c) continue;
      if (i > 0 && l > 0) continue;
      best = Math.max(best, 1 + bruteForceMaxMatches(a - i, b - j, c - l, courts - 1));
      if (best === courts) return best;
    }
  }
  return best;
}

// Independent reference for the arrangement objective: every grouping into
// courts and every team split, scored with the documented cost tuple.
function bruteForceBestCost(tiers: PlayerTier[], history: PairHistory): ArrangementCost | null {
  const strength = { A: 3, B: 2, C: 1 };
  const n = tiers.length;
  let best: ArrangementCost | null = null;
  const less = (x: number[], y: number[]) => {
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
    return false;
  };
  const courtBest = (q: number[]): number[] | null => {
    if (!isValidTierMix(q.map((i) => tiers[i]))) return null;
    let out: number[] | null = null;
    for (const [w, x, y, z] of [
      [q[0], q[1], q[2], q[3]],
      [q[0], q[2], q[1], q[3]],
      [q[0], q[3], q[1], q[2]],
    ]) {
      let opp = 0;
      let oppLast = 0;
      for (const i of [w, x]) for (const j of [y, z]) {
        opp += history.opponent(i, j) ** 2;
        oppLast += history.opponentLast(i, j) ? 1 : 0;
      }
      const cost = [
        history.partner(w, x) ** 2 + history.partner(y, z) ** 2,
        (history.partnerLast(w, x) ? 1 : 0) + (history.partnerLast(y, z) ? 1 : 0),
        opp,
        oppLast,
        Math.abs(strength[tiers[w]] + strength[tiers[x]] - strength[tiers[y]] - strength[tiers[z]]),
      ];
      if (!out || less(cost, out)) out = cost;
    }
    return out;
  };
  const rec = (remaining: number[], total: number[]) => {
    if (remaining.length === 0) {
      if (!best || less(total, best)) best = total;
      return;
    }
    const [first, ...rest] = remaining;
    for (let i = 0; i < rest.length; i++)
      for (let j = i + 1; j < rest.length; j++)
        for (let l = j + 1; l < rest.length; l++) {
          const cost = courtBest([first, rest[i], rest[j], rest[l]]);
          if (!cost) continue;
          rec(
            rest.filter((_, idx) => idx !== i && idx !== j && idx !== l),
            total.map((v, idx) => v + cost[idx]),
          );
        }
  };
  rec(
    Array.from({ length: n }, (_, i) => i),
    [0, 0, 0, 0, 0],
  );
  return best;
}

function randomHistory(n: number, rng: () => number): PairHistory {
  const sym = () => {
    const m = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const v = rng() < 0.35 ? Math.floor(rng() * 3) : 0;
        m[i][j] = v;
        m[j][i] = v;
      }
    return m;
  };
  const p = sym();
  const o = sym();
  const pl = sym();
  const ol = sym();
  return {
    partner: (i, j) => p[i][j],
    opponent: (i, j) => o[i][j],
    partnerLast: (i, j) => p[i][j] > 0 && pl[i][j] > 1,
    opponentLast: (i, j) => o[i][j] > 0 && ol[i][j] > 1,
  };
}

// --- tests ------------------------------------------------------------------------

describe('court utilisation (maximum valid matches)', () => {
  it('matches a brute-force search for every small tier mix', () => {
    for (let a = 0; a <= 9; a++)
      for (let b = 0; b <= 6; b++)
        for (let c = 0; c <= 9; c++)
          for (let courts = 1; courts <= 5; courts++) {
            assert.equal(maxValidMatches(a, b, c, courts), bruteForceMaxMatches(a, b, c, courts), `a=${a} b=${b} c=${c} courts=${courts}`);
          }
  });

  it('Scenario A: 8 A / 10 B / 12 C on 6 courts → 6 valid matches, 24 playing, 6 resting', () => {
    const ctx = { rng: seededRandom(1), now: 0 };
    const players = roster({ A: 8, B: 10, C: 12 });
    const round = current(sessionWith(players, 6, ctx));
    assert.equal(round.matches.length, 6);
    assert.equal(round.matches.flatMap(matchPlayerIds).length, 24);
    assert.equal(round.restingPlayerIds.length, 6);
    assertHardRules(round, players, 6);
    assert.equal(round.arrangement?.tierLimitedSitOuts, 0);
  });

  it('Scenario B: 3 A / 1 B / 4 C on 2 courts → AAAB + CCCC, not one balanced court', () => {
    const ctx = { rng: seededRandom(2), now: 0 };
    const players = roster({ A: 3, B: 1, C: 4 });
    const round = current(sessionWith(players, 2, ctx));
    assert.equal(round.matches.length, 2);
    assert.deepEqual(tierCounts(round).sort(), ['AAAB', 'CCCC']);
    assertHardRules(round, players, 2);
  });

  it('Scenario C: category imbalance still fills every feasible court', () => {
    const cases: [Partial<Record<PlayerTier, number>>, number, number][] = [
      [{ A: 18, B: 2, C: 4 }, 6, 6], // mostly A
      [{ A: 3, B: 2, C: 19 }, 6, 6], // mostly C: A A A B + B C C C + 4 × C C C C (3 C rest)
      [{ A: 7, B: 1, C: 7 }, 4, 3], // very few B: one of A or C side must give up a court
      [{ A: 2, B: 20, C: 2 }, 6, 6], // mostly B
      [{ A: 5, B: 0, C: 5 }, 4, 2], // no B at all
      [{ A: 1, B: 0, C: 8 }, 3, 2], // a lone A can never play
    ];
    cases.forEach(([spec, courts, expected], i) => {
      const players = roster(spec);
      const round = current(sessionWith(players, courts, { rng: seededRandom(10 + i), now: 0 }));
      assert.equal(round.matches.length, expected, JSON.stringify(spec));
      assert.equal(round.matches.length, bruteForceMaxMatches(spec.A ?? 0, spec.B ?? 0, spec.C ?? 0, courts));
      assertHardRules(round, players, courts);
    });
  });

  it('does not spend essential B players greedily (court-by-court fill would lose a court)', () => {
    // 7 A / 1 B / 4 C on 3 courts: only AAAA + AAAB + CCCC seats all 12.
    // Filling Court 1 as a 'balanced' AAAB-style court first would still
    // work here, but spending the lone B on the C side would not.
    const players = roster({ A: 7, B: 1, C: 4 });
    const round = current(sessionWith(players, 3, { rng: seededRandom(3), now: 0 }));
    assert.equal(round.matches.length, 3);
    assert.equal(round.restingPlayerIds.length, 0);
    assertHardRules(round, players, 3);
  });
});

describe('arrangement search', () => {
  it('exhaustive and local search both reach the brute-force optimum on 12-player rounds', () => {
    const rng = seededRandom(99);
    const tierSets: PlayerTier[][] = [
      ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'C'],
      ['A', 'A', 'A', 'B', 'B', 'B', 'B', 'B', 'B', 'C', 'C', 'C'],
      ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
      ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'B', 'C', 'C', 'C', 'C'],
    ];
    let checked = 0;
    for (let trial = 0; trial < 12; trial++) {
      const tiers = tierSets[trial % tierSets.length];
      const ids = tiers.map((_, i) => `p${i}`);
      const history = randomHistory(tiers.length, rng);
      const expected = bruteForceBestCost(tiers, history);
      for (const method of ['exhaustive', 'local-search'] as const) {
        const result = arrangeMatches(ids, (id) => tiers[Number(id.slice(1))], history, seededRandom(trial), { method, timeBudgetMs: 1000 });
        assert.deepEqual(result.cost, expected, `trial ${trial} ${method}`);
        for (const q of result.courts) assert.ok(isValidTierMix(q.map((i) => tiers[i])));
      }
      checked++;
    }
    assert.equal(checked, 12);
  });

  it('stays fast at 40 players / 10 courts', () => {
    const players = roster({ A: 12, B: 14, C: 14 });
    let session = sessionWith(players, 10, { rng: seededRandom(5) });
    const startedAt = Date.now();
    for (let r = 0; r < 8; r++) session = playRound(session, { rng: seededRandom(100 + r) });
    const perRound = (Date.now() - startedAt) / 8;
    assert.ok(perRound < 400, `took ${perRound}ms per round`);
    for (const round of session.rounds) assertHardRules(round, players, 10);
  });
});

describe('Scenario D: partner and opponent rotation', () => {
  it('8 B players, 2 courts, 12 rounds: no back-to-back partners, varied partners and opponents', () => {
    const ctx = { rng: seededRandom(7), now: 0 };
    const players = roster({ B: 8 });
    let session = sessionWith(players, 2, ctx);
    for (let r = 0; r < 12; r++) session = playRound(session, ctx);
    const rounds = completed(session);
    assert.equal(rounds.length, 12);

    // No partnership repeats while an unused one could be formed in the
    // first 3 rounds (8 players each have 7 possible partners).
    const firstThree = computeTierStats(players, rounds.slice(0, 3));
    for (const s of firstThree.values()) assert.ok(Object.values(s.partnerHistory).every((n) => n === 1), 'no early repeats');

    // Never the same partner two rounds running.
    for (let i = 1; i < rounds.length; i++) {
      const prev = new Set(rounds[i - 1].matches.flatMap((m) => [m.teamAPlayerIds, m.teamBPlayerIds]).map((t) => [...t].sort().join('+')));
      for (const m of rounds[i].matches) for (const t of [m.teamAPlayerIds, m.teamBPlayerIds]) assert.ok(!prev.has([...t].sort().join('+')), `round ${i + 1} back-to-back partners`);
    }

    // After 12 rounds everyone has partnered all 7 others, and partner
    // counts are spread (max - min ≤ 1 per player).
    const stats = computeTierStats(players, rounds);
    for (const s of stats.values()) {
      const counts = Object.values(s.partnerHistory);
      assert.equal(counts.length, 7, `${s.playerId} partners`);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${s.playerId} partner spread ${counts}`);
      assert.equal(Object.keys(s.opponentHistory).length, 7, `${s.playerId} opponents`);
    }
  });

  it('30-player session: unique partners stay high and repeats are minimal', () => {
    const ctx = { rng: seededRandom(8), now: 0 };
    const players = roster({ A: 8, B: 10, C: 12 });
    let session = sessionWith(players, 6, ctx);
    for (let r = 0; r < 10; r++) session = playRound(session, ctx);
    const stats = computeTierStats(players, completed(session));
    let repeats = 0;
    for (const s of stats.values()) repeats += Object.values(s.partnerHistory).reduce((sum, n) => sum + (n - 1), 0);
    // 10 rounds × 12 partnerships = 120; each repeat is counted from both sides.
    assert.ok(repeats / 2 <= 2, `partner repeats: ${repeats / 2}`);
  });

  it('randomises between equally good arrangements', () => {
    const players = roster({ A: 4, B: 8, C: 4 });
    const signatures = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) signatures.add(tierRoundSignature(current(sessionWith(players, 4, { rng: seededRandom(seed), now: 0 }))));
    assert.ok(signatures.size >= 5, `only ${signatures.size} distinct first rounds`);
  });
});

describe('Scenario E: fair sit-outs', () => {
  it('30 players / 6 courts / 10 rounds: 6 rest each round, never twice running, counts balanced', () => {
    const ctx = { rng: seededRandom(11), now: 0 };
    const players = roster({ A: 8, B: 10, C: 12 });
    let session = sessionWith(players, 6, ctx);
    for (let r = 0; r < 10; r++) session = playRound(session, ctx);
    const rounds = completed(session);
    for (const round of rounds) {
      assert.equal(round.restingPlayerIds.length, 6);
      assert.equal(round.matches.length, 6);
    }
    for (let i = 1; i < rounds.length; i++) {
      for (const id of rounds[i].restingPlayerIds) assert.ok(!rounds[i - 1].restingPlayerIds.includes(id), `${id} sat out rounds ${i} and ${i + 1}`);
    }
    const sitOuts = [...computeTierStats(players, rounds).values()].map((s) => s.roundsSatOut);
    assert.ok(Math.max(...sitOuts) - Math.min(...sitOuts) <= 1, `sit-out spread ${sitOuts}`);
    assert.equal(sitOuts.reduce((x, y) => x + y, 0), 60);
  });

  it('players who rested get priority next round', () => {
    const ctx = { rng: seededRandom(12), now: 0 };
    const players = roster({ B: 10 });
    let session = sessionWith(players, 2, ctx);
    const rested = current(session).restingPlayerIds;
    session = playRound(session, ctx);
    const next = current(session);
    for (const id of rested) assert.ok(!next.restingPlayerIds.includes(id));
  });

  it('tier-forced sit-outs rotate within the tier', () => {
    // 5 A and 4 C, no B: one A must sit out every round.
    const ctx = { rng: seededRandom(13), now: 0 };
    const players = roster({ A: 5, C: 4 });
    let session = sessionWith(players, 3, ctx);
    for (let r = 0; r < 10; r++) session = playRound(session, ctx);
    const rounds = completed(session);
    for (const round of rounds) assert.equal(round.matches.length, 2);
    const aSitOuts = [...computeTierStats(players, rounds).values()].filter((s) => s.playerId.startsWith('A')).map((s) => s.roundsSatOut);
    assert.deepEqual(aSitOuts, [2, 2, 2, 2, 2]);
  });

  it('late arrival joins the next round and is not benched for missing earlier rounds', () => {
    const ctx = { rng: seededRandom(14), now: 0 };
    let session = sessionWith(roster({ B: 9 }), 2, ctx);
    for (let r = 0; r < 4; r++) session = playRound(session, ctx);
    session = addTierPlayers(session, [{ name: 'Late', tier: 'B' }], ctx);
    const late = session.players.find((p) => p.name === 'Late')!;
    assert.equal(late.joinedAtRound, 6); // round 5 is already open
    assert.ok(openTierRoundIssues(session).some((i) => i.includes('Late')), 'open round flags the missing player');
    session = playRound(session, ctx); // completes 5, generates 6
    assert.ok(!current(session).restingPlayerIds.includes(late.id), 'plays in their first round');
    for (let r = 0; r < 6; r++) session = playRound(session, ctx);
    const stats = computeTierStats(session.players, completed(session)).get(late.id)!;
    assert.equal(stats.eligibleRounds, 6);
    assert.ok(stats.roundsSatOut <= 2, `late player sat out ${stats.roundsSatOut} of 6`);
    // No invented history for rounds 1–5.
    assert.equal(stats.roundsPlayed + stats.roundsSatOut, 6);
  });
});

describe('Scenario F: live tier change', () => {
  it('C → B takes effect next round; history and completed rounds are untouched', () => {
    const ctx = { rng: seededRandom(21), now: 0 };
    const players = roster({ A: 4, B: 0, C: 4 });
    let session = sessionWith(players, 2, ctx);
    session = playRound(session, ctx);
    const before = JSON.stringify(completed(session));
    const statsBefore = computeTierStats(session.players, completed(session)).get('C1')!;

    session = setTierPlayerTier(session, 'C1', 'B', ctx);
    assert.equal(session.players.find((p) => p.id === 'C1')!.tier, 'B');
    // The open draft wasn't rewritten; it's flagged so the organiser can regenerate.
    assert.ok(openTierRoundIssues(session).some((i) => i.includes('Tier changed')));
    session = ok(regenerateTierRound(session, current(session).id, ctx));
    assert.equal(current(session).playerTiers.C1, 'B');
    session = playRound(session, ctx);

    assert.equal(JSON.stringify(completed(session).slice(0, 1)), before, 'round 1 unchanged');
    assert.equal(completed(session)[0].playerTiers.C1, 'C', 'round 1 still shows C');
    const statsAfter = computeTierStats(session.players, completed(session).slice(0, 1)).get('C1')!;
    assert.deepEqual(statsAfter.partnerHistory, statsBefore.partnerHistory);
    // As a B, C1 may now share a court with A players.
    for (const round of session.rounds) assertHardRules(round, session.players, 2);
  });

  it('a tier change makes a conflicting saved court visible but never rewrites it', () => {
    const ctx = { rng: seededRandom(22), now: 0 };
    let session = sessionWith(roster({ A: 4, C: 4 }), 2, ctx);
    const roundBefore = current(session);
    session = setTierPlayerTier(session, 'C1', 'A', ctx); // C1 now an A on the C court
    assert.deepEqual(current(session).matches, roundBefore.matches);
    assert.ok(openTierRoundIssues(session).some((i) => i.includes('mixes Top (A) and Lower (C)')));
  });
});

describe('Scenario G: availability changes', () => {
  it('unavailable player is excluded, not counted as a sit-out, and returns fairly', () => {
    const ctx = { rng: seededRandom(31), now: 0 };
    let session = sessionWith(roster({ B: 9 }), 2, ctx);
    session = playRound(session, ctx);
    session = setTierPlayerAvailability(session, 'B1', false, ctx);
    session = ok(regenerateTierRound(session, current(session).id, ctx));
    const r2 = current(session);
    assert.ok(!r2.restingPlayerIds.includes('B1') && !r2.matches.flatMap(matchPlayerIds).includes('B1'));
    assertHardRules(r2, session.players, 2);
    session = playRound(session, ctx);
    session = playRound(session, ctx);
    const away = computeTierStats(session.players, completed(session)).get('B1')!;
    assert.equal(away.eligibleRounds, 1, 'rounds away are not eligible rounds');

    session = setTierPlayerAvailability(session, 'B1', true, ctx);
    session = ok(regenerateTierRound(session, current(session).id, ctx));
    const back = current(session);
    assert.ok([...back.matches.flatMap(matchPlayerIds), ...back.restingPlayerIds].includes('B1'));
    assertHardRules(back, session.players, 2);
  });

  it('swap cannot put an unavailable player on a court', () => {
    const ctx = { rng: seededRandom(32), now: 0 };
    let session = sessionWith(roster({ B: 9 }), 2, ctx);
    const round = current(session);
    const resting = round.restingPlayerIds[0];
    session = setTierPlayerAvailability(session, resting, false, ctx);
    const result = swapTierPlayers(session, round.id, resting, round.matches[0].teamAPlayerIds[0], ctx);
    assert.equal(result.ok, false);
  });
});

describe('Scenario H: round regeneration', () => {
  it('discarded drafts leave no history and regeneration varies the round', () => {
    const ctx = { rng: seededRandom(41), now: 0 };
    const players = roster({ A: 4, B: 8, C: 4 });
    let session = sessionWith(players, 4, ctx);
    session = playRound(session, ctx);
    const statsBefore = JSON.stringify([...computeTierStats(players, session.rounds).entries()]);
    const signatures = new Set([tierRoundSignature(current(session))]);
    for (let i = 0; i < 5; i++) {
      const prev = tierRoundSignature(current(session));
      session = ok(regenerateTierRound(session, current(session).id, ctx));
      assert.notEqual(tierRoundSignature(current(session)), prev, 'each regeneration differs from the one it replaced');
      signatures.add(tierRoundSignature(current(session)));
      assertHardRules(current(session), players, 4);
    }
    assert.ok(signatures.size >= 4);
    assert.equal(JSON.stringify([...computeTierStats(players, session.rounds).entries()]), statsBefore);
    assert.equal(current(session).regenerationCount, 5);
    assert.equal(session.events.filter((e) => e.type === 'round-regenerated').length, 5);
    assert.equal(session.rounds.length, 2);
  });

  it('active rounds need confirmation; completed rounds are never regenerated', () => {
    const ctx = { rng: seededRandom(42), now: 0 };
    let session = sessionWith(roster({ B: 8 }), 2, ctx);
    const r1 = current(session);
    session = ok(startTierRound(session, r1.id, ctx));
    assert.equal(regenerateTierRound(session, r1.id, ctx).ok, false);
    session = ok(regenerateTierRound(session, r1.id, { ...ctx, allowActive: true }));
    assert.equal(current(session).status, 'active');
    session = ok(advanceTierRound(session, r1.id, ctx));
    assert.equal(regenerateTierRound(session, r1.id, { ...ctx, allowActive: true }).ok, false);
  });

  it('Next Round is idempotent: repeat clicks neither double-count nor add rounds', () => {
    const ctx = { rng: seededRandom(43), now: 0 };
    let session = sessionWith(roster({ B: 10 }), 2, ctx);
    const r1 = current(session);
    session = ok(startTierRound(session, r1.id, ctx));
    session = ok(advanceTierRound(session, r1.id, ctx));
    const once = JSON.stringify(session.rounds);
    session = ok(advanceTierRound(session, r1.id, ctx));
    session = ok(advanceTierRound(session, r1.id, ctx));
    assert.equal(JSON.stringify(session.rounds), once);
    assert.equal(session.rounds.length, 2);
    assert.equal(generateNextTierRound(session, ctx).ok, false, 'cannot generate while a round is open');
    const stats = computeTierStats(session.players, session.rounds);
    for (const s of stats.values()) assert.equal(s.eligibleRounds, 1);
  });

  it('Next Round requires the round to have been started', () => {
    const ctx = { rng: seededRandom(44), now: 0 };
    const session = sessionWith(roster({ B: 8 }), 2, ctx);
    assert.equal(advanceTierRound(session, current(session).id, ctx).ok, false);
  });
});

describe('Scenario I: manual swapping', () => {
  // Court 1: A1/A2 vs A3/B1 — Court 2: C1/C2 vs C3/B2 — resting: B3, A4, C4
  function fixedSession(): TierSession {
    const players = roster({ A: 4, B: 3, C: 4 });
    const round: TierRound = {
      id: 'r1',
      roundNumber: 1,
      status: 'draft',
      matches: [
        { id: 'm1', courtNumber: 1, teamAPlayerIds: ['A1', 'A2'], teamBPlayerIds: ['A3', 'B1'] },
        { id: 'm2', courtNumber: 2, teamAPlayerIds: ['C1', 'C2'], teamBPlayerIds: ['C3', 'B2'] },
      ],
      restingPlayerIds: ['B3', 'A4', 'C4'],
      playerTiers: Object.fromEntries(players.map((p) => [p.id, p.tier])),
      courtsAtGeneration: 2,
      createdAt: 0,
      regenerationCount: 0,
      manuallyAdjusted: false,
    };
    return { ...createTierSession({ numberOfCourts: 2 }), started: true, players, rounds: [round] };
  }

  it('court-to-court swap of two B players', () => {
    const s = ok(swapTierPlayers(fixedSession(), 'r1', 'B1', 'B2'));
    assert.deepEqual(current(s).matches[0].teamBPlayerIds, ['A3', 'B2']);
    assert.deepEqual(current(s).matches[1].teamBPlayerIds, ['C3', 'B1']);
    assert.ok(current(s).manuallyAdjusted);
    assertHardRules(current(s), s.players, 2);
  });

  it('same-court swap changes partners', () => {
    const s = ok(swapTierPlayers(fixedSession(), 'r1', 'A2', 'B1'));
    assert.deepEqual(current(s).matches[0].teamAPlayerIds, ['A1', 'B1']);
    assert.deepEqual(current(s).matches[0].teamBPlayerIds, ['A3', 'A2']);
  });

  it('court-to-bye swap', () => {
    const s = ok(swapTierPlayers(fixedSession(), 'r1', 'A1', 'A4'));
    assert.deepEqual(current(s).matches[0].teamAPlayerIds, ['A4', 'A2']);
    assert.ok(current(s).restingPlayerIds.includes('A1'));
    assertHardRules(current(s), s.players, 2);
  });

  it('rejects swaps that would put A and C on one court', () => {
    const session = fixedSession();
    for (const [x, y] of [
      ['A1', 'C1'], // court ↔ court
      ['B1', 'C4'], // C from rest onto an A court
      ['B2', 'A4'], // A from rest onto a C court
    ]) {
      const result = swapTierPlayers(session, 'r1', x, y);
      assert.equal(result.ok, false, `${x} ↔ ${y}`);
      if (!result.ok) assert.match(result.reason, /Top \(A\) and Lower \(C\)/);
    }
  });

  it('rejects no-op and unknown swaps, and never duplicates a player', () => {
    const session = fixedSession();
    assert.equal(swapTierPlayers(session, 'r1', 'A1', 'A1').ok, false);
    assert.equal(swapTierPlayers(session, 'r1', 'A1', 'A2').ok, false); // partners already
    assert.equal(swapTierPlayers(session, 'r1', 'B3', 'A4').ok, false); // both resting
    assert.equal(swapTierPlayers(session, 'r1', 'A1', 'nobody').ok, false);
  });

  it('completed rounds cannot be swapped', () => {
    const session = fixedSession();
    const done = { ...session, rounds: session.rounds.map((r) => ({ ...r, status: 'completed' as const })) };
    assert.equal(swapTierPlayers(done, 'r1', 'B1', 'B2').ok, false);
  });

  it('swaps are counted as played history once the round completes', () => {
    let s = ok(swapTierPlayers(fixedSession(), 'r1', 'A1', 'A4'));
    s = ok(startTierRound(s, 'r1'));
    s = ok(advanceTierRound(s, 'r1', { rng: seededRandom(1) }));
    const stats = computeTierStats(s.players, s.rounds);
    assert.equal(stats.get('A4')!.roundsPlayed, 1);
    assert.equal(stats.get('A1')!.roundsSatOut, 1);
    assert.equal(stats.get('A4')!.partnerHistory.A2, 1);
  });
});

describe('Scenario J: persistence', () => {
  it('a JSON round trip (reload) keeps the round, history, tiers and counts identical', () => {
    const ctx = { rng: seededRandom(51), now: 0 };
    let session = sessionWith(roster({ A: 8, B: 10, C: 12 }), 6, ctx);
    for (let r = 0; r < 3; r++) session = playRound(session, ctx);
    session = setTierPlayerTier(session, 'C1', 'B', ctx);
    session = ok(swapTierPlayers(session, current(session).id, current(session).matches[0].teamAPlayerIds[0], current(session).matches[0].teamBPlayerIds[0], ctx));

    const reloaded = normalizeTierSession(JSON.parse(JSON.stringify(session)));
    assert.deepEqual(reloaded, session);
    assert.deepEqual(current(reloaded), current(session));
    assert.deepEqual(
      [...computeTierStats(reloaded.players, reloaded.rounds).entries()],
      [...computeTierStats(session.players, session.rounds).entries()],
    );
    // Reloading twice changes nothing either (no repeated history updates).
    assert.deepEqual(normalizeTierSession(JSON.parse(JSON.stringify(reloaded))), session);
  });

  it('normalises missing or partial saved data', () => {
    assert.deepEqual(normalizeTierSession(null), createTierSession());
    const partial = normalizeTierSession({ started: true, players: [{ id: 'x', name: 'X', tier: 'A', available: true }] });
    assert.equal(partial.players.length, 1);
    assert.deepEqual(partial.rounds, []);
  });
});

describe('roster management', () => {
  it('parses quick-add lines with optional tiers, defaulting to B', () => {
    assert.deepEqual(parseTierPlayerLines('Thai, A\nAlex - b\nKim (C)\nSarah: top\nBen\n\n  Matt\tlower '), [
      { name: 'Thai', tier: 'A' },
      { name: 'Alex', tier: 'B' },
      { name: 'Kim', tier: 'C' },
      { name: 'Sarah', tier: 'A' },
      { name: 'Ben', tier: 'B' },
      { name: 'Matt', tier: 'C' },
    ]);
    assert.deepEqual(parseTierPlayerLines('Jo-Anne\nMary Kate'), [
      { name: 'Jo-Anne', tier: 'B' },
      { name: 'Mary Kate', tier: 'B' },
    ]);
  });

  it('removing a player with history keeps them for old rounds; on-court removal is blocked', () => {
    const ctx = { rng: seededRandom(61), now: 0 };
    let session = sessionWith(roster({ B: 9 }), 2, ctx);
    const onCourt = current(session).matches[0].teamAPlayerIds[0];
    assert.equal(removeTierPlayer(session, onCourt, ctx).ok, false);
    const resting = current(session).restingPlayerIds[0];
    session = ok(removeTierPlayer(session, resting, ctx));
    assert.ok(!current(session).restingPlayerIds.includes(resting));
    assert.equal(session.players.find((p) => p.id === resting), undefined, 'no history → deleted');
    session = playRound(session, ctx);
    const played = completed(session)[0].matches[0].teamAPlayerIds[0];
    session = playRound(session, ctx);
    const inOpen = current(session).matches.flatMap(matchPlayerIds).includes(played);
    if (!inOpen) {
      session = ok(removeTierPlayer(session, played, ctx));
      assert.equal(session.players.find((p) => p.id === played)?.removed, true);
    }
  });

  it('court count changes apply to the next generated round only', () => {
    const ctx = { rng: seededRandom(62), now: 0 };
    let session = sessionWith(roster({ B: 24 }), 5, ctx);
    const r1 = current(session);
    session = setTierCourts(session, 6, ctx);
    assert.deepEqual(current(session).matches, r1.matches);
    session = playRound(session, ctx);
    assert.equal(current(session).matches.length, 6);
    session = setTierCourts(session, 4, ctx);
    assert.ok(openTierRoundIssues(session).some((i) => i.includes('only 4')));
    session = playRound(session, ctx);
    assert.equal(current(session).matches.length, 4);
    assert.equal(current(session).restingPlayerIds.length, 8);
  });

  it('refuses to start when no valid match exists', () => {
    const base = { ...createTierSession({ numberOfCourts: 2 }), players: roster({ A: 2, C: 2 }) };
    const result = startTierSession(base, { rng: seededRandom(1) });
    assert.equal(result.ok, false);
  });
});

describe('randomised rosters (property check)', () => {
  it('every generated round obeys the hard rules and fills the maximum number of courts', () => {
    const rng = seededRandom(2026);
    for (let trial = 0; trial < 40; trial++) {
      const n = 8 + Math.floor(rng() * 33);
      const courts = 1 + Math.floor(rng() * 10);
      const tiers: PlayerTier[] = ['A', 'B', 'C'];
      const players: TierPlayer[] = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, tier: tiers[Math.floor(rng() * 3)], available: true }));
      const ctx = { rng: seededRandom(trial), now: 0 };
      const start = startTierSession({ ...createTierSession({ numberOfCourts: courts }), players }, ctx);
      if (!start.ok) {
        const count = (t: PlayerTier) => players.filter((p) => p.tier === t).length;
        assert.equal(maxValidMatches(count('A'), count('B'), count('C'), courts), 0);
        continue;
      }
      let session = start.session;
      for (let r = 0; r < 5; r++) {
        if (rng() < 0.3) session = setTierPlayerTier(session, `p${Math.floor(rng() * n)}`, tiers[Math.floor(rng() * 3)], ctx);
        if (rng() < 0.3) session = setTierPlayerAvailability(session, `p${Math.floor(rng() * n)}`, rng() < 0.5, ctx);
        const regenerated = regenerateTierRound(session, current(session).id, ctx);
        if (!regenerated.ok) break;
        session = regenerated.session;
        const round = current(session);
        assertHardRules(round, session.players, courts);
        const avail = session.players.filter((p) => p.available);
        const count = (t: PlayerTier) => avail.filter((p) => p.tier === t).length;
        assert.equal(round.matches.length, maxValidMatches(count('A'), count('B'), count('C'), courts), `trial ${trial} round ${r}`);
        assert.equal(round.matches.length * 4 + round.restingPlayerIds.length, avail.length, 'every available player is placed');
        session = playRound(session, ctx);
      }
    }
  });
});
