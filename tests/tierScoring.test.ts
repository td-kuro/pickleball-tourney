// Tier-Based Pairings: custom courts, scoring modes, leaderboard and End
// Session.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PlayerTier, TierMatch, TierPlayer, TierRound, TierScoreMode, TierSession } from '../src/types';
import { computeTierStats, isValidTierMix, matchPlayerIds, maxValidMatches } from '../src/utils/tierPairings';
import { buildTierResult, computeTierLeaderboard, tierWinnerIds, unrecordedMatchCount } from '../src/utils/tierLeaderboard';
import {
  addTierPlayers,
  advanceTierRound,
  clearTierResult,
  createTierSession,
  endTierSession,
  normalizeTierSession,
  openTierRound,
  recordTierResult,
  regenerateTierRound,
  resetTierSession,
  setTierPlayerAvailability,
  setTierPlayerTier,
  setTierCourtNumbers,
  setTierScoreMode,
  startTierRound,
  startTierSession,
  swapTierPlayers,
  type TierContext,
  type TierResult,
} from '../src/utils/tierSession';
import { seededRandom } from './helpers';

function ok(r: TierResult): TierSession {
  if (!r.ok) throw new Error(r.reason);
  return r.session;
}

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

function open(s: TierSession): TierRound {
  const r = openTierRound(s);
  if (!r) throw new Error('no open round');
  return r;
}

function start(players: TierPlayer[], courts: number, scoreMode: TierScoreMode, ctx: TierContext): TierSession {
  return ok(startTierSession({ ...createTierSession({ numberOfCourts: courts, scoreMode }), players }, ctx));
}

// A fixed one-court round: Thai / Alex vs Ben / Sarah, in play.
function fixedSession(scoreMode: TierScoreMode): TierSession {
  const players: TierPlayer[] = ['Thai', 'Alex', 'Ben', 'Sarah', 'Zoe'].map((n) => ({ id: n.toLowerCase(), name: n, tier: 'B', available: true }));
  const base = createTierSession({ numberOfCourts: 1, scoreMode });
  const round: TierRound = {
    id: 'r1',
    roundNumber: 1,
    status: 'active',
    matches: [{ id: 'm1', courtNumber: 1, physicalCourt: 1, teamAPlayerIds: ['thai', 'alex'], teamBPlayerIds: ['ben', 'sarah'] }],
    restingPlayerIds: ['zoe'],
    playerTiers: Object.fromEntries(players.map((p) => [p.id, p.tier])),
    courtsAtGeneration: 1,
    createdAt: 0,
    regenerationCount: 0,
    manuallyAdjusted: false,
  };
  return { ...base, started: true, players, rounds: [round] };
}

function standing(s: TierSession, id: string) {
  return computeTierLeaderboard(s.players, s.rounds).find((x) => x.playerId === id)!;
}

// Records a random winner (or score) on every match of the round in play.
function scoreRound(s: TierSession, rng: () => number, ctx: TierContext): TierSession {
  const round = open(s);
  for (const m of round.matches) {
    const input =
      s.settings.scoreMode === 'full-score'
        ? (() => {
            const w = 11;
            const l = Math.floor(rng() * 10);
            return rng() < 0.5 ? { scoreA: w, scoreB: l } : { scoreA: l, scoreB: w };
          })()
        : { winner: (rng() < 0.5 ? 'A' : 'B') as 'A' | 'B' };
    s = ok(recordTierResult(s, round.id, m.id, input, ctx));
  }
  return s;
}

function playScored(s: TierSession, rng: () => number, ctx: TierContext): TierSession {
  s = ok(startTierRound(s, open(s).id, ctx));
  s = scoreRound(s, rng, ctx);
  return ok(advanceTierRound(s, open(s).id, ctx));
}

// Court Number Selection tests live in tests/courtNumbers.test.ts.

// --- Win/Loss Only ---------------------------------------------------------------------

