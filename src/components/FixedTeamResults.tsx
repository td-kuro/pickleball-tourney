import type { Round, Team, TournamentSettings } from '../types';
import { calculateTeamLeaderboardStats } from '../utils/pairing';
import { isScoringEnabled, isWinLossTracked } from '../utils/tournament';

interface FixedTeamResultsProps {
  teams: Team[];
  rounds: Round[];
  settings: TournamentSettings;
}

// The Doubles + Fixed Teams results tab: a Team Leaderboard in Tournament
// Mode (ranked, same spirit as the regular Leaderboard) or Dedicated
// Pairing Stats in Social Play (not ranked — fixed pairs are for practice,
// not competitive standing, per the spec: "do not force them into
// competitive ranking unless scoring mode requires it").
export function FixedTeamResults({ teams, rounds, settings }: FixedTeamResultsProps) {
  const isTournament = settings.playMode === 'tournament';
  const heading = isTournament ? 'Team Leaderboard' : 'Dedicated Pairing Stats';

  if (teams.length === 0) {
    return (
      <section className="card">
        <h2>{heading}</h2>
        <p className="empty-state">Add teams to see standings.</p>
      </section>
    );
  }

  const showPoints = isScoringEnabled(settings);
  const showWinLoss = isWinLossTracked(settings);

  // calculateTeamLeaderboardStats already sorts by wins, then points, then
  // point difference, then byes, then rating — for Social Play (Dedicated
  // Pairing Stats, not ranked) we still use it for the stats themselves but
  // display rows in team-creation order instead of the computed rank.
  const rankedRows = calculateTeamLeaderboardStats(teams, rounds);
  const rows = isTournament ? rankedRows : teams.map((team) => ({ team, stats: rankedRows.find((r) => r.team.id === team.id)!.stats, rank: 0 }));

  return (
    <section className="card">
      <h2>{heading}</h2>
      <p className="hint">
        {isTournament
          ? 'Fixed teams stay together for the whole tournament — ranked by wins, then point difference, then Points For.'
          : 'Dedicated Pairing — practice pairs that stay together for the session, shown for information rather than a competitive ranking.'}
      </p>
      <div className="leaderboard-scroll">
        <table className="leaderboard-table stats-table">
          <thead>
            <tr>
              {isTournament && <th>#</th>}
              <th>Team</th>
              <th>Played</th>
              <th>Byes</th>
              {showWinLoss && <th>Wins</th>}
              {showWinLoss && <th>Losses</th>}
              {showPoints && <th>PF</th>}
              {showPoints && <th>PA</th>}
              {showPoints && <th>+/-</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ team, stats }, index) => (
              <tr key={team.id} className={isTournament && index === 0 ? 'leaderboard-top' : undefined}>
                {isTournament && <td>{index + 1}</td>}
                <td>{team.name}</td>
                <td>{stats.gamesPlayed}</td>
                <td>{stats.byes}</td>
                {showWinLoss && <td>{stats.wins}</td>}
                {showWinLoss && <td>{stats.losses}</td>}
                {showPoints && <td>{stats.pointsFor}</td>}
                {showPoints && <td>{stats.pointsAgainst}</td>}
                {showPoints && <td>{stats.pointDifference > 0 ? `+${stats.pointDifference}` : stats.pointDifference}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
