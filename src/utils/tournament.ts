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

// Simple ordered pairing: fills courts in player-list order, singles pairs
// 1v1 and doubles groups every 4 players into two 2-player teams. Anyone
// left over (not enough to fill another court) sits out this round.
export function createRound(players: Player[], settings: TournamentSettings, roundNumber: number): Round {
  const perCourt = playersNeededPerMatch(settings.matchType);
  const half = perCourt / 2;
  const maxPlayers = maxPlayersForRound(settings);

  const playing = players.slice(0, maxPlayers);
  const waitingPlayerIds = players.slice(maxPlayers).map((p) => p.id);

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

  // Players that didn't fill a full court (e.g. 5 players, singles) also wait.
  const seatedIds = new Set(matches.flatMap((m) => [...m.teamA.playerIds, ...m.teamB.playerIds]));
  const leftoverIds = playing.filter((p) => !seatedIds.has(p.id)).map((p) => p.id);

  return {
    id: makeId('round'),
    roundNumber,
    matches,
    waitingPlayerIds: [...waitingPlayerIds, ...leftoverIds],
  };
}

export function getMatchWinner(match: Match): 'A' | 'B' | undefined {
  if (match.scoreA == null || match.scoreB == null || match.scoreA === match.scoreB) {
    return undefined;
  }
  return match.scoreA > match.scoreB ? 'A' : 'B';
}

// Points are the score achieved, not just win/loss: every player on a team
// gets that team's full score added to their total, every round.
export function computePlayerStats(players: Player[], rounds: Round[]): PlayerStats[] {
  const statsByPlayer = new Map<string, PlayerStats>(
    players.map((player) => [
      player.id,
      { playerId: player.id, totalPoints: 0, matchesPlayed: 0, wins: 0, losses: 0 },
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
  }

  return Array.from(statsByPlayer.values());
}
