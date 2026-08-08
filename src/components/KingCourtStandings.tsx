import type { KingCourtCycle, Player } from '../types';
import { calculateCourtStandings, computeKingCourtPlayerStats } from '../utils/kingCourt';

interface KingCourtStandingsProps {
  players: Player[];
  cycles: KingCourtCycle[];
}

// The "Standings" tab: cumulative session stats for every player (across
// every cycle so far), plus the current cycle's per-court standings —
// live-updating even mid-cycle, since calculateCourtStandings works off
// whatever games are scored so far, not just a finished cycle.
export function KingCourtStandings({ players, cycles }: KingCourtStandingsProps) {
  if (players.length === 0 || cycles.length === 0) {
    return (
      <section className="card">
        <h2>Standings</h2>
        <p className="empty-state">Start Cycle 1 to see standings.</p>
      </section>
    );
  }

  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const currentCycle = cycles[cycles.length - 1];
  const statsByPlayer = new Map(computeKingCourtPlayerStats(players, cycles).map((s) => [s.playerId, s]));
  const currentCourtByPlayer = new Map(
    currentCycle.courts.flatMap((court) => court.playerIds.map((id) => [id, court.courtNumber] as const)),
  );

  const sessionRows = players
    .map((player) => ({ player, stats: statsByPlayer.get(player.id)! }))
    .sort((a, b) => b.stats.totalWins - a.stats.totalWins || b.stats.totalPointDifferential - a.stats.totalPointDifferential);

  return (
    <>
      <section className="card">
        <h2>Session Stats</h2>
        <p className="hint">Cumulative totals across every cycle so far, ranked by wins then point differential.</p>
        <div className="leaderboard-scroll">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Court</th>
                <th>Wins</th>
                <th>Losses</th>
                <th>+/-</th>
                <th>Played</th>
                <th>Rested</th>
              </tr>
            </thead>
            <tbody>
              {sessionRows.map(({ player, stats }, index) => (
                <tr key={player.id} className={index === 0 ? 'leaderboard-top' : undefined}>
                  <td>{player.name}</td>
                  <td>{currentCourtByPlayer.get(player.id) ?? '—'}</td>
                  <td>{stats.totalWins}</td>
                  <td>{stats.totalLosses}</td>
                  <td>
                    {stats.totalPointDifferential > 0 ? '+' : ''}
                    {stats.totalPointDifferential}
                  </td>
                  <td>{stats.gamesPlayed}</td>
                  <td>{stats.gamesRested}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Cycle {currentCycle.cycleNumber} Standings</h2>
        <div className="kc-standings-grid">
          {[...currentCycle.courts]
            .sort((a, b) => b.courtNumber - a.courtNumber)
            .map((court) => {
              const standings = court.standings.length > 0 ? court.standings : calculateCourtStandings(court);
              return (
                <div key={court.courtNumber} className="kc-standings-card">
                  <h3>Court {court.courtNumber}</h3>
                  <table className="leaderboard-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Player</th>
                        <th>W</th>
                        <th>L</th>
                        <th>+/-</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((standing) => (
                        <tr key={standing.playerId} className={standing.rank === 1 ? 'leaderboard-top' : undefined}>
                          <td>{standing.rank}</td>
                          <td>{nameById.get(standing.playerId) ?? 'Unknown player'}</td>
                          <td>{standing.wins}</td>
                          <td>{standing.losses}</td>
                          <td>
                            {standing.pointDifferential > 0 ? '+' : ''}
                            {standing.pointDifferential}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
        </div>
      </section>
    </>
  );
}