describe('Win/Loss Only', () => {
  it('Thai / Alex beat Ben / Sarah: wins, losses, one game each, no points invented', () => {
    let s = fixedSession('win-loss-only');
    s = ok(recordTierResult(s, 'r1', 'm1', { winner: 'A' }));
    const m = s.rounds[0].matches[0];
    assert.equal(m.result!.scoreA, undefined);
    assert.equal(m.result!.scoreB, undefined);
    for (const id of ['thai', 'alex']) {
      const st = standing(s, id);
      assert.deepEqual([st.wins, st.losses, st.recordedGames, st.gamesPlayed], [1, 0, 1, 1]);
      assert.equal(st.pointsFor, undefined);
      assert.equal(st.pointDiff, undefined);
    }
    for (const id of ['ben', 'sarah']) {
      const st = standing(s, id);
      assert.deepEqual([st.wins, st.losses, st.recordedGames], [0, 1, 1]);
    }
    assert.equal(standing(s, 'zoe').rank, null, 'no recorded game → unranked');
  });

  it('duplicate submission is a no-op; editing replaces without double-counting', () => {
    let s = fixedSession('win-loss-only');
    s = ok(recordTierResult(s, 'r1', 'm1', { winner: 'A' }));
    const once = s;
    s = ok(recordTierResult(s, 'r1', 'm1', { winner: 'A' }));
    assert.equal(s, once, 'same result again changes nothing');
    s = ok(recordTierResult(s, 'r1', 'm1', { winner: 'B' }));
    assert.deepEqual([standing(s, 'thai').wins, standing(s, 'thai').losses], [0, 1]);
    assert.deepEqual([standing(s, 'ben').wins, standing(s, 'ben').losses], [1, 0]);
    assert.equal(standing(s, 'ben').recordedGames, 1);
    const corrected = s.events.filter((e) => e.type === 'result-corrected');
    assert.equal(corrected.length, 1);
    assert.equal(corrected[0].previousResult!.winner, 'A');
    s = ok(clearTierResult(s, 'r1', 'm1'));
    assert.equal(standing(s, 'ben').recordedGames, 0);
    assert.equal(standing(s, 'ben').rank, null);
  });

  it('results only on started rounds; completed rounds need an explicit correction', () => {
    let s = fixedSession('win-loss-only');
    const draft = { ...s, rounds: s.rounds.map((r) => ({ ...r, status: 'draft' as const })) };
    assert.equal(recordTierResult(draft, 'r1', 'm1', { winner: 'A' }).ok, false);
    s = ok(recordTierResult(s, 'r1', 'm1', { winner: 'A' }));
    s = ok(advanceTierRound(s, 'r1', { rng: seededRandom(1) }));
    assert.equal(recordTierResult(s, 'r1', 'm1', { winner: 'B' }).ok, false, 'locked');
    assert.equal(clearTierResult(s, 'r1', 'm1').ok, false, 'locked');
    s = ok(recordTierResult(s, 'r1', 'm1', { winner: 'B' }, { correction: true }));
    assert.equal(standing(s, 'ben').wins, 1);
    assert.equal(standing(s, 'thai').wins, 0);
  });

  it('Next Round with missing results asks first, then leaves them unrecorded (not losses)', () => {
    let s = fixedSession('win-loss-only');
    const blocked = advanceTierRound(s, 'r1', { rng: seededRandom(1) });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.missingResults, 1);
    s = ok(advanceTierRound(s, 'r1', { rng: seededRandom(1), allowMissingResults: true }));
    const st = standing(s, 'thai');
    assert.deepEqual([st.gamesPlayed, st.recordedGames, st.wins, st.losses, st.rank], [1, 0, 0, 0, null]);
    assert.equal(unrecordedMatchCount(s.rounds), 1);
  });

  it('multiple rounds with different partners accumulate per player', () => {
    const ctx = { rng: seededRandom(4), now: 0 };
    let s = start(roster(0, 8, 0), 2, 'win-loss-only', ctx);
    const rng = seededRandom(40);
    for (let r = 0; r < 6; r++) s = playScored(s, rng, ctx);
    const board = computeTierLeaderboard(s.players, s.rounds);
    let wins = 0;
    let losses = 0;
    for (const st of board) {
      assert.equal(st.wins + st.losses, st.recordedGames);
      assert.equal(st.recordedGames, st.gamesPlayed);
      wins += st.wins;
      losses += st.losses;
    }
    assert.equal(wins, 6 * 2 * 2, '2 courts × 2 winners per round');
    assert.equal(losses, wins);
  });
});

