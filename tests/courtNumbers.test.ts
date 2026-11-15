// Court Number Selection: physical court numbers vs. the active court count.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PlayerTier, TierPlayer, TierRound, TierSession } from '../src/types';
import {
  adjustCourtNumbers,
  cleanCourtNumbers,
  courtLabel,
  physicalCourt,
  resolveCourtNumbers,
  stampCourtNumbers,
  toggleCourtNumber,
} from '../src/utils/courtNumbers';
import { validateKingCourtSeeding, validateNextCycleAssignments } from '../src/utils/kingCourt';
import { computeTierStats, matchCourtLabel, matchPlayerIds } from '../src/utils/tierPairings';
import {
  advanceTierRound,
  createTierSession,
  normalizeTierSession,
  openTierRound,
  openTierRoundIssues,
  regenerateTierRound,
  setTierCourtNumbers,
  startTierRound,
  startTierSession,
  type TierContext,
  type TierResult,
} from '../src/utils/tierSession';
import { seededRandom } from './helpers';

function ok(r: TierResult): TierSession {
  if (!r.ok) throw new Error(r.reason);
  return r.session;
}

function roster(n: number, tier: PlayerTier = 'B'): TierPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, tier, available: true }));
}

function open(s: TierSession): TierRound {
  const r = openTierRound(s);
  if (!r) throw new Error('no open round');
  return r;
}

function play(s: TierSession, ctx: TierContext): TierSession {
  const id = open(s).id;
  return ok(advanceTierRound(ok(startTierRound(s, id, ctx)), id, ctx));
}

function startWith(courtNumbers: number[], players: TierPlayer[], ctx: TierContext): TierSession {
  const base = { ...createTierSession({ courtNumbers, scoreMode: 'none' }), players };
  return ok(startTierSession(base, ctx));
}

describe('shared court-number helpers', () => {
  it('position i maps to the i-th selected court, not to i', () => {
    assert.equal(physicalCourt([3, 6], 1), 3);
    assert.equal(physicalCourt([3, 6], 2), 6);
    assert.equal(courtLabel([3, 6], 2), 'Court 6');
    assert.equal(courtLabel(undefined, 2), 'Court 2', 'older saves fall back to the position');
  });

  it('selections are sorted, unique and positive; the count is the length', () => {
    assert.deepEqual(cleanCourtNumbers([6, 3, 6, 0, -1, 2.5, 100, 'x']), [3, 6]);
    assert.equal(cleanCourtNumbers([]), null);
    assert.deepEqual(resolveCourtNumbers([3, 6], 2), [3, 6]);
    assert.deepEqual(resolveCourtNumbers([3, 6], 3), [1, 2, 3], 'a mismatched saved list falls back to 1..count');
    assert.deepEqual(resolveCourtNumbers(undefined, 4), [1, 2, 3, 4]);
  });

  it('toggling never allows duplicates or an empty selection', () => {
    assert.deepEqual(toggleCourtNumber([3, 6], 4), [3, 4, 6]);
    assert.deepEqual(toggleCourtNumber([3, 4, 6], 3), [4, 6]);
    assert.equal(toggleCourtNumber([6], 6), null, 'the last court cannot be deselected');
    assert.equal(toggleCourtNumber([3], 0), null);
  });

  it('count-only changes keep the selected courts and add the lowest free numbers', () => {
    assert.deepEqual(adjustCourtNumbers([3, 6], 3), [1, 3, 6]);
    assert.deepEqual(adjustCourtNumbers([3, 6, 9], 2), [3, 6]);
  });

  it('stamping: upcoming rounds follow the selection, the open round only once or on request, completed never', () => {
    const statuses = { upcoming: ['upcoming'], open: ['current'] };
    const rounds = [
      { id: 'a', status: 'completed', courtNumbers: [1, 2] },
      { id: 'b', status: 'current', courtNumbers: [1, 2] },
      { id: 'c', status: 'upcoming', courtNumbers: [1, 2] },
      { id: 'd', status: 'upcoming' },
      { id: 'e', status: 'completed' },
    ];
    const stamped = stampCourtNumbers(rounds, [3, 6], statuses);
    assert.deepEqual(stamped.map((r) => r.courtNumbers), [[1, 2], [1, 2], [3, 6], [3, 6], undefined]);
    const reassigned = stampCourtNumbers(rounds, [3, 6], statuses, true);
    assert.deepEqual(reassigned[1].courtNumbers, [3, 6]);
    const fresh = stampCourtNumbers<{ id: string; status: string; courtNumbers?: number[] }>([{ id: 'x', status: 'current' }], [4], statuses);
    assert.deepEqual(fresh[0].courtNumbers, [4], 'an unstamped open round is stamped once');
    assert.equal(stampCourtNumbers(stamped, [3, 6], statuses), stamped, 'no change → same array (safe in effects)');
  });

  it('King Court validation names the physical court', () => {
    const r = validateNextCycleAssignments([{ playerId: 'a', courtNumber: 2 }], 2, [3, 6]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /^Court 3 /, 'position 1 = Court 3');
    const players = Array.from({ length: 10 }, (_, i) => ({ id: `k${i}`, name: `K${i}` }));
    const seeding = players.map((p, i) => ({ playerId: p.id, courtNumber: i < 5 ? 1 : 2 })).slice(0, 9);
    const check = validateKingCourtSeeding(seeding, players, 2, [3, 6]);
    assert.equal(check.ok, false);
  });
});

