import type { DynamicTeam, DynamicTeamQualifierStage, QualifyingRound, RestAssignment } from '../types';
import { calculateFinalStandings, calculateProvisionalStandings, formatSignedPoints } from '../utils/dynamicTeamQualifier';

interface DynamicTeamQualifierStandingsProps {
  teams: DynamicTeam[];
  rounds: QualifyingRound[];
  restAssignments: RestAssignment[];
  stage: DynamicTeamQualifierStage;
}

// Standings tab — Provisional Standings while qualifying is still in
// progress (win % → opponent win % → total wins → capped point
// differential, since teams may have played different numbers of games
// because of scheduled rests — see calculateProvisionalStandings), or
// Final Standings once every qualifying round is locked (total wins →
// opponent win % → head-to-head → capped point differential → total
// points — see calculateFinalStandings). Both read from the same
// TeamStanding shape, just ranked differently, so this is one component.
export function DynamicTeamQualifierStandings({ teams, rounds, restAssignments, stage }: DynamicTeamQualifierStandingsProps) {
  const activeTeamIds = teams.filter((t) => t.checkedIn && !t.withdrawn).map((t) => t.id);
  if (activeTeamIds.length === 0) {
    return (
      <section className="card">
        <h2>Standings</h2>
        <p className="empty-state">No checked-in teams yet.</p>
      </section>
    );
  }

  const reachedRounds = rounds.filter((r) => r.status !== 'upcoming');
  const reachedMatches = reachedRounds.flatMap((r) => r.matches);
  const reachedRoundNumbers = new Set(reachedRounds.map((r) => r.roundNumber));
  const reachedRests = restAssignments.filter((a) => reachedRoundNumbers.has(a.roundNumber));

  const isFinal = stage !== 'setup' && stage !== 'qualifying';
  const standings = isFinal
    ? calculateFinalStandings(activeTeamIds, reachedMatches, reachedRests)
    : calculateProvisionalStandings(activeTeamIds, reachedMatches, reachedRests);

  const currentRound = rounds.find((r) => r.status === 'current');
  const teamById = new Map(teams.map((t) => [t.id, t]));

  function currentRoundStatus(teamId: string): string {
    if (!currentRound) return '—';
    if (currentRound.restingTeamIds.includes(teamId)) return 'Resting';
    const match = currentRound.matches.find((m) => m.teamAId === teamId || m.teamBId === teamId);
    if (!match) return '—';
    return `Court ${match.courtNumber}`;
  }

  return (
    <section className="card">
      <h2>{isFinal ? 'Final Standings' : 'Provisional Standings'}</h2>
      <p className="hint">
        {isFinal
          ? 'Ranked by total wins, then opponent win %, then head-to-head (only when a complete mini round-robin exists among tied teams), then capped point differential, then total points scored.'
          : 'Ranked by win %, then opponent win %, then total wins, then capped point differential — win % (not raw wins) leads because teams may have played different numbers of games due to scheduled rests.'}
      </p>
      <div className="leaderboard-scroll">
        <table className="leaderboard-table stats-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>Players</th>
              <th>Played</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Win %</th>
              <th>Opp. Win %</th>
              <th>PF</th>
              <th>PA</th>
              <th>Capped +/-</th>
              <th>Rests</th>
              <th>This Round</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing) => {
              const team = teamById.get(standing.teamId);
              return (
                <tr key={standing.teamId} className={standing.rank === 1 ? 'leaderboard-top' : undefined}>
                  <td>{standing.rank}</td>
                  <td>
                    {team?.teamCode} {team?.displayName}
                  </td>
                  <td>
                    {team?.playerAName} / {team?.playerBName}
                  </td>
                  <td>{standing.gamesPlayed}</td>
                  <td>{standing.wins}</td>
                  <td>{standing.losses}</td>
                  <td>{(standing.winPercentage * 100).toFixed(0)}%</td>
                  <td>{(standing.opponentWinPercentage * 100).toFixed(0)}%</td>
                  <td>{standing.pointsFor}</td>
                  <td>{standing.pointsAgainst}</td>
                  <td>{formatSignedPoints(standing.cappedPointDifferential)}</td>
                  <td>{standing.restCount}</td>
                  <td>{currentRoundStatus(standing.teamId)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
