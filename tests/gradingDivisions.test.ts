// Grading divisions: division-based grading rounds, then results-driven
// rankings with game lag.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { DynamicPairingRound, GradingDivision } from '../src/types';
import {
  calculateDynamicPairingRankingForRound,
  gradingDivisionLevel,
  lockCompletedRound,
  extendDynamicPairingLookahead,
  normalizeDynamicPairingSettings,
  processDynamicPairingResult,
  setDynamicPairingRandomSource,
} from '../src/utils/dynamicPairingSocial';
import { consecutiveRepeats, currentRound, makePlayers, makeSettings, makeTeams, startSession, seedRandom } from './helpers';

afterEach(() => setDynamicPairingRandomSource(null));

function courtSpread(round: DynamicPairingRound, divisionOf: (playerId: string) => GradingDivision | undefined): number[] {
  return round.courts.map((court) => {
    const levels = court.playerIds.map((id) => gradingDivisionLevel(divisionOf(id)));
    return Math.max(...levels) - Math.min(...levels);
  });
}

const split = (higher: number, lower: number): GradingDivision[] => [
  ...Array<GradingDivision>(higher).fill('higher'),
  ...Array<GradingDivision>(lower).fill('lower'),
];

describe('grading divisions', () => {
  it('keeps every grading court within one division when counts allow, without repeat opponents', () => {
    for (let seed = 1; seed <= 5; seed++) {
      seedRandom(seed);
      const players = makePlayers(16, split(8, 8));
      const divisionOf = (id: string) => players.find((p) => p.id === id)!.gradingDivision;
      const settings = makeSettings({ numberOfCourts: 4, gradingRounds: 2, useGradingDivisions: true });
      const rounds = startSession(players, [], settings).filter((r) => r.phase === 'grading');

      assert.equal(rounds.length, 2);
      for (const round of rounds) {
        assert.equal(round.gradingMode, 'divisions');
        assert.deepEqual(courtSpread(round, divisionOf), [0, 0, 0, 0], `seed ${seed} round ${round.roundNumber}`);
      }
      // Higher division plays on the first courts.
      assert.ok(rounds[0].courts.slice(0, 2).every((c) => c.playerIds.every((id) => divisionOf(id) === 'higher')));
      // Round 2 brings different opponents.
      assert.equal(consecutiveRepeats(rounds).opponents, 0);
      assert.ok(rounds.every((r) => r.rotationNote == null));
    }
  });

  it('mixes divisions only as much as player counts require', () => {
    seedRandom(9);
    // 6 higher + 6 lower on 3 courts: one court must hold both divisions.
    const players = makePlayers(12, split(6, 6));
    const divisionOf = (id: string) => players.find((p) => p.id === id)!.gradingDivision;
    const settings = makeSettings({ numberOfCourts: 3, gradingRounds: 1, useGradingDivisions: true });
    const round = currentRound(startSession(players, [], settings));
    const spreads = courtSpread(round, divisionOf);
    assert.equal(round.courts.length, 3);
    assert.equal(spreads.filter((s) => s > 0).length, 1, `spreads ${spreads}`);
    assert.equal(new Set(round.courts.flatMap((c) => c.playerIds)).size, 12);
  });

  it('prefers a neighbouring division when it has to mix', () => {
    seedRandom(4);
    // 4 higher, 2 intermediate, 6 lower: the 2 intermediates should join
    // a court with 2 others — never pull higher and lower onto one court.
    const divisions: GradingDivision[] = [...split(4, 0), 'intermediate', 'intermediate', ...split(0, 6)];
    const players = makePlayers(12, divisions);
    const divisionOf = (id: string) => players.find((p) => p.id === id)!.gradingDivision;
    const round = currentRound(startSession(players, [], makeSettings({ numberOfCourts: 3, gradingRounds: 1, useGradingDivisions: true })));
    assert.ok(courtSpread(round, divisionOf).every((s) => s <= 1));
  });

  it('keeps fixed teams together and places them by the team division', () => {
    for (let seed = 1; seed <= 4; seed++) {
      seedRandom(seed);
      // Team t0 + 6 individuals are Higher, team t1 + 6 individuals Lower:
      // 8 physical players each, so no court needs to mix.
      const teams = makeTeams(2).map((t, i) => ({ ...t, gradingDivision: (i === 0 ? 'higher' : 'lower') as GradingDivision }));
      const players = makePlayers(16, [undefined, undefined, undefined, undefined, ...split(6, 6)]);
      const divisionOf = (id: string): GradingDivision | undefined =>
        teams.find((t) => t.playerIds.includes(id))?.gradingDivision ?? players.find((p) => p.id === id)!.gradingDivision;
      const settings = makeSettings({ numberOfCourts: 4, gradingRounds: 2, useGradingDivisions: true });
      const rounds = startSession(players, teams, settings).filter((r) => r.phase === 'grading');
      for (const round of rounds) {
        for (const court of round.courts) {
          for (const team of teams) {
            const onCourt = team.playerIds.filter((id) => court.playerIds.includes(id)).length;
            const together = [court.team1PlayerIds, court.team2PlayerIds].some((side) => team.playerIds.every((id) => side.includes(id)));
            assert.ok(onCourt === 0 || (onCourt === 2 && together), 'team members always share one side');
          }
        }
      }
      // Round 1 has no history to work around, so it is division-pure. Later
      // rounds may mix neighbouring divisions, but only when staying within
      // a division would repeat an opponent or partner — the spec puts
      // variety above division grouping.
      assert.deepEqual(courtSpread(rounds[0], divisionOf), [0, 0, 0, 0], `seed ${seed}`);
      assert.deepEqual(consecutiveRepeats(rounds, teams), { opponents: 0, partners: 0 }, `seed ${seed}`);
    }
  });

  it('keeps random grading when divisions are off, even if divisions were assigned', () => {
    seedRandom(2);
    const players = makePlayers(8, split(4, 4));
    const round = currentRound(startSession(players, [], makeSettings({ useGradingDivisions: false })));
    assert.equal(round.gradingMode, undefined);
  });

  it('generates Round 3 from Round 1 results as soon as they are in (2 grading rounds, game lag 1)', () => {
    seedRandom(5);
    const players = makePlayers(8, split(4, 4));
    const settings = makeSettings({ gradingRounds: 2, rankingLagRounds: 1, useGradingDivisions: true });
    let rounds = startSession(players, [], settings);
    assert.equal(rounds.find((r) => r.roundNumber === 3)?.status, 'pending-results');

    // Round 1: the lower division wins everything.
    const round1 = currentRound(rounds);
    let scored = round1;
    for (const court of round1.courts) {
      const lowerOnSideA = court.team1PlayerIds.some((id) => players.find((p) => p.id === id)!.gradingDivision === 'lower');
      scored = processDynamicPairingResult(scored, court.courtNumber, { kind: 'winner', winner: lowerOnSideA ? 'A' : 'B' });
    }
    rounds = rounds.map((r) => (r.id === round1.id ? lockCompletedRound(scored) : r.roundNumber === 2 ? { ...r, status: 'current' as const } : r));
    rounds = extendDynamicPairingLookahead(players, [], settings, rounds);

    const round3 = rounds.find((r) => r.roundNumber === 3)!;
    assert.equal(round3.status, 'upcoming');
    assert.equal(round3.phase, 'ranking');
    assert.deepEqual(round3.rankingBasis?.includedRoundNumbers, [1]);
    assert.equal(rounds.find((r) => r.roundNumber === 4)?.status, 'pending-results');

    // Divisions were only a starting point: actual results now rank winners
    // above losers regardless of division.
    const { ranking } = calculateDynamicPairingRankingForRound(players, [], [lockCompletedRound(scored)], 3, 1, {
      useGradingDivisions: true,
    });
    const winners = new Set(
      scored.courts.flatMap((c) => (c.winnerTeam === 1 ? c.team1PlayerIds : c.team2PlayerIds)),
    );
    const order = ranking.map((r) => r.entrant.id);
    const lastWinner = Math.max(...order.map((id, i) => (winners.has(id) ? i : -1)));
    const firstLoser = Math.min(...order.map((id, i) => (winners.has(id) ? Infinity : i)));
    assert.ok(lastWinner < firstLoser, 'every winner ranks above every loser');
  });

  it('breaks ranking ties by division only when divisions are on', () => {
    const players = makePlayers(4, ['lower', 'higher', 'intermediate', undefined]);
    const on = calculateDynamicPairingRankingForRound(players, [], [], 1, 1, { useGradingDivisions: true }).ranking;
    assert.equal(on[0].entrant.id, 'p1');
    assert.equal(on[on.length - 1].entrant.id, 'p0');
    const off = calculateDynamicPairingRankingForRound(players, [], [], 1, 1).ranking;
    const offAgain = calculateDynamicPairingRankingForRound(makePlayers(4), [], [], 1, 1).ranking;
    assert.deepEqual(
      off.map((r) => r.entrant.id),
      offAgain.map((r) => r.entrant.id),
      'with divisions off, assigned divisions change nothing',
    );
  });

  it('reads settings saved before divisions existed as divisions off', () => {
    const { useGradingDivisions: _omit, ...legacy } = makeSettings();
    void _omit;
    const normalized = normalizeDynamicPairingSettings(legacy as ReturnType<typeof makeSettings>);
    assert.equal(normalized.useGradingDivisions, false);
    assert.equal(normalized.scoreRecordingMode, 'win-loss-only');
  });
});
