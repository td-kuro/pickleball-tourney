import type { Player, Round } from '../types';
import { calculateLeaderboardStats } from '../utils/pairing';

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

  const rows = calculateLeaderboardStats(players, rounds);

  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <p className="hint">Ranked by wins, then total points, then point differential, then fewest byes, then rating.</p>
      <div className="leaderboard-scroll">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Rating</th>
              <th>PF</th>
              <th>PA</th>
              <th>+/-</th>
              <th>Played</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Byes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player, stats, rank }) => (
              <tr key={player.id} className={rank === 1 ? 'leaderboard-top' : undefined}>
                <td>{rank}</td>
                <td>
                  {player.name}
                  {player.addedMidSession && stats.matchesPlayed === 0 && (
                    <span className="status-badge status-badge-new" title="Added mid-tournament — no completed stats yet">
                      {' '}
                      New
                    </span>
                  )}
                </td>
                <td>{player.rating != null ? player.rating : <span className="unrated">Unrated</span>}</td>
                <td>{stats.pointsFor}</td>
                <td>{stats.pointsAgainst}</td>
                <td>{stats.pointDifferential > 0 ? `+${stats.pointDifferential}` : stats.pointDifferential}</td>
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
