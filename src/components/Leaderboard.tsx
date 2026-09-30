import type { Player, Round, ScoreRecordingMode } from '../types';
import { calculateLeaderboardStats } from '../utils/pairing';
import { POINT_STATS_UNAVAILABLE_NOTE } from '../utils/results';

interface LeaderboardProps {
  players: Player[];
  rounds: Round[];
  scoreRecordingMode: ScoreRecordingMode;
}

function formatWinPercentage(wins: number, losses: number): string {
  return wins + losses > 0 ? `${Math.round((wins / (wins + losses)) * 100)}%` : '—';
}

export function Leaderboard({ players, rounds, scoreRecordingMode }: LeaderboardProps) {
  if (players.length === 0) {
    return (
      <section className="card">
        <h2>Leaderboard</h2>
        <p className="empty-state">Add players to see the leaderboard.</p>
      </section>
    );
  }

  const rows = calculateLeaderboardStats(players, rounds, scoreRecordingMode);
  const showPoints = scoreRecordingMode === 'full-score';

  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <p className="hint">
        {showPoints
          ? 'Ranked by wins, then total points, then point differential, then fewest byes, then rating.'
          : 'Ranked by wins, then win %, then games played, then fewest byes, then rating.'}
      </p>
      {!showPoints && <p className="hint">{POINT_STATS_UNAVAILABLE_NOTE}</p>}
      <div className="leaderboard-scroll">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Rating</th>
              {showPoints && <th>PF</th>}
              {showPoints && <th>PA</th>}
              {showPoints && <th>+/-</th>}
              <th>Played</th>
              <th>Wins</th>
              <th>Losses</th>
              {!showPoints && <th>Win %</th>}
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
                {showPoints && <td>{stats.pointsFor}</td>}
                {showPoints && <td>{stats.pointsAgainst}</td>}
                {showPoints && <td>{stats.pointDifferential > 0 ? `+${stats.pointDifferential}` : stats.pointDifferential}</td>}
                <td>{stats.matchesPlayed}</td>
                <td>{stats.wins}</td>
                <td>{stats.losses}</td>
                {!showPoints && <td>{formatWinPercentage(stats.wins, stats.losses)}</td>}
                <td>{stats.byes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
