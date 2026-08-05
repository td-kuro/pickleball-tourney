// Pure tournament logic: pairing, validation, and stats.
// No React or localStorage here, so this can be reused/extended (and
// eventually replaced with smarter pairing rules) without touching the UI.

import type {
  Match,
  MatchType,
  Player,
  PlayerStats,
  Round,
  SessionPlan,
  SessionTiming,
  SocialScoringMode,
  TournamentSettings,
} from '../types';

const PLAYERS_PER_COURT: Record<MatchType, number> = {
  singles: 2,
  doubles: 4,
};

export const DEFAULT_SESSION_TIMING: SessionTiming = {
  sessionTimeMinutes: 120,
  gameTimeMinutes: 10,
  bufferTimeMinutes: 2,
};

export const MIN_GAME_TIME_MINUTES = 8;
export const MAX_GAME_TIME_MINUTES = 12;

// Divides the booked session time into game+buffer "round blocks" to
// estimate how many rounds fit. `estimatedRounds` is clamped to 0 (rather
// than going negative) so the Setup screen can show a live preview even
// while the timing fields are still invalid/mid-edit.
export function calculateSessionPlan(timing: SessionTiming): SessionPlan {
  const roundBlockMinutes = timing.gameTimeMinutes + timing.bufferTimeMinutes;
  if (roundBlockMinutes <= 0) {
    return { estimatedRounds: 0, remainingTimeMinutes: Math.max(0, timing.sessionTimeMinutes) };
  }

  const estimatedRounds = Math.max(0, Math.floor(timing.sessionTimeMinutes / roundBlockMinutes));
  const remainingTimeMinutes = Math.max(0, timing.sessionTimeMinutes - estimatedRounds * roundBlockMinutes);
  return { estimatedRounds, remainingTimeMinutes };
}

export function validateSessionTiming(timing: SessionTiming): { ok: true } | { ok: false; reason: string } {
  if (timing.sessionTimeMinutes <= 0) {
    return { ok: false, reason: 'Session time must be greater than 0 minutes.' };
  }
  if (timing.gameTimeMinutes < MIN_GAME_TIME_MINUTES || timing.gameTimeMinutes > MAX_GAME_TIME_MINUTES) {
    return {
      ok: false,
      reason: `Game time must be between ${MIN_GAME_TIME_MINUTES} and ${MAX_GAME_TIME_MINUTES} minutes.`,
    };
  }
  if (timing.bufferTimeMinutes < 0) {
    return { ok: false, reason: 'Buffer time must be 0 or greater.' };
  }
  if (calculateSessionPlan(timing).estimatedRounds < 1) {
    return {
      ok: false,
      reason: 'Session time is too short to fit even one round at this game + buffer time.',
    };
  }
  return { ok: true };
}

export function playersNeededPerMatch(matchType: MatchType): number {
  return PLAYERS_PER_COURT[matchType];
}

export function maxPlayersForRound(settings: TournamentSettings): number {
  return settings.courts * playersNeededPerMatch(settings.matchType);
}

export function isRoundComplete(round: Round): boolean {
  return round.matches.every((match) => match.scoreA != null && match.scoreB != null);
}

export function canGenerateRound(
  players: Player[],
  settings: TournamentSettings,
  currentRound?: Round,
): { ok: true } | { ok: false; reason: string } {
  if (settings.courts < 1) {
    return { ok: false, reason: 'Number of courts must be at least 1.' };
  }

  const needed = playersNeededPerMatch(settings.matchType);
  if (players.length < needed) {
    return {
      ok: false,
      reason:
        settings.matchType === 'singles'
          ? 'Singles requires at least 2 players.'
          : 'Doubles requires at least 4 players.',
    };
  }

  if (players.some((player) => player.name.trim() === '')) {
    return { ok: false, reason: 'Every player needs a name before starting matches.' };
  }

  if (settings.playMode === 'social') {
    const timingCheck = validateSessionTiming(settings.sessionTiming);
    if (!timingCheck.ok) return timingCheck;
  }

  // Only Tournament Mode requires the current round to be fully scored
  // before moving on — Social Play is casual, so you can advance rounds
  // even if some scores (or all of them, in "No scoring") weren't entered.
  if (settings.playMode === 'tournament' && currentRound && !isRoundComplete(currentRound)) {
    return {
      ok: false,
      reason: 'Enter scores for every match in the current round before generating the next one.',
    };
  }

  return { ok: true };
}

