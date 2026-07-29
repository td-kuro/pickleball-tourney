import type { Player, Round } from '../types';
import { computePlayerStats } from '../utils/tournament';

interface LeaderboardProps {
  players: Player[];
  rounds: Round[];
}

export function Leaderboard({ players, rounds }: LeaderboardProps) {
  if (players.length === 0) {
    return (
      <section className="card">
        <h2>Leaderboard</h2>
        <p className="empty-state">Add players to see the leaderboard.</p>
      </section>
    );
  }

  const statsByPlayer = new Map(computePlayerStats(players, rounds).map((s) => [s.playerId, s]));

  const rows = players
    .map((player) => ({ player, stats: statsByPlayer.get(player.id)! }))
    .sort((a, b) => {
      if (b.stats.totalPoints !== a.stats.totalPoints) return b.stats.totalPoints - a.stats.totalPoints;
      if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
      if (a.stats.byes !== b.stats.byes) return a.stats.byes - b.stats.byes;
      return b.player.rating - a.player.rating;
    });

  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <div className="leaderboard-scroll">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Rating</th>
              <th>Points</th>
              <th>Played</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Byes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player, stats }, index) => (
              <tr key={player.id} className={index === 0 ? 'leaderboard-top' : undefined}>
                <td>{index + 1}</td>
                <td>{player.name}</td>
                <td>{player.rating}</td>
                <td>{stats.totalPoints}</td>
                <td>{stats.matchesPlayed}</td>
                <td>{stats.wins}</td>
                <td>{stats.losses}</td>
                <td>{stats.byes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
