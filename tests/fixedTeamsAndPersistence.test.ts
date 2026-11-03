// Fixed teams and dynamically paired individuals in one session, plus
// save/reload behaviour.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { DynamicPairingRound } from '../src/types';
import {
  advanceDynamicPairingRound,
  calculateDynamicPairingStats,
  calculateEntrantRankings,
  planDynamicPairingSwap,
  regenerateUpcomingRoundsForEntrants,
  setDynamicPairingRandomSource,
} from '../src/utils/dynamicPairingSocial';
import {
  allScheduledRounds,
  consecutiveRepeats,
  currentRound,
  entrantResolver,
  makePlayers,
  makeSettings,
  makeTeams,
  playedInOrder,
  playSession,
  scoreCurrentRound,
  seedRandom,
} from './helpers';

afterEach(() => setDynamicPairingRandomSource(null));

const configs: { players: number; courts: number; teams: number }[] = [
  { players: 12, courts: 3, teams: 2 },
  { players: 14, courts: 3, teams: 3 },
  { players: 16, courts: 4, teams: 4 },
  { players: 10, courts: 2, teams: 1 },
  { players: 21, courts: 5, teams: 3 },
];

describe('fixed teams and dynamic pairings together', () => {
  it('keeps teams together, mixes team-v-team and team-v-pair, and never repeats opponents back to back', () => {
    let teamVsTeam = 0;
    let teamVsPair = 0;
    for (const config of configs) {
      for (let seed = 1; seed <= 3; seed++) {
        const rng = seedRandom(seed * 31 + config.players);
        const players = makePlayers(config.players);
        const teams = makeTeams(config.teams);
        const settings = makeSettings({ numberOfCourts: config.courts, gradingRounds: 2 });
        const rounds = playedInOrder(playSession(players, teams, settings, 8, rng));
        const entrantOf = entrantResolver(teams);

        for (const round of rounds) {
          for (const court of round.courts) {
            assert.equal(new Set(court.playerIds).size, 4, 'four physical players per court');
            assert.equal(court.team1PlayerIds.length, 2);
            assert.equal(court.team2PlayerIds.length, 2);
            const sideEntrants = [court.team1PlayerIds, court.team2PlayerIds].map((side) => new Set(side.map(entrantOf)).size);
            for (const team of teams) {
              const onCourt = team.playerIds.filter((id) => court.playerIds.includes(id)).length;
              const together = [court.team1PlayerIds, court.team2PlayerIds].some((side) => team.playerIds.every((id) => side.includes(id)));
              assert.ok(onCourt === 0 || (onCourt === 2 && together), `team ${team.id} split in round ${round.roundNumber}`);
            }
            if (sideEntrants[0] === 1 && sideEntrants[1] === 1) teamVsTeam += 1;
            if (sideEntrants.includes(1) && sideEntrants.includes(2)) teamVsPair += 1;
          }
          for (const team of teams) {
            const resting = team.playerIds.filter((id) => round.restingPlayerIds.includes(id)).length;
            assert.ok(resting === 0 || resting === 2, 'a team rests as a unit');
          }
        }
        assert.equal(consecutiveRepeats(rounds, teams).opponents, 0, `${config.players}/${config.courts}/${config.teams} seed ${seed}`);
      }
    }
    assert.ok(teamVsTeam > 0, 'fixed teams play fixed teams');
    assert.ok(teamVsPair > 0, 'fixed teams play temporary pairs');
  });

  it('rotates partners for individuals', () => {
    const rng = seedRandom(8);
    const players = makePlayers(12);
    const teams = makeTeams(2);
    const rounds = playedInOrder(playSession(players, teams, makeSettings({ numberOfCourts: 2, gradingRounds: 2 }), 8, rng));
    const stats = calculateDynamicPairingStats(players, rounds);
    for (const s of stats.filter((st) => !['p0', 'p1', 'p2', 'p3'].includes(st.playerId))) {
      const partners = Object.keys(s.partnerHistory).length;
      const games = s.gamesPlayed;
      assert.ok(partners >= Math.min(games, 3), `${s.playerId}: ${partners} different partners in ${games} games`);
    }
    assert.equal(consecutiveRepeats(rounds, teams).partners, 0);
  });

  it("counts a fixed team's games once, shared by both members", () => {
    const rng = seedRandom(4);
    const players = makePlayers(12);
    const teams = makeTeams(2);
    // Completed rounds only — the current round has no result yet.
    const rounds = playedInOrder(playSession(players, teams, makeSettings({ numberOfCourts: 3 }), 6, rng)).filter(
      (r) => r.status === 'locked',
    );
    const team = calculateEntrantRankings(players, teams, rounds).find((r) => r.entrant.id === 't0')!;
    const played = rounds.filter((r) => r.courts.some((c) => c.playerIds.includes('p0'))).length;
    assert.equal(team.stats.gamesPlayed, played);
    assert.equal(team.stats.wins + team.stats.losses, played);
    const member = new Map(calculateDynamicPairingStats(players, rounds).map((s) => [s.playerId, s]));
    assert.deepEqual(member.get('p0')!.wins, member.get('p1')!.wins);
  });

  it('shares byes fairly between teams and individuals', () => {
    for (const config of configs) {
      const rng = seedRandom(config.players * 7);
      const players = makePlayers(config.players);
      const teams = makeTeams(config.teams);
      const rounds = playedInOrder(
        playSession(players, teams, makeSettings({ numberOfCourts: config.courts - 1, gradingRounds: 2 }), 10, rng),
      );
      const entrantOf = entrantResolver(teams);
      const byes = new Map<string, number>();
      for (const p of players) byes.set(entrantOf(p.id), 0);
      for (const round of rounds) {
        for (const id of new Set(round.restingPlayerIds.map(entrantOf))) byes.set(id, byes.get(id)! + 1);
      }
      const counts = [...byes.values()];
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${config.players} players: bye counts ${counts}`);
    }
  });

  it('takes a team out of future rounds when a member becomes unavailable', () => {
    const rng = seedRandom(6);
    const players = makePlayers(12);
    const teams = makeTeams(2);
    const settings = makeSettings({ numberOfCourts: 3, gradingRounds: 3 });
    const rounds = playSession(players, teams, settings, 2, rng);
    const away = players.map((p) => (p.id === 'p0' ? { ...p, availabilityStatus: 'unavailable' as const } : p));
    const regenerated = regenerateUpcomingRoundsForEntrants(away, teams, settings, rounds);
    for (const round of regenerated.filter((r) => r.status === 'upcoming')) {
      assert.ok(!round.courts.some((c) => c.playerIds.includes('p0') || c.playerIds.includes('p1')), 'team t0 sits out');
    }
  });
});

describe('saving and reloading', () => {
  it('survives a save/reload with divisions, teams, swaps and history intact', () => {
    const rng = seedRandom(12);
    const players = makePlayers(12, ['higher', 'higher', 'lower']);
    const teams = makeTeams(1).map((t) => ({ ...t, gradingDivision: 'intermediate' as const }));
    const settings = makeSettings({ numberOfCourts: 2, useGradingDivisions: true });
    let rounds = playSession(players, teams, settings, 3, rng);
    const current = currentRound(rounds);
    const [a, b] = [current.courts[0].team1PlayerIds[0], current.courts[1].team2PlayerIds[0]];
    const swapped = planDynamicPairingSwap(current, a, b, players, teams);
    assert.ok(swapped.ok);
    if (!swapped.ok) return;
    rounds = rounds.map((r) => (r.id === current.id ? swapped.plan.round : r));

    // localStorage stores each piece as JSON — round-trip all of it. (JSON
    // drops keys whose value is undefined, so compare JSON forms.)
    const reload = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    const asJson = (value: unknown) => JSON.parse(JSON.stringify(value));
    const [savedPlayers, savedTeams, savedSettings, savedRounds] = [reload(players), reload(teams), reload(settings), reload(rounds)];
    assert.equal(savedPlayers[0].gradingDivision, 'higher');
    assert.equal(savedPlayers[2].gradingDivision, 'lower');
    assert.equal(savedTeams[0].gradingDivision, 'intermediate');
    assert.deepEqual(savedTeams[0].playerIds, ['p0', 'p1']);
    assert.equal(savedSettings.useGradingDivisions, true);
    assert.deepEqual(currentRound(savedRounds).courts, asJson(swapped.plan.round.courts));
    assert.deepEqual(savedRounds, asJson(rounds));
    assert.deepEqual(
      calculateDynamicPairingStats(savedPlayers, playedInOrder(savedRounds)),
      calculateDynamicPairingStats(players, playedInOrder(rounds)),
    );

    // Advancing after a reload activates the saved next round unchanged.
    const scored = scoreCurrentRound(savedRounds, settings.scoreRecordingMode, rng);
    const nextSaved = scored.find((r) => r.roundNumber === current.roundNumber + 1)!;
    const advanced = advanceDynamicPairingRound(savedPlayers, savedTeams, savedSettings, scored)!;
    const activated = currentRound(advanced);
    assert.equal(activated.id, nextSaved.id);
    assert.deepEqual(activated.courts, nextSaved.courts);
    assert.deepEqual(activated.restingPlayerIds, nextSaved.restingPlayerIds);
  });

  it('leaves every saved upcoming round untouched when a round is advanced', () => {
    const rng = seedRandom(21);
    const players = makePlayers(13);
    const settings = makeSettings({ numberOfCourts: 3, gradingRounds: 3, rankingLagRounds: 2 });
    let rounds = playSession(players, [], settings, 2, rng);
    for (let step = 0; step < 4; step++) {
      rounds = scoreCurrentRound(rounds, settings.scoreRecordingMode, rng);
      const upcomingBefore = rounds.filter((r) => r.status === 'upcoming');
      const advanced = advanceDynamicPairingRound(players, [], settings, rounds)!;
      for (const saved of upcomingBefore) {
        const after = advanced.find((r) => r.id === saved.id);
        assert.ok(after, `Round ${saved.roundNumber} still saved`);
        assert.deepEqual(after!.courts, saved.courts);
        assert.deepEqual(after!.restingPlayerIds, saved.restingPlayerIds);
      }
      rounds = advanced;
    }
    const scheduled: DynamicPairingRound[] = allScheduledRounds(rounds);
    assert.equal(consecutiveRepeats(scheduled).opponents, 0);
  });
});
