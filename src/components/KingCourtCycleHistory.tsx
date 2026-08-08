import type { KingCourtCycle, Player } from '../types';

interface KingCourtCycleHistoryProps {
  players: Player[];
  cycles: KingCourtCycle[];
}

// The "Cycle History" tab: a read-only, most-recent-first list of every
// completed cycle's final standings and movement, per court.
export function KingCourtCycleHistory({ players, cycles }: KingCourtCycleHistoryProps) {
  const completed = cycles.filter((cycle) => cycle.status === 'completed');
  const nameById = new Map(players.map((p) => [p.id, p.name]));

  if (completed.length === 0) {
    return (
      <section className="card">
        <h2>Cycle History</h2>
        <p className="empty-state">No completed cycles yet — finish Cycle 1 and confirm movement to see history here.</p>
      </section>
    );
  }

  return (
    <div className="all-rounds-list">
      {[...completed].reverse().map((cycle) => (
        <section key={cycle.cycleNumber} className="card all-rounds-entry">
          <h3>Cycle {cycle.cycleNumber}</h3>
          <div className="kc-standings-grid">
            {[...cycle.courts]
              .sort((a, b) => b.courtNumber - a.courtNumber)
              .map((court) => (
                <div key={court.courtNumber} className="kc-standings-card">
                  <h4>Court {court.courtNumber}</h4>
                  <ul className="kc-movement-list">
                    {court.standings.map((standing) => {
                      const movement = court.movementPreview.find((m) => m.playerId === standing.playerId);
                      return (
                        <li key={standing.playerId} className="kc-movement-row">
                          <span className="kc-movement-name">
                            {standing.rank}. {nameById.get(standing.playerId) ?? 'Unknown player'}
                          </span>
                          <span className="kc-movement-record">
                            {standing.wins}W–{standing.losses}L, {standing.pointDifferential > 0 ? '+' : ''}
                            {standing.pointDifferential}
                          </span>
                          {movement && <span className="hint">→ Court {movement.toCourt}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
