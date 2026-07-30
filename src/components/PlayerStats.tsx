import type { Player, Round, TournamentSettings } from '../types';
import { computePlayerStats, isScoringEnabled, isWinLossTracked } from '../utils/tournament';

interface PlayerStatsProps {
  players: Player[];
  rounds: Round[];
  settings: TournamentSettings;
}

// Social Play's results screen. Deliberately not called (or presented as) a
// leaderboard: rows stay in roster order rather than being ranked by
// performance, and points/wins/losses only appear when the session's
// scoring mode actually tracks them.
export function PlayerStats({ players, rounds, settings }: PlayerStatsProps) {
  if (players.length === 0) {
    return (
      <section className="card">
        <h2>Player Stats</h2>
        <p className="empty-state">Add players to see stats.</p>
      </section>
    );
  }

  const showPoints = isScoringEnabled(settings);
  const showWinLoss = isWinLossTracked(settings);
  const showPartners = settings.matchType === 'doubles';

  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const statsByPlayer = new Map(computePlayerStats(players, rounds).map((s) => [s.playerId, s]));

  function namesFor(ids: string[]): string {
    if (ids.length === 0) return '—';
    return ids.map((id) => nameById.get(id) ?? 'Unknown').join(', ');
  }

  return (
    <section className="card">
      <h2>Player Stats</h2>
      <p className="hint">
        Casual session stats, focused on fair rotation and game time — not a competitive ranking.
      </p>
      <div className="leaderboard-scroll">
        <table className="leaderboard-table stats-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Played</th>
              <th>Byes</th>
              {showPartners && <th>Partners</th>}
              <th>Opponents</th>
              {showPoints && <th>Points</th>}
              {showWinLoss && <th>Wins</th>}
              {showWinLoss && <th>Losses</th>}
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const stats = statsByPlayer.get(player.id)!;
              return (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{stats.matchesPlayed}</td>
                  <td>{stats.byes}</td>
                  {showPartners && <td className="stats-names">{namesFor(stats.partnerIds)}</td>}
                  <td className="stats-names">{namesFor(stats.opponentIds)}</td>
                  {showPoints && <td>{stats.totalPoints}</td>}
                  {showWinLoss && <td>{stats.wins}</td>}
                  {showWinLoss && <td>{stats.losses}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
