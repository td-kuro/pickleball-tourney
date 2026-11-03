// Win/Loss-only history and repeat-pairing regressions (opponents/partners
// repeating in back-to-back rounds).
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { DynamicPairingRound } from '../src/types';
import {
  calculateDynamicPairingStats,
  calculateEntrantRankings,
  isDynamicPairingRoundComplete,
  processDynamicPairingResult,
  regenerateUpcomingRoundsForEntrants,
  setDynamicPairingRandomSource,
} from '../src/utils/dynamicPairingSocial';
import {
  allScheduledRounds,
  consecutiveRepeats,
  currentRound,
  encounters,
  makePlayers,
  makeSettings,
  namedPlayers,
  playedInOrder,
  playSession,
  scoreCurrentRound,
  startSession,
  seedRandom,
} from './helpers';

afterEach(() => setDynamicPairingRandomSource(null));

function court(team1: string[], team2: string[], courtNumber = 1) {
  return { courtNumber, playerIds: [...team1, ...team2], team1PlayerIds: team1, team2PlayerIds: team2, status: 'pending' as const };
}

describe('Win/Loss-only results', () => {
  it('records partners, opponents, the result and completion without scores', () => {
    const players = namedPlayers(['Thai', 'Alex', 'Ben', 'Sarah']);
    const round: DynamicPairingRound = {
      id: 'r1',
      roundNumber: 1,
      phase: 'grading',
      status: 'current',
      courts: [court(['thai', 'alex'], ['ben', 'sarah'])],
      restingPlayerIds: [],
      createdAt: 0,
    };
    const scored = processDynamicPairingResult(round, 1, { kind: 'winner', winner: 'A' });

    assert.equal(scored.courts[0].status, 'completed');
    assert.equal(scored.courts[0].winnerTeam, 1);
    assert.equal(scored.courts[0].score1, undefined);
    assert.ok(isDynamicPairingRoundComplete(scored));

    const stats = new Map(calculateDynamicPairingStats(players, [scored]).map((s) => [s.playerId, s]));
    assert.equal(stats.get('thai')!.partnerHistory.alex, 1);
    assert.equal(stats.get('ben')!.partnerHistory.sarah, 1);
    for (const winner of ['thai', 'alex']) {
      assert.equal(stats.get(winner)!.opponentHistory.ben, 1);
      assert.equal(stats.get(winner)!.opponentHistory.sarah, 1);
      assert.equal(stats.get(winner)!.wins, 1);
      assert.equal(stats.get(winner)!.gamesPlayed, 1);
      assert.equal(stats.get(winner)!.scoredGamesPlayed, 0);
    }
    for (const loser of ['ben', 'sarah']) assert.equal(stats.get(loser)!.losses, 1);
  });

  it("records a fixed team's result once, as one entrant", () => {
    const players = namedPlayers(['Thai', 'Alex', 'Ben', 'Sarah']);
    const teams = [{ id: 'team-ta', playerIds: ['thai', 'alex'] as [string, string] }];
    const round: DynamicPairingRound = {
      id: 'r1',
      roundNumber: 1,
      phase: 'grading',
      status: 'locked',
      courts: [{ ...court(['thai', 'alex'], ['ben', 'sarah']), team1EntrantIds: ['team-ta'], team2EntrantIds: ['ben', 'sarah'] }],
      restingPlayerIds: [],
      createdAt: 0,
    };
    const scored = processDynamicPairingResult(round, 1, { kind: 'winner', winner: 'A' });
    const rows = calculateEntrantRankings(players, teams, [scored]);
    const team = rows.find((r) => r.entrant.id === 'team-ta')!;
    assert.equal(team.stats.wins, 1);
    assert.equal(team.stats.gamesPlayed, 1);
    assert.equal(rows.length, 3); // the team plus two individuals
    assert.equal(rows.find((r) => r.entrant.id === 'ben')!.stats.losses, 1);
  });
});