// Whether match cards should collect scores at all.
export function isScoringEnabled(settings: TournamentSettings): boolean {
  return settings.playMode === 'tournament' || settings.socialScoringMode !== 'none';
}

// Whether wins/losses should be tracked and shown.
export function isWinLossTracked(settings: TournamentSettings): boolean {
  return settings.playMode === 'tournament' || settings.socialScoringMode === 'scoresAndWins';
}

export function socialScoringModeLabel(mode: SocialScoringMode): string {
  switch (mode) {
    case 'none':
      return 'No Scoring';
    case 'scoresOnly':
      return 'Track Scores Only';
    case 'scoresAndWins':
      return 'Track Scores and Wins';
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// --- Match history -------------------------------------------------------
// Derived from prior rounds rather than stored separately, so there's a
// single source of truth and no risk of it drifting out of sync. "Opponent"
// counts track how many times two players have played against each other
// (singles or doubles); "teammate" counts track how many times two players
// have been paired together on the same doubles team.

type MeetingCounts = Map<string, Map<string, number>>;

function bumpMeeting(counts: MeetingCounts, aId: string, bId: string) {
  if (!counts.has(aId)) counts.set(aId, new Map());
  const inner = counts.get(aId)!;
  inner.set(bId, (inner.get(bId) ?? 0) + 1);
}

function meetingCount(counts: MeetingCounts, aId: string, bId: string): number {
  return counts.get(aId)?.get(bId) ?? 0;
}

function buildMatchHistory(rounds: Round[]): { opponents: MeetingCounts; teammates: MeetingCounts } {
  const opponents: MeetingCounts = new Map();
  const teammates: MeetingCounts = new Map();

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const a of match.teamA.playerIds) {
        for (const b of match.teamB.playerIds) {
          bumpMeeting(opponents, a, b);
          bumpMeeting(opponents, b, a);
        }
      }
      for (const team of [match.teamA, match.teamB]) {
        if (team.playerIds.length === 2) {
          const [a, b] = team.playerIds;
          bumpMeeting(teammates, a, b);
          bumpMeeting(teammates, b, a);
        }
      }
    }
  }

  return { opponents, teammates };
}

const PAIRING_TRIALS = 40;

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Greedy nearest-neighbour pairing for one processing order: repeatedly
// takes the next unpaired item and partners it with whoever it's met the
// fewest times before.
function greedyPairInOrder<T extends { id: string }>(order: T[], counts: MeetingCounts): [T, T][] {
  const remaining = [...order];
  const pairs: [T, T][] = [];

  while (remaining.length >= 2) {
    const item = remaining.shift()!;
    let bestIndex = 0;
    let bestCount = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const count = meetingCount(counts, item.id, remaining[i].id);
      if (count < bestCount) {
        bestCount = count;
        bestIndex = i;
      }
    }
    const [partner] = remaining.splice(bestIndex, 1);
    pairs.push([item, partner]);
  }

  return pairs;
}

function totalPairCost<T extends { id: string }>(pairs: [T, T][], counts: MeetingCounts): number {
  return pairs.reduce((sum, [a, b]) => sum + meetingCount(counts, a.id, b.id), 0);
}

