import type { Pool, ScoreRecordingMode, Team } from '../types';
import { computePoolStandings } from '../utils/poolsKnockout';

interface PoolLeaderboardProps {
  pool: Pool;
  teams: Team[];
  teamsAdvancingPerPool: number;
  // Qualification is always computed (as a live projection), but the
  // "Qualified" status column/badge only makes sense to show once the pool
  // has actually finished — see PoolStageView/FinalResults.
  poolComplete: boolean;
  scoreRecordingMode: ScoreRecordingMode;
}

// One pool's standings table: W/L, PF, PA, +/-, and (once the pool is
// complete) which teams qualify for the knockout bracket. Reused by both
// PoolStageView (live, in progress) and FinalResults (final, read-only).
export function PoolLeaderboard({ pool, teams, teamsAdvancingPerPool, poolComplete, scoreRecordingMode }: PoolLeaderboardProps) {
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const standings = computePoolStandings(pool, teamsAdvancingPerPool, scoreRecordingMode);
  const showPoints = scoreRecordingMode === 'full-score';

  return (
    <div className="pool-leaderboard">
      <h4>{pool.name} Standings</h4>
      <div className="leaderboard-scroll">
        <table className="leaderboard-table stats-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>W</th>
              <th>L</th>
              {showPoints && <th>PF</th>}
              {showPoints && <th>PA</th>}
              {showPoints && <th>+/-</th>}
              {poolComplete && <th>Status</th>}
            </tr>
          </thead>
          <tbody>
            {standings.map((standing) => (
              <tr key={standing.teamId} className={standing.qualifiesForKnockout ? 'pool-standing-qualifying' : undefined}>
                <td>{teamNameById.get(standing.teamId) ?? 'Unknown team'}</td>
                <td>{standing.wins}</td>
                <td>{standing.losses}</td>
                {showPoints && <td>{standing.pointsFor}</td>}
                {showPoints && <td>{standing.pointsAgainst}</td>}
                {showPoints && <td>{standing.pointDifference > 0 ? `+${standing.pointDifference}` : standing.pointDifference}</td>}
                {poolComplete && (
                  <td>
                    {standing.qualifiesForKnockout ? (
                      <span className="status-badge status-badge-current">Qualified</span>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