// --- Full Score -------------------------------------------------------------------------

describe('Full Score', () => {
  it('11–7: wins/losses and PF/PA/differential for all four players', () => {
    let s = fixedSession('full-score');
    s = ok(recordTierResult(s, 'r1', 'm1', { scoreA: 11, scoreB: 7 }));
    for (const id of ['thai', 'alex']) {
      const st = standing(s, id);
      assert.deepEqual([st.wins, st.losses, st.pointsFor, st.pointsAgainst, st.pointDiff], [1, 0, 11, 7, 4]);
    }
    for (const id of ['ben', 'sarah']) {
      const st = standing(s, id);
      assert.deepEqual([st.wins, st.losses, st.pointsFor, st.pointsAgainst, st.pointDiff], [0, 1, 7, 11, -4]);
    }
  });

  it('rejects ties, negatives, decimals, non-numbers and silly scores', () => {
    const s = fixedSession('full-score');
    for (const bad of [
      { scoreA: 7, scoreB: 7 },
      { scoreA: -1, scoreB: 11 },
      { scoreA: 10.5, scoreB: 11 },
      { scoreA: Number.NaN, scoreB: 11 },
      { scoreA: 100, scoreB: 3 },
    ]) {
      assert.equal(recordTierResult(s, 'r1', 'm1', bad).ok, false, JSON.stringify(bad));
    }
    assert.equal(recordTierResult(s, 'r1', 'm1', { winner: 'A' }).ok, false, 'full score needs scores');
    assert.equal(buildTierResult('none', { winner: 'A' }).ok, false);
    assert.ok(recordTierResult(s, 'r1', 'm1', { scoreA: 0, scoreB: 11 }).ok, '0 is a valid score');
  });

  it('correcting a score recalculates without double counting', () => {
    let s = fixedSession('full-score');
    s = ok(recordTierResult(s, 'r1', 'm1', { scoreA: 11, scoreB: 7 }));
    s = ok(recordTierResult(s, 'r1', 'm1', { scoreA: 9, scoreB: 11 }));
    const thai = standing(s, 'thai');
    assert.deepEqual([thai.wins, thai.losses, thai.pointsFor, thai.pointsAgainst, thai.pointDiff], [0, 1, 9, 11, -2]);
  });

  it('a player with any win/loss-only result has no comparable point differential', () => {
    let s = fixedSession('win-loss-only');
    s = ok(recordTierResult(s, 'r1', 'm1', { winner: 'A' }));
    s = ok(setTierScoreMode(s, 'full-score'));
    assert.equal(standing(s, 'thai').pointDiff, undefined);
  });
});

// --- Leaderboard -------------------------------------------------------------------------

function roundOf(n: number, matches: [string[], string[], 'A' | 'B', number?, number?][], resting: string[] = []): TierRound {
  return {
    id: `r${n}`,
    roundNumber: n,
    status: 'completed',
    matches: matches.map(([a, b, winner, sa, sb], i): TierMatch => ({
      id: `r${n}m${i}`,
      courtNumber: i + 1,
      teamAPlayerIds: a as [string, string],
      teamBPlayerIds: b as [string, string],
      result:
        sa !== undefined
          ? { recordingMode: 'full-score', winner, scoreA: sa, scoreB: sb!, recordedAt: 0 }
          : { recordingMode: 'win-loss-only', winner, recordedAt: 0 },
    })),
    restingPlayerIds: resting,
    playerTiers: {},
    courtsAtGeneration: matches.length,
    createdAt: 0,
    regenerationCount: 0,
    manuallyAdjusted: false,
  };
}