// A single greedy pass processes players in a fixed order, which can "box
// in" the last couple of players and force a repeat pairing on them even
// when a repeat-free pairing exists elsewhere (this shows up quickly with
// e.g. 6 players over a few rounds). To avoid that, try the plain order
// first (so Round 1, with no history, still pairs in simple list order),
// then try several random orders and keep whichever pairing has the lowest
// total repeat-meeting count — stopping early once a repeat-free one is
// found. This is a simple heuristic, not a true minimum-weight matching,
// but it reliably finds a repeat-free pairing when one exists for the
// player counts this app is meant for.
function pairByFewestMeetings<T extends { id: string }>(items: T[], counts: MeetingCounts): [T, T][] {
  let best = greedyPairInOrder(items, counts);
  let bestCost = totalPairCost(best, counts);

  for (let attempt = 0; attempt < PAIRING_TRIALS && bestCost > 0; attempt++) {
    const candidate = greedyPairInOrder(shuffled(items), counts);
    const cost = totalPairCost(candidate, counts);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }

  return best;
}

function teamGroupScore(a: Player[], b: Player[], opponents: MeetingCounts): number {
  let score = 0;
  for (const x of a) {
    for (const y of b) {
      score += meetingCount(opponents, x.id, y.id);
    }
  }
  return score;
}

// Same greedy-pass idea, but for pairing up already-formed doubles teams
// against each other: minimises the total number of prior opponent
// meetings between the two teams' players (so it favours facing new
// opponents over repeats). Also uses random restarts for the same reason
// as pairByFewestMeetings above.
function greedyPairTeamsInOrder(
  order: [Player, Player][],
  opponents: MeetingCounts,
): [[Player, Player], [Player, Player]][] {
  const remaining = [...order];
  const matchups: [[Player, Player], [Player, Player]][] = [];

  while (remaining.length >= 2) {
    const team = remaining.shift()!;
    let bestIndex = 0;
    let bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const score = teamGroupScore(team, remaining[i], opponents);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const [opponentTeam] = remaining.splice(bestIndex, 1);
    matchups.push([team, opponentTeam]);
  }

  return matchups;
}

function totalTeamMatchupCost(
  matchups: [[Player, Player], [Player, Player]][],
  opponents: MeetingCounts,
): number {
  return matchups.reduce((sum, [a, b]) => sum + teamGroupScore(a, b, opponents), 0);
}

function pairTeamsByFewestOpponentMeetings(
  teams: [Player, Player][],
  opponents: MeetingCounts,
): [[Player, Player], [Player, Player]][] {
  let best = greedyPairTeamsInOrder(teams, opponents);
  let bestCost = totalTeamMatchupCost(best, opponents);

  for (let attempt = 0; attempt < PAIRING_TRIALS && bestCost > 0; attempt++) {
    const candidate = greedyPairTeamsInOrder(shuffled(teams), opponents);
    const cost = totalTeamMatchupCost(candidate, opponents);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }

  return best;
}

// Simple ordered pairing, with a fair bye rotation and matchup-avoidance
// pairing on top:
//
// - Bye rotation: whenever there are more players than court capacity (or a
//   leftover that can't fill a full court), the extra players sit out as
//   "byes" for the round. Byes go to whoever has had the fewest byes so
//   far, so no one sits out twice before everyone else has had a turn.
// - Matchup avoidance: players who are playing get paired with whoever
//   they've faced the fewest times so far (see pairByFewestMeetings /
//   pairTeamsByFewestOpponentMeetings above). With no history yet this
//   comes out the same as simple in-order pairing.
export function createRound(
  players: Player[],
  settings: TournamentSettings,
  roundNumber: number,
  priorRounds: Round[] = [],
): Round {
  const perCourt = playersNeededPerMatch(settings.matchType);

  const usableCourts = Math.min(settings.courts, Math.floor(players.length / perCourt));
  const playingCount = usableCourts * perCourt;
  const byeCount = players.length - playingCount;

  const statsByPlayer = new Map(computePlayerStats(players, priorRounds).map((s) => [s.playerId, s]));
  const byePriority = players
    .map((player, index) => ({ player, index, byes: statsByPlayer.get(player.id)?.byes ?? 0 }))
    .sort((a, b) => a.byes - b.byes || a.index - b.index);

  const byePlayerIds = byePriority.slice(0, byeCount).map((entry) => entry.player.id);
  const byeIdSet = new Set(byePlayerIds);
  const playing = players.filter((p) => !byeIdSet.has(p.id));

  const { opponents, teammates } = buildMatchHistory(priorRounds);
  const matches: Match[] = [];

  if (settings.matchType === 'singles') {
    const pairs = pairByFewestMeetings(playing, opponents);
    for (const [a, b] of pairs) {
      matches.push({
        id: makeId('match'),
        court: matches.length + 1,
        teamA: { playerIds: [a.id] },
        teamB: { playerIds: [b.id] },
      });
    }
  } else {
    const teams = pairByFewestMeetings(playing, teammates);
    const matchups = pairTeamsByFewestOpponentMeetings(teams, opponents);
    for (const [teamA, teamB] of matchups) {
      matches.push({
        id: makeId('match'),
        court: matches.length + 1,
        teamA: { playerIds: teamA.map((p) => p.id) },
        teamB: { playerIds: teamB.map((p) => p.id) },
      });
    }
  }

  return {
    id: makeId('round'),
    roundNumber,
    matches,
    byePlayerIds,
  };
}

