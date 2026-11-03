// Shared fixtures for the Dynamic Pairing Social tests. Sessions are driven
// through the same pure functions the app's hook calls (start, record a
// result, advance), with a seeded random source so every run is identical.
import type {
  DynamicPairingRound,
  DynamicPairingSettings,
  DynamicPairingTeam,
  GradingDivision,
  Player,
  ScoreRecordingMode,
} from '../src/types';
import {
  advanceDynamicPairingRound,
  extendDynamicPairingLookahead,
  generateInitialGradingRoundsForEntrants,
  playedDynamicPairingRounds,
  processDynamicPairingResult,
  setDynamicPairingRandomSource,
} from '../src/utils/dynamicPairingSocial';

// mulberry32 — small, fast, good enough for test shuffles.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedRandom(seed: number): () => number {
  const rng = seededRandom(seed);
  setDynamicPairingRandomSource(rng);
  return rng;
}

export function makeSettings(overrides: Partial<DynamicPairingSettings> = {}): DynamicPairingSettings {
  return {
    sessionName: 'Test',
    numberOfCourts: 2,
    gradingRounds: 2,
    gameFormat: 'first-to-score',
    winningScore: 11,
    maxCourtMovement: 'max-1',
    scoreConfirmationRequired: false,
    rankingLagRounds: 1,
    scoreRecordingMode: 'win-loss-only',
    useGradingDivisions: false,
    ...overrides,
  };
}

export function makePlayers(count: number, divisions: (GradingDivision | undefined)[] = []): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    availabilityStatus: 'available' as const,
    gradingDivision: divisions[i],
  }));
}

export function namedPlayers(names: string[]): Player[] {
  return names.map((name) => ({ id: name.toLowerCase(), name, availabilityStatus: 'available' as const }));
}

// Teams of consecutive player ids: team k = p(2k), p(2k+1).
export function makeTeams(count: number): DynamicPairingTeam[] {
  return Array.from({ length: count }, (_, k) => ({ id: `t${k}`, playerIds: [`p${2 * k}`, `p${2 * k + 1}`] as [string, string] }));
}

export function startSession(players: Player[], teams: DynamicPairingTeam[], settings: DynamicPairingSettings): DynamicPairingRound[] {
  return extendDynamicPairingLookahead(players, teams, settings, generateInitialGradingRoundsForEntrants(players, teams, settings));
}

export function currentRound(rounds: DynamicPairingRound[]): DynamicPairingRound {
  const round = rounds.find((r) => r.status === 'current');
  if (!round) throw new Error('No current round');
  return round;
}

// Records a random result on every court of the current round, in the given
// scoring mode, using `rng` so results are reproducible too.
export function scoreCurrentRound(rounds: DynamicPairingRound[], mode: ScoreRecordingMode, rng: () => number): DynamicPairingRound[] {
  const current = currentRound(rounds);
  let scored = current;
  for (const court of current.courts) {
    const sideAWins = rng() < 0.5;
    const loser = Math.floor(rng() * 10);
    scored = processDynamicPairingResult(
      scored,
      court.courtNumber,
      mode === 'win-loss-only'
        ? { kind: 'winner', winner: sideAWins ? 'A' : 'B' }
        : { kind: 'score', scoreA: sideAWins ? 11 : loser, scoreB: sideAWins ? loser : 11 },
    );
  }
  return rounds.map((r) => (r.id === current.id ? scored : r));
}

// Plays `totalRounds` rounds start to finish; returns every round saved.
export function playSession(
  players: Player[],
  teams: DynamicPairingTeam[],
  settings: DynamicPairingSettings,
  totalRounds: number,
  rng: () => number,
): DynamicPairingRound[] {
  let rounds = startSession(players, teams, settings);
  for (let k = 1; k < totalRounds; k++) {
    rounds = scoreCurrentRound(rounds, settings.scoreRecordingMode, rng);
    const advanced = advanceDynamicPairingRound(players, teams, settings, rounds);
    if (!advanced) throw new Error('Could not advance');
    rounds = advanced;
  }
  return rounds;
}

export function playedInOrder(rounds: DynamicPairingRound[]): DynamicPairingRound[] {
  return playedDynamicPairingRounds(rounds).sort((a, b) => a.roundNumber - b.roundNumber);
}

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Entrant id per player: their fixed team's id if they're on one.
export function entrantResolver(teams: DynamicPairingTeam[]): (playerId: string) => string {
  const byPlayer = new Map(teams.flatMap((t) => t.playerIds.map((id) => [id, t.id] as const)));
  return (id) => byPlayer.get(id) ?? id;
}

// Opponent and temporary-partner pairs in one round, at entrant level (a
// fixed team counts once).
export function encounters(round: DynamicPairingRound, teams: DynamicPairingTeam[] = []) {
  const entrantOf = entrantResolver(teams);
  const opponents = new Set<string>();
  const partners = new Set<string>();
  for (const court of round.courts) {
    const side1 = [...new Set(court.team1PlayerIds.map(entrantOf))];
    const side2 = [...new Set(court.team2PlayerIds.map(entrantOf))];
    for (const a of side1) for (const b of side2) opponents.add(key(a, b));
    for (const side of [side1, side2]) if (side.length === 2) partners.add(key(side[0], side[1]));
  }
  return { opponents, partners };
}

// Opponent / temporary-partner pairs that repeat between back-to-back
// rounds in `rounds` (sorted by round number).
export function consecutiveRepeats(rounds: DynamicPairingRound[], teams: DynamicPairingTeam[] = []) {
  let opponents = 0;
  let partners = 0;
  for (let i = 1; i < rounds.length; i++) {
    const before = encounters(rounds[i - 1], teams);
    const after = encounters(rounds[i], teams);
    for (const pair of after.opponents) if (before.opponents.has(pair)) opponents += 1;
    for (const pair of after.partners) if (before.partners.has(pair)) partners += 1;
  }
  return { opponents, partners };
}

export function allScheduledRounds(rounds: DynamicPairingRound[]): DynamicPairingRound[] {
  return rounds.filter((r) => r.status !== 'pending-results').sort((a, b) => a.roundNumber - b.roundNumber);
}