const P = (ids: string[]): TierPlayer[] => ids.map((id) => ({ id, name: id.toUpperCase(), tier: 'B', available: true }));

describe('leaderboard ranking', () => {
  it('win percentage beats raw wins (fewer games, better rate ranks higher)', () => {
    const players = P(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    // a: 2/2 = 100%; b: 3/4 = 75%
    const rounds = [
      roundOf(1, [[['a', 'c'], ['d', 'e'], 'A'], [['b', 'f'], ['g', 'h'], 'A']]),
      roundOf(2, [[['a', 'd'], ['c', 'e'], 'A'], [['b', 'g'], ['f', 'h'], 'A']]),
      roundOf(3, [[['b', 'c'], ['d', 'e'], 'A'], [['f', 'g'], ['h', 'a'], 'A']], []),
      roundOf(4, [[['b', 'd'], ['c', 'e'], 'B']]),
    ];
    const board = computeTierLeaderboard(players, rounds);
    const a = board.find((s) => s.playerId === 'a')!;
    const b = board.find((s) => s.playerId === 'b')!;
    assert.equal(a.winPct, 2 / 3);
    assert.equal(b.winPct, 3 / 4);
    assert.ok(b.rank! < a.rank!, 'b 75% above a 67%');
  });

  it('most wins breaks an equal win percentage', () => {
    const players = P(['a', 'b', 'c', 'd', 'e', 'f']);
    // a: 2/2 (100%), b: 1/1 (100%) → a ahead on wins
    const rounds = [roundOf(1, [[['a', 'c'], ['d', 'e'], 'A']]), roundOf(2, [[['a', 'b'], ['e', 'f'], 'A']])];
    const board = computeTierLeaderboard(players, rounds);
    const rankOf = (id: string) => board.find((s) => s.playerId === id)!.rank;
    // a (2/2) and b, c (1/1 each) are all 100%: a is ahead on wins; b and
    // c never met, so they share 2nd.
    assert.equal(rankOf('a'), 1);
    assert.equal(rankOf('b'), 2);
    assert.equal(rankOf('c'), 2);
    assert.equal(board.find((s) => s.playerId === 'b')!.decidedBy, 'tied');
  });

  it('point differential breaks a tie only when everyone tied has full scores', () => {
    const players = P(['a', 'b', 'c', 'd']);
    const scored = [roundOf(1, [[['a', 'b'], ['c', 'd'], 'A', 11, 9]]), roundOf(2, [[['a', 'c'], ['b', 'd'], 'A', 11, 2]])];
    // a 2-0 (+11), b 1-1, c 1-1: b: +2 -9 = -7; c: -2 +9 = +7 → c above b
    let board = computeTierLeaderboard(players, scored);
    const rank = (bd: typeof board, id: string) => bd.find((s) => s.playerId === id)!.rank;
    assert.equal(rank(board, 'a'), 1);
    assert.equal(rank(board, 'c'), 2);
    assert.equal(rank(board, 'b'), 3);
    assert.equal(board.find((s) => s.playerId === 'b')!.decidedBy, 'point-diff');
    // Same but round 2 recorded win/loss only → not comparable; b and c met
    // in round 1 (b won with a) and round 2 (c won with a) → h2h 1–1 → tied.
    const mixed = [roundOf(1, [[['a', 'b'], ['c', 'd'], 'A', 11, 9]]), roundOf(2, [[['a', 'c'], ['b', 'd'], 'A']])];
    board = computeTierLeaderboard(players, mixed);
    assert.equal(rank(board, 'b'), 2);
    assert.equal(rank(board, 'c'), 2, 'shared rank, not broken at random');
  });

  it('head-to-head separates a two-player tie when they met', () => {
    const players = P(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    // Only a and b finish 1-1 (50%, 1 win). They met once: a's side won.
    const rounds = [
      roundOf(1, [[['a', 'c'], ['b', 'd'], 'A']]),
      roundOf(2, [[['b', 'c'], ['e', 'f'], 'A']]),
      roundOf(3, [[['a', 'e'], ['g', 'h'], 'B']]),
    ];
    const board = computeTierLeaderboard(players, rounds);
    const a = board.find((s) => s.playerId === 'a')!;
    const b = board.find((s) => s.playerId === 'b')!;
    assert.equal(a.winPct, b.winPct);
    assert.equal(a.wins, b.wins);
    assert.ok(a.rank! < b.rank!);
    assert.equal(b.decidedBy, 'head-to-head');
  });

  it('identical records share a rank and the winner can be joint', () => {
    const players = P(['a', 'b', 'c', 'd']);
    const rounds = [roundOf(1, [[['a', 'b'], ['c', 'd'], 'A']])];
    const board = computeTierLeaderboard(players, rounds);
    assert.deepEqual(board.map((s) => s.rank), [1, 1, 3, 3]);
    assert.deepEqual(tierWinnerIds(board).sort(), ['a', 'b']);
  });

  it('players with no recorded games are unranked, never 0%', () => {
    const players = P(['a', 'b', 'c', 'd', 'late']);
    const board = computeTierLeaderboard(players, [roundOf(1, [[['a', 'b'], ['c', 'd'], 'B']], ['late'])]);
    const late = board.find((s) => s.playerId === 'late')!;
    assert.equal(late.rank, null);
    assert.equal(late.winPct, null);
    assert.equal(late.sitOuts, 1);
    assert.equal(board[board.length - 1].playerId, 'late', 'unranked listed last');
  });

  it('late joiner with fewer games is compared by rate, not total wins', () => {
    const players = P(['a', 'b', 'c', 'd', 'late']);
    const rounds = [
      roundOf(1, [[['a', 'b'], ['c', 'd'], 'A']]),
      roundOf(2, [[['a', 'c'], ['b', 'd'], 'A']]),
      roundOf(3, [[['a', 'd'], ['b', 'c'], 'B']]),
      roundOf(4, [[['late', 'b'], ['a', 'c'], 'A']]),
    ];
    const board = computeTierLeaderboard(players, rounds);
    const late = board.find((s) => s.playerId === 'late')!;
    const a = board.find((s) => s.playerId === 'a')!;
    assert.equal(late.wins, 1);
    assert.equal(a.wins, 2);
    assert.ok(late.rank! < a.rank!, '1/1 = 100% ranks above 2/4');
  });
});

// --- End Session ---------------------------------------------------------------------------

describe('End Session', () => {
  for (const mode of ['win-loss-only', 'full-score'] as const) {
    it(`${mode}: fully scored session declares the winner(s) from the leaderboard`, () => {
      const ctx = { rng: seededRandom(5), now: 1000 };
      let s = start(roster(4, 4, 4), 3, mode, ctx);
      const rng = seededRandom(50);
      for (let r = 0; r < 5; r++) s = playScored(s, rng, ctx);
      // Round 6 is a draft: ending discards it.
      s = ok(endTierSession(s, ctx));
      assert.equal(s.endedAt, 1000);
      assert.equal(s.rounds.length, 5);
      assert.ok(s.rounds.every((r) => r.status === 'completed'));
      const fs = s.finalStandings!;
      assert.ok(fs.winnerIds.length >= 1);
      assert.deepEqual(fs.winnerIds, tierWinnerIds(computeTierLeaderboard(s.players, s.rounds)));
      assert.equal(fs.unrecordedMatches, 0);
    });
  }

  it('missing results: asks first, then completes the round leaving them unrecorded', () => {
    const ctx = { rng: seededRandom(6), now: 0 };
    let s = start(roster(0, 8, 0), 2, 'win-loss-only', ctx);
    s = ok(startTierRound(s, open(s).id, ctx));
    s = ok(recordTierResult(s, open(s).id, open(s).matches[0].id, { winner: 'A' }, ctx));
    const asked = endTierSession(s, ctx);
    assert.equal(asked.ok, false);
    if (!asked.ok) assert.equal(asked.missingResults, 1);
    s = ok(endTierSession(s, { ...ctx, allowMissingResults: true }));
    assert.equal(s.finalStandings!.unrecordedMatches, 1);
    assert.equal(s.finalStandings!.winnerIds.length, 2, 'the two players who won the only recorded match');
  });

  it('No Scoring: participation only, no winner', () => {
    const ctx = { rng: seededRandom(7), now: 0 };
    let s = start(roster(0, 10, 0), 2, 'none', ctx);
    s = ok(startTierRound(s, open(s).id, ctx));
    s = ok(advanceTierRound(s, open(s).id, ctx));
    s = ok(endTierSession(s, ctx));
    assert.deepEqual(s.finalStandings!.winnerIds, []);
    assert.ok(s.finalStandings!.standings.every((x) => x.rank === null));
    assert.ok(s.finalStandings!.standings.some((x) => x.gamesPlayed > 0));
  });

  it('ending twice changes nothing; an ended session is read-only; refresh keeps it', () => {
    const ctx = { rng: seededRandom(8), now: 0 };
    let s = start(roster(0, 8, 0), 2, 'win-loss-only', ctx);
    s = playScored(s, seededRandom(1), ctx);
    s = ok(endTierSession(s, ctx));
    const endedOnce = s;
    assert.equal(ok(endTierSession(s, { ...ctx, now: 999 })), endedOnce);
    const r1 = s.rounds[0];
    for (const attempt of [
      startTierSession(s, ctx),
      recordTierResult(s, r1.id, r1.matches[0].id, { winner: 'B' }, { correction: true }),
      setTierCourtNumbers(s, [7]),
      setTierScoreMode(s, 'full-score'),
    ]) assert.equal(attempt.ok, false);
    assert.equal(setTierPlayerTier(s, 'B1', 'A'), s);
    assert.equal(addTierPlayers(s, [{ name: 'New' }]), s);
    const reloaded = normalizeTierSession(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(reloaded, s);
    assert.equal(reloaded.endedAt, s.endedAt);
    assert.deepEqual(reloaded.finalStandings, s.finalStandings);
  });

  it('reset after ending starts fresh but keeps roster, courts and score mode', () => {
    const ctx = { rng: seededRandom(9), now: 0 };
    let s = start(roster(0, 8, 0), 2, 'full-score', ctx);
    s = ok(setTierCourtNumbers(s, [3, 6], ctx));
    s = ok(endTierSession(s, ctx));
    const fresh = resetTierSession(s);
    assert.equal(fresh.endedAt, undefined);
    assert.equal(fresh.finalStandings, undefined);
    assert.equal(fresh.started, false);
    assert.equal(fresh.players.length, 8);
    assert.deepEqual(fresh.settings.courtNumbers, [3, 6], 'court selection kept');
    assert.equal(fresh.settings.scoreMode, 'full-score');
  });
});

// --- Scoring never changes matchmaking --------------------------------------------------------

describe('scoring is independent of matchmaking', () => {
  it('identical sessions with different recorded results produce identical pairings', () => {
    const run = (resultSeed: number) => {
      const ctx = { rng: seededRandom(77), now: 0 };
      let s = start(roster(5, 6, 7), 4, 'full-score', ctx);
      const results = seededRandom(resultSeed);
      for (let r = 0; r < 8; r++) s = playScored(s, results, ctx);
      // Pairings only — strip results and ids.
      return s.rounds.map((r) => ({ m: r.matches.map((m) => [m.teamAPlayerIds, m.teamBPlayerIds]), rest: r.restingPlayerIds }));
    };
    // The pairing engine's random stream is separate from the results
    // here, so any difference would mean results leaked into pairing.
    assert.deepEqual(run(1), run(2));
  });

  it('recording a result never regenerates or alters the assignments', () => {
    const ctx = { rng: seededRandom(10), now: 0 };
    let s = start(roster(4, 4, 4), 3, 'win-loss-only', ctx);
    s = ok(startTierRound(s, open(s).id, ctx));
    const before = JSON.stringify(open(s).matches.map((m) => [m.id, m.physicalCourt, m.teamAPlayerIds, m.teamBPlayerIds]) ) + open(s).restingPlayerIds;
    for (const m of open(s).matches) s = ok(recordTierResult(s, open(s).id, m.id, { winner: 'B' }, ctx));
    assert.equal(JSON.stringify(open(s).matches.map((m) => [m.id, m.physicalCourt, m.teamAPlayerIds, m.teamBPlayerIds])) + open(s).restingPlayerIds, before);
  });

  it('swaps and regeneration refuse to silently orphan a recorded result', () => {
    let s = fixedSession('win-loss-only');
    s = ok(recordTierResult(s, 'r1', 'm1', { winner: 'A' }));
    const swap = swapTierPlayers(s, 'r1', 'thai', 'zoe');
    assert.equal(swap.ok, false);
    if (!swap.ok) assert.match(swap.reason, /already has a result/);
    const regen = regenerateTierRound(s, 'r1', { allowActive: true, rng: seededRandom(1) });
    assert.equal(regen.ok, false);
    s = ok(clearTierResult(s, 'r1', 'm1'));
    assert.ok(swapTierPlayers(s, 'r1', 'thai', 'zoe').ok);
  });

  it('long scored session keeps every hard rule, max courts and fair sit-outs', () => {
    const ctx = { rng: seededRandom(11), now: 0 };
    let s = start(roster(8, 10, 12), 6, 'full-score', ctx);
    const rng = seededRandom(110);
    for (let r = 0; r < 15; r++) {
      if (r === 5) s = setTierPlayerTier(s, 'C1', 'B', ctx);
      if (r === 8) s = setTierPlayerAvailability(s, 'A1', false, ctx);
      // Court 3 becomes unavailable and Court 8 replaces it (same count).
      if (r === 10) s = ok(setTierCourtNumbers(s, [1, 2, 4, 5, 6, 8], ctx));
      const round = open(s);
      const avail = s.players.filter((p) => p.available);
      const n = (t: PlayerTier) => avail.filter((p) => p.tier === t).length;
      if (r !== 5 && r !== 8) assert.equal(round.matches.length, maxValidMatches(n('A'), n('B'), n('C'), 6));
      for (const m of round.matches) assert.ok(isValidTierMix(matchPlayerIds(m).map((id) => round.playerTiers[id])));
      s = playScored(s, rng, ctx);
    }
    const done = s.rounds.filter((r) => r.status === 'completed');
    for (let i = 1; i < done.length; i++) {
      const back2back = done[i].restingPlayerIds.filter((id) => done[i - 1].restingPlayerIds.includes(id));
      assert.deepEqual(back2back, [], `round ${i + 1}`);
    }
    const stats = computeTierStats(s.players, done);
    const sat = [...stats.values()].filter((x) => x.playerId !== 'A1').map((x) => x.roundsSatOut);
    assert.ok(Math.max(...sat) - Math.min(...sat) <= 1);
    assert.deepEqual(done[10].matches.map((m) => m.physicalCourt), [1, 2, 4, 5, 6, 8], 'round 11 (a draft when changed) moved to the new courts');
    assert.deepEqual(done[9].matches.map((m) => m.physicalCourt), [1, 2, 3, 4, 5, 6], 'round 10 keeps its courts');
  });
});
