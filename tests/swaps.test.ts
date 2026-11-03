// Swapping any two players in the current round.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DynamicPairingCourtAssignment, DynamicPairingRound, DynamicPairingTeam, Player } from '../src/types';
import {
  calculateDynamicPairingStats,
  clearDynamicPairingCourtResult,
  planDynamicPairingSwap,
  processDynamicPairingResult,
  upcomingConflictsAfterSwap,
} from '../src/utils/dynamicPairingSocial';
import { dynamicPairingScheduleView, validateCurrentRoundMatchesSchedule } from '../src/utils/scheduleValidation';
import { namedPlayers } from './helpers';

const players: Player[] = namedPlayers(['Thai', 'Alex', 'Ben', 'Sarah', 'John', 'Kim', 'David', 'Matt', 'Zoe', 'Liam']);

function court(courtNumber: number, team1: string[], team2: string[], teams: DynamicPairingTeam[] = []): DynamicPairingCourtAssignment {
  const entrants = (side: string[]) => {
    const team = teams.find((t) => t.playerIds.every((id) => side.includes(id)));
    return team ? [team.id] : side;
  };
  return {
    courtNumber,
    playerIds: [...team1, ...team2],
    team1PlayerIds: team1,
    team2PlayerIds: team2,
    ...(teams.length > 0 ? { team1EntrantIds: entrants(team1), team2EntrantIds: entrants(team2) } : {}),
    status: 'pending',
  };
}

// Court 1: Thai / Alex vs Ben / Sarah — Court 2: John / Kim vs David / Matt
// — resting: Zoe, Liam.
function exampleRound(teams: DynamicPairingTeam[] = [], status: DynamicPairingRound['status'] = 'current'): DynamicPairingRound {
  return {
    id: 'r1',
    roundNumber: 1,
    phase: 'grading',
    status,
    courts: [court(1, ['thai', 'alex'], ['ben', 'sarah'], teams), court(2, ['john', 'kim'], ['david', 'matt'], teams)],
    restingPlayerIds: ['zoe', 'liam'],
    ...(teams.length > 0 ? { restingEntrantIds: ['zoe', 'liam'] } : {}),
    createdAt: 0,
  };
}

function sides(round: DynamicPairingRound) {
  return round.courts.map((c) => `${c.team1PlayerIds.join('/')} v ${c.team2PlayerIds.join('/')}`);
}

function plan(round: DynamicPairingRound, a: string, b: string, teams: DynamicPairingTeam[] = []) {
  const result = planDynamicPairingSwap(round, a, b, players, teams);
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}

function assertValidSchedule(rounds: DynamicPairingRound[], teams: DynamicPairingTeam[] = []) {
  const validation = validateCurrentRoundMatchesSchedule({
    rounds: rounds.map(dynamicPairingScheduleView),
    knownPlayerIds: new Set(players.map((p) => p.id)),
    fixedTeams: teams,
  });
  assert.deepEqual(validation.issues, []);
}