export function getMatchWinner(match: Match): 'A' | 'B' | undefined {
  if (match.scoreA == null || match.scoreB == null || match.scoreA === match.scoreB) {
    return undefined;
  }
  return match.scoreA > match.scoreB ? 'A' : 'B';
}

// Points are the score achieved, not just win/loss: every player on a team
// gets that team's full score added to their total, every round. Byes don't
// add points, matches played, wins, or losses — only the bye count.
//
// "Games played", partners, and opponents are tracked from participation
// alone (not from whether a score was entered) so Social Play's "No
// scoring" mode still has meaningful stats to show.
export function computePlayerStats(players: Player[], rounds: Round[]): PlayerStats[] {
  const statsByPlayer = new Map<string, PlayerStats>(
    players.map((player) => [
      player.id,
      {
        playerId: player.id,
        totalPoints: 0,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        byes: 0,
        partnerIds: [],
        opponentIds: [],
      },
    ]),
  );
  const partnerSets = new Map<string, Set<string>>(players.map((p) => [p.id, new Set<string>()]));
  const opponentSets = new Map<string, Set<string>>(players.map((p) => [p.id, new Set<string>()]));

  function applyPoints(playerIds: string[], points: number, won: boolean, lost: boolean) {
    for (const id of playerIds) {
      const stats = statsByPlayer.get(id);
      if (!stats) continue;
      stats.totalPoints += points;
      if (won) stats.wins += 1;
      if (lost) stats.losses += 1;
    }
  }

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const id of [...match.teamA.playerIds, ...match.teamB.playerIds]) {
        const stats = statsByPlayer.get(id);
        if (stats) stats.matchesPlayed += 1;
      }

      for (const team of [match.teamA, match.teamB]) {
        if (team.playerIds.length === 2) {
          const [a, b] = team.playerIds;
          partnerSets.get(a)?.add(b);
          partnerSets.get(b)?.add(a);
        }
      }
      for (const a of match.teamA.playerIds) {
        for (const b of match.teamB.playerIds) {
          opponentSets.get(a)?.add(b);
          opponentSets.get(b)?.add(a);
        }
      }

      if (match.scoreA == null || match.scoreB == null) continue;
      const winner = getMatchWinner(match);
      applyPoints(match.teamA.playerIds, match.scoreA, winner === 'A', winner === 'B');
      applyPoints(match.teamB.playerIds, match.scoreB, winner === 'B', winner === 'A');
    }

    for (const id of round.byePlayerIds) {
      const stats = statsByPlayer.get(id);
      if (stats) stats.byes += 1;
    }
  }

  for (const stats of statsByPlayer.values()) {
    stats.partnerIds = Array.from(partnerSets.get(stats.playerId) ?? []);
    stats.opponentIds = Array.from(opponentSets.get(stats.playerId) ?? []);
  }

  return Array.from(statsByPlayer.values());
}