describe('Tier-Based Pairings court numbers (spec scenarios 1–9)', () => {
  it('1–2. Courts 3 and 6 → two active courts; matches on Court 3 then Court 6', () => {
    const s = startWith([3, 6], roster(10), { rng: seededRandom(1), now: 0 });
    assert.equal(s.settings.numberOfCourts, 2);
    assert.deepEqual(s.settings.courtNumbers, [3, 6]);
    const r = open(s);
    assert.equal(r.matches.length, 2);
    assert.deepEqual(r.matches.map((m) => m.physicalCourt), [3, 6]);
    assert.deepEqual(r.matches.map(matchCourtLabel), ['Court 3', 'Court 6']);
    assert.equal(r.restingPlayerIds.length, 2, 'capacity = 2 courts, not 6');
  });

  it('3. adding Court 4 mid-session → next round uses Courts 3, 4 and 6', () => {
    const ctx = { rng: seededRandom(2), now: 0 };
    let s = startWith([3, 6], roster(12), ctx);
    s = ok(startTierRound(s, open(s).id, ctx));
    const inPlay = JSON.stringify(open(s).matches);
    s = ok(setTierCourtNumbers(s, [3, 4, 6], ctx));
    assert.equal(JSON.stringify(open(s).matches), inPlay, 'the round in play is unchanged');
    assert.equal(s.settings.numberOfCourts, 3);
    s = ok(advanceTierRound(s, open(s).id, ctx));
    assert.deepEqual(open(s).matches.map((m) => m.physicalCourt), [3, 4, 6]);
    assert.equal(open(s).restingPlayerIds.length, 0);
  });

  it('4. removing Court 3 → future rounds use Courts 4 and 6; a draft moves at once', () => {
    const ctx = { rng: seededRandom(3), now: 0 };
    let s = startWith([3, 4, 6], roster(12), ctx);
    s = play(s, ctx); // round 2 is now a draft on 3, 4, 6
    s = ok(setTierCourtNumbers(s, [4, 6], ctx));
    assert.ok(openTierRoundIssues(s).some((i) => /only 2/.test(i)), 'the 3-match draft is flagged for 2 courts');
    s = ok(regenerateTierRound(s, open(s).id, ctx));
    assert.deepEqual(open(s).matches.map((m) => m.physicalCourt), [4, 6]);
    s = play(s, ctx);
    assert.deepEqual(open(s).matches.map((m) => m.physicalCourt), [4, 6]);
  });

  it('same count, different courts: a draft follows; a round in play only when asked', () => {
    const ctx = { rng: seededRandom(4), now: 0 };
    let s = startWith([3, 6], roster(8), ctx);
    const players = JSON.stringify(open(s).matches.map(matchPlayerIds));
    s = ok(setTierCourtNumbers(s, [2, 6], ctx));
    assert.deepEqual(open(s).matches.map((m) => m.physicalCourt), [2, 6], 'draft relabelled');
    assert.equal(JSON.stringify(open(s).matches.map(matchPlayerIds)), players, 'nobody moved');
    s = ok(startTierRound(s, open(s).id, ctx));
    s = ok(setTierCourtNumbers(s, [1, 6], ctx));
    assert.deepEqual(open(s).matches.map((m) => m.physicalCourt), [2, 6], 'round in play unchanged by default');
    assert.ok(openTierRoundIssues(s).some((i) => /Court 2 is no longer in use/.test(i)));
    s = ok(setTierCourtNumbers(s, [1, 6], { ...ctx, applyToOpen: true }));
    assert.deepEqual(open(s).matches.map((m) => m.physicalCourt), [1, 6], 'explicit reassignment');
    assert.equal(JSON.stringify(open(s).matches.map(matchPlayerIds)), players);
  });

  it('5. duplicates and empty selections are rejected', () => {
    const s = createTierSession({ courtNumbers: [3, 6] });
    assert.equal(setTierCourtNumbers(s, [3, 3]).ok, false);
    assert.equal(setTierCourtNumbers(s, []).ok, false);
    assert.equal(setTierCourtNumbers(s, [0]).ok, false);
    assert.deepEqual(ok(setTierCourtNumbers(s, [6, 3, 9])).settings.courtNumbers, [3, 6, 9], 'sorted');
  });

  it('6–7. court numbers survive a reload; completed rounds keep their original courts', () => {
    const ctx = { rng: seededRandom(5), now: 0 };
    let s = startWith([3, 6], roster(8), ctx);
    s = play(s, ctx);
    s = ok(setTierCourtNumbers(s, [1, 2], ctx));
    s = play(s, ctx);
    const reloaded = normalizeTierSession(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(reloaded, s);
    assert.deepEqual(reloaded.settings.courtNumbers, [1, 2]);
    const done = reloaded.rounds.filter((r) => r.status === 'completed');
    assert.deepEqual(done[0].matches.map((m) => m.physicalCourt), [3, 6], 'round 1 still on 3 and 6');
    assert.deepEqual(done[1].matches.map((m) => m.physicalCourt), [1, 2], 'round 2 (draft when changed) moved');
  });

  it('older saves: text "Court N" labels become physical numbers; missing selection → 1..N', () => {
    const legacy = normalizeTierSession({
      started: true,
      settings: { numberOfCourts: 2, courts: [{ id: 'court-1', name: 'Court 1' }], scoreMode: 'none' },
      players: roster(8),
      rounds: [
        {
          id: 'r',
          roundNumber: 1,
          status: 'completed',
          matches: [
            { id: 'm', courtNumber: 1, courtId: 'court-3', courtName: 'Court 3', teamAPlayerIds: ['p0', 'p1'], teamBPlayerIds: ['p2', 'p3'] },
            { id: 'n', courtNumber: 2, courtName: 'Championship', teamAPlayerIds: ['p4', 'p5'], teamBPlayerIds: ['p6', 'p7'] },
          ],
          restingPlayerIds: [],
        },
      ],
    });
    assert.deepEqual(legacy.settings.courtNumbers, [1, 2]);
    assert.equal(legacy.rounds[0].matches[0].physicalCourt, 3);
    assert.equal(legacy.rounds[0].matches[1].physicalCourt, undefined);
    assert.equal(matchCourtLabel(legacy.rounds[0].matches[1]), 'Court 2');
    assert.ok(!('courtName' in legacy.rounds[0].matches[0]));
  });

  it('9. capacity and bye rotation use the active court count over many rounds', () => {
    const ctx = { rng: seededRandom(6), now: 0 };
    let s = startWith([2, 5, 9], roster(15), ctx);
    for (let r = 0; r < 10; r++) {
      const round = open(s);
      assert.equal(round.matches.length, 3);
      assert.equal(round.restingPlayerIds.length, 3);
      assert.deepEqual(round.matches.map((m) => m.physicalCourt), [2, 5, 9]);
      s = play(s, ctx);
    }
    const done = s.rounds.filter((r) => r.status === 'completed');
    for (let i = 1; i < done.length; i++) {
      for (const id of done[i].restingPlayerIds) assert.ok(!done[i - 1].restingPlayerIds.includes(id), 'no back-to-back sit-outs');
    }
    const sat = [...computeTierStats(s.players, done).values()].map((x) => x.roundsSatOut);
    assert.ok(Math.max(...sat) - Math.min(...sat) <= 1);
  });
});