describe('swapping players', () => {
  it('swaps players on different courts (the Thai ↔ John example)', () => {
    const { round, summary, before, after } = plan(exampleRound(), 'thai', 'john');
    assert.deepEqual(sides(round), ['john/alex v ben/sarah', 'thai/kim v david/matt']);
    assert.deepEqual(round.restingPlayerIds, ['zoe', 'liam']);
    assert.equal(summary, 'Thai (Court 1) ↔ John (Court 2)');
    assert.deepEqual(before, ['Court 1: Thai / Alex vs Ben / Sarah', 'Court 2: John / Kim vs David / Matt']);
    assert.deepEqual(after, ['Court 1: John / Alex vs Ben / Sarah', 'Court 2: Thai / Kim vs David / Matt']);
    assertValidSchedule([round]);
  });

  it('swaps two players on the same court', () => {
    const { round } = plan(exampleRound(), 'thai', 'ben');
    assert.deepEqual(sides(round), ['ben/alex v thai/sarah', 'john/kim v david/matt']);
  });

  it('rejects swapping partners with each other', () => {
    const result = planDynamicPairingSwap(exampleRound(), 'thai', 'alex', players);
    assert.equal(result.ok, false);
  });

  it('swaps a player on court with a resting player, either way round', () => {
    for (const [a, b] of [
      ['thai', 'zoe'],
      ['zoe', 'thai'],
    ]) {
      const { round } = plan(exampleRound(), a, b);
      assert.deepEqual(sides(round)[0], 'zoe/alex v ben/sarah');
      assert.deepEqual(round.restingPlayerIds, ['liam', 'thai']);
      assertValidSchedule([round]);
    }
  });

  it('rejects swapping two resting players', () => {
    const result = planDynamicPairingSwap(exampleRound(), 'zoe', 'liam', players);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /both resting/);
  });

  it('replaces an unavailable player without counting them as resting', () => {
    const withThaiOut = players.map((p) => (p.id === 'thai' ? { ...p, availabilityStatus: 'unavailable' as const } : p));
    const result = planDynamicPairingSwap(exampleRound(), 'thai', 'zoe', withThaiOut);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(sides(result.plan.round)[0], 'zoe/alex v ben/sarah');
    assert.deepEqual(result.plan.round.restingPlayerIds, ['liam']);
  });

  it("won't put an unavailable player onto a court", () => {
    const withZoeOut = players.map((p) => (p.id === 'zoe' ? { ...p, availabilityStatus: 'injured' as const } : p));
    const result = planDynamicPairingSwap(exampleRound(), 'thai', 'zoe', withZoeOut);
    assert.equal(result.ok, false);
  });

  it('moves a fixed team as a whole side', () => {
    const teams = [{ id: 'team-ta', playerIds: ['thai', 'alex'] as [string, string] }];
    // Thai (fixed team) ↔ John (temporary pair John / Kim on Court 2).
    const { round, movedPlayerIds } = plan(exampleRound(teams), 'thai', 'john', teams);
    assert.deepEqual(sides(round), ['john/kim v ben/sarah', 'thai/alex v david/matt']);
    assert.deepEqual(round.courts[1].team1EntrantIds, ['team-ta']);
    assert.deepEqual(round.courts[0].team1EntrantIds, ['john', 'kim']);
    assert.deepEqual(movedPlayerIds.sort(), ['alex', 'john', 'kim', 'thai']);
    assertValidSchedule([round], teams);
  });

  it('swaps a fixed team with a resting fixed team', () => {
    const teams = [
      { id: 'team-ta', playerIds: ['thai', 'alex'] as [string, string] },
      { id: 'team-zl', playerIds: ['zoe', 'liam'] as [string, string] },
    ];
    const base = { ...exampleRound(teams), restingEntrantIds: ['team-zl'] };
    const { round } = plan(base, 'alex', 'zoe', teams);
    assert.deepEqual(sides(round)[0], 'zoe/liam v ben/sarah');
    assert.deepEqual(round.restingPlayerIds.sort(), ['alex', 'thai']);
    assert.deepEqual(round.restingEntrantIds, ['team-ta']);
    assertValidSchedule([round], teams);
  });

  it('never splits a fixed team', () => {
    const teams = [{ id: 'team-ta', playerIds: ['thai', 'alex'] as [string, string] }];
    // Fixed team ↔ a single resting player isn't possible without a split.
    assert.equal(planDynamicPairingSwap(exampleRound(teams), 'thai', 'zoe', players, teams).ok, false);
    // Fixed team ↔ its own opponents on the same court is meaningless.
    assert.equal(planDynamicPairingSwap(exampleRound(teams), 'thai', 'ben', players, teams).ok, false);
  });

  it('requires a scored court to be reset first, then allows the swap', () => {
    const scored = processDynamicPairingResult(exampleRound(), 1, { kind: 'winner', winner: 'A' });
    const blocked = planDynamicPairingSwap(scored, 'thai', 'john', players);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.match(blocked.reason, /Reset that result/);

    const reset = clearDynamicPairingCourtResult(scored, 1);
    assert.equal(reset.courts[0].winnerTeam, undefined);
    assert.equal(reset.courts[0].status, 'pending');
    assert.ok(planDynamicPairingSwap(reset, 'thai', 'john', players).ok);
  });

  it('never changes a completed round', () => {
    assert.equal(planDynamicPairingSwap(exampleRound([], 'locked'), 'thai', 'john', players).ok, false);
    const locked = processDynamicPairingResult(exampleRound([], 'locked'), 1, { kind: 'winner', winner: 'A' });
    assert.equal(clearDynamicPairingCourtResult(locked, 1), locked);
  });

  it('keeps Current Round and All Rounds identical: both read the one saved round', () => {
    const upcoming: DynamicPairingRound = {
      ...exampleRound(),
      id: 'r2',
      roundNumber: 2,
      status: 'upcoming',
      courts: [court(1, ['zoe', 'ben'], ['thai', 'kim']), court(2, ['liam', 'matt'], ['alex', 'david'])],
      restingPlayerIds: ['john', 'sarah'],
    };
    const saved = [exampleRound(), upcoming];
    const { round } = plan(saved[0], 'thai', 'john');
    const afterSwap = saved.map((r) => (r.id === round.id ? round : r));
    const current = afterSwap.find((r) => r.status === 'current')!;
    assert.equal(current, afterSwap[0]);
    assert.deepEqual(sides(current), ['john/alex v ben/sarah', 'thai/kim v david/matt']);
    assertValidSchedule(afterSwap);
  });

  it('records history for the players who actually played after a swap', () => {
    const { round } = plan(exampleRound(), 'thai', 'john');
    const finished = processDynamicPairingResult({ ...round, status: 'locked' }, 1, { kind: 'winner', winner: 'A' });
    const stats = new Map(calculateDynamicPairingStats(players, [finished]).map((s) => [s.playerId, s]));
    assert.equal(stats.get('john')!.partnerHistory.alex, 1);
    assert.equal(stats.get('thai')!.partnerHistory.kim, 1);
    assert.equal(stats.get('thai')!.partnerHistory.alex, undefined);
  });

  it('flags when a swap makes the next saved round unfair', () => {
    // The next saved round already has John facing Ben; after Thai ↔ John,
    // John faces Ben now too — back to back.
    const next: DynamicPairingRound = {
      ...exampleRound(),
      id: 'r2',
      roundNumber: 2,
      status: 'upcoming',
      courts: [court(1, ['john', 'zoe'], ['ben', 'liam']), court(2, ['thai', 'alex'], ['david', 'kim'])],
      restingPlayerIds: ['sarah', 'matt'],
    };
    const { round, movedPlayerIds } = plan(exampleRound(), 'thai', 'john');
    const conflicts = upcomingConflictsAfterSwap([round, next], round, movedPlayerIds, players);
    assert.ok(conflicts.some((c) => c.includes('John') && c.includes('Ben')), conflicts.join('; '));
  });
});
