// Pure tournament logic: pairing, validation, and stats.
// No React or localStorage here, so this can be reused/extended (and
// eventually replaced with smarter pairing rules) without touching the UI.

import type { Match, MatchType, Player, PlayerStats, Round, TournamentSettings } from '../types';

const PLAYERS_PER_COURT: Record<MatchType, number> = {
  singles: 2,
  doubles: 4,
};

export function playersNeededPerMatch(matchType: MatchType): number {
  return PLAYERS_PER_COURT[matchType];
}

export function maxPlayersForRound(settings: TournamentSettings): number {
  return settings.courts * playersNeededPerMatch(settings.matchType);
}

export function canGenerateRound(
  players: Player[],
  settings: TournamentSettings,
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

  return { ok: true };
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// Simple ordered pairing, with a fair bye rotation on top: whenever there
// are more players than court capacity (or a leftover that can't fill a
// full court), the extra players sit out as "byes" for the round. Byes are
// handed out to whoever has had the fewest byes so far, so no one sits out
// twice before everyone else has had a turn. Ties keep the player-list order.
export function createRound(
  players: Player[],
  settings: TournamentSettings,
  roundNumber: number,
  priorRounds: Round[] = [],
): Round {
  const perCourt = playersNeededPerMatch(settings.matchType);
  const half = perCourt / 2;

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

  const matches: Match[] = [];
  for (let start = 0; start + perCourt <= playing.length; start += perCourt) {
    const group = playing.slice(start, start + perCourt);
    matches.push({
      id: makeId('match'),
      court: matches.length + 1,
      teamA: { playerIds: group.slice(0, half).map((p) => p.id) },
      teamB: { playerIds: group.slice(half).map((p) => p.id) },
    });
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
export function computePlayerStats(players: Player[], rounds: Round[]): PlayerStats[] {
  const statsByPlayer = new Map<string, PlayerStats>(
    players.map((player) => [
      player.id,
      { playerId: player.id, totalPoints: 0, matchesPlayed: 0, wins: 0, losses: 0, byes: 0 },
    ]),
  );

  function applyResult(playerIds: string[], points: number, won: boolean, lost: boolean) {
    for (const id of playerIds) {
      const stats = statsByPlayer.get(id);
      if (!stats) continue;
      stats.totalPoints += points;
      stats.matchesPlayed += 1;
      if (won) stats.wins += 1;
      if (lost) stats.losses += 1;
    }
  }

  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.scoreA == null || match.scoreB == null) continue;
      const winner = getMatchWinner(match);
      applyResult(match.teamA.playerIds, match.scoreA, winner === 'A', winner === 'B');
      applyResult(match.teamB.playerIds, match.scoreB, winner === 'B', winner === 'A');
    }

    for (const id of round.byePlayerIds) {
      const stats = statsByPlayer.get(id);
      if (stats) stats.byes += 1;
    }
  }

  return Array.from(statsByPlayer.values());
}