describe('repeat opponents and partners', () => {
  const sizes: [number, number][] = [
    [8, 2],
    [9, 2],
    [10, 2],
    [12, 3],
    [13, 3],
    [16, 4],
    [24, 6],
  ];

  for (const mode of ['win-loss-only', 'full-score'] as const) {
    for (const lag of [0, 1]) {
      it(`never repeats an opponent in back-to-back rounds (${mode}, game lag ${lag})`, () => {
        for (const [count, courts] of sizes) {
          for (let seed = 1; seed <= 4; seed++) {
            const rng = seedRandom(seed * 101 + count);
            const settings = makeSettings({ numberOfCourts: courts, rankingLagRounds: lag, scoreRecordingMode: mode });
            const rounds = playedInOrder(playSession(makePlayers(count), [], settings, 9, rng));
            assert.equal(consecutiveRepeats(rounds).opponents, 0, `${count} players / ${courts} courts, seed ${seed}`);
          }
        }
      });
    }
  }

  // Exhaustive check for 8 players: the generated ranking round must be as
  // good as the best possible arrangement on the top priorities, in order —
  // no back-to-back opponent, then no repeat before rotation completes,
  // then no back-to-back partner. So a back-to-back partner only ever
  // happens when every alternative breaks a higher priority.
  it('only repeats a partner back to back when every alternative is worse', () => {
    const k = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    function* arrangements(ids: string[]): Generator<[string[], string[]][]> {
      if (ids.length === 0) {
        yield [];
        return;
      }
      const [a, ...rest] = ids;
      for (let i = 0; i < rest.length; i++)
        for (let j = i + 1; j < rest.length; j++)
          for (let l = j + 1; l < rest.length; l++) {
            const q = [a, rest[i], rest[j], rest[l]];
            const remaining = rest.filter((_, x) => x !== i && x !== j && x !== l);
            const splits: [string[], string[]][] = [
              [[q[0], q[1]], [q[2], q[3]]],
              [[q[0], q[2]], [q[1], q[3]]],
              [[q[0], q[3]], [q[1], q[2]]],
            ];
            for (const split of splits) for (const tail of arrangements(remaining)) yield [split, ...tail];
          }
    }

    let checked = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seedRandom(seed);
      const players = makePlayers(8);
      const rounds = playedInOrder(playSession(players, [], makeSettings(), 7, rng));
      for (let i = 1; i < rounds.length; i++) {
        if (rounds[i].phase !== 'ranking') continue;
        const previous = encounters(rounds[i - 1]);
        const history = new Map(calculateDynamicPairingStats(players, rounds.slice(0, i)).map((s) => [s.playerId, s]));
        const ids = rounds[i].courts.flatMap((c) => c.playerIds);
        const complete = new Set(ids.filter((x) => ids.every((y) => y === x || (history.get(x)!.opponentHistory[y] ?? 0) > 0)));
        const score = (arrangement: [string[], string[]][]) => {
          let consecutiveOpponents = 0;
          let rotationRepeats = 0;
          let consecutivePartners = 0;
          for (const [s1, s2] of arrangement) {
            for (const a of s1)
              for (const b of s2) {
                if (previous.opponents.has(k(a, b))) consecutiveOpponents += 1;
                const met = history.get(a)!.opponentHistory[b] ?? 0;
                if (met > 0 && !(complete.has(a) && complete.has(b))) rotationRepeats += met;
              }
            for (const side of [s1, s2]) if (previous.partners.has(k(side[0], side[1]))) consecutivePartners += 1;
          }
          return [consecutiveOpponents, rotationRepeats, consecutivePartners];
        };
        const chosen = score(rounds[i].courts.map((c) => [c.team1PlayerIds, c.team2PlayerIds]));
        let best = [Infinity, Infinity, Infinity];
        for (const arrangement of arrangements(ids)) {
          const s = score(arrangement);
          if (s[0] < best[0] || (s[0] === best[0] && (s[1] < best[1] || (s[1] === best[1] && s[2] < best[2])))) best = s;
        }
        assert.deepEqual(chosen, best, `seed ${seed}, round ${rounds[i].roundNumber}`);
        checked += 1;
      }
    }
    assert.ok(checked >= 40);
  });

  it('accounts for saved upcoming rounds when planning the round after them', () => {
    const rng = seedRandom(7);
    const players = makePlayers(12);
    const settings = makeSettings({ numberOfCourts: 3, rankingLagRounds: 1 });
    let rounds = playSession(players, [], settings, 4, rng);
    rounds = scoreCurrentRound(rounds, settings.scoreRecordingMode, rng);
    // Every saved round in order — played, current and upcoming — has no
    // back-to-back repeat opponent, including upcoming-after-upcoming.
    assert.equal(consecutiveRepeats(allScheduledRounds(rounds)).opponents, 0);
    assert.ok(rounds.some((r) => r.status === 'upcoming' && r.phase === 'ranking'));
  });

  it('regenerating future rounds never double-counts history', () => {
    const rng = seedRandom(11);
    const players = makePlayers(12);
    const settings = makeSettings({ numberOfCourts: 3, gradingRounds: 3 });
    let rounds = playSession(players, [], settings, 2, rng);
    const playedBefore = calculateDynamicPairingStats(players, playedInOrder(rounds));

    // Regenerating twice (e.g. two availability changes) must give the same
    // shape of schedule as regenerating once — dropped rounds don't linger
    // in anyone's history.
    rounds = regenerateUpcomingRoundsForEntrants(players, [], settings, rounds);
    rounds = regenerateUpcomingRoundsForEntrants(players, [], settings, rounds);

    const scheduled = allScheduledRounds(rounds);
    assert.deepEqual(
      scheduled.map((r) => r.roundNumber),
      scheduled.map((_, i) => i + 1),
      'round numbers stay unique and contiguous',
    );
    assert.deepEqual(calculateDynamicPairingStats(players, playedInOrder(rounds)), playedBefore);
    // Total opponent encounters = exactly 4 per court per scheduled round
    // (each of 2 players faces 2), counted once per player.
    const all = calculateDynamicPairingStats(players, scheduled);
    const opponentCount = all.reduce((sum, s) => sum + Object.values(s.opponentHistory).reduce((a, b) => a + b, 0), 0);
    const courtCount = scheduled.reduce((sum, r) => sum + r.courts.length, 0);
    assert.equal(opponentCount, courtCount * 8);
    assert.equal(consecutiveRepeats(scheduled).opponents, 0);
    assert.equal(currentRound(rounds).roundNumber, 2);
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const rng = seedRandom(42);
      return playSession(makePlayers(13), [], makeSettings({ numberOfCourts: 3 }), 6, rng).map((r) => ({
        n: r.roundNumber,
        courts: r.courts.map((c) => [c.team1PlayerIds, c.team2PlayerIds]),
        resting: r.restingPlayerIds,
      }));
    };
    assert.deepEqual(run(), run());
  });

  it('starts every session the same way it always has: a valid first round', () => {
    seedRandom(3);
    const rounds = startSession(makePlayers(10), [], makeSettings());
    const first = currentRound(rounds);
    assert.equal(first.courts.length, 2);
    assert.equal(first.restingPlayerIds.length, 2);
    assert.equal(new Set(first.courts.flatMap((c) => c.playerIds)).size, 8);
  });
});
