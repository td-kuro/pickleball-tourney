import type { DynamicPairingRound, Player } from '../types';
import { calculatePlayerRankings, playedDynamicPairingRounds } from '../utils/dynamicPairingSocial';

interface DynamicPairingRankingsProps {
  players: Player[];
  rounds: DynamicPairingRound[];
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

// Current standings — see calculatePlayerRankings in
// utils/dynamicPairingSocial.ts for the ranking rules (win % → avg point
// differential → avg points scored → head-to-head → starting seed →
// previous rank → stable tiebreak). Recalculated fresh from every round
// played so far, including any scores already entered in the still-open
// current round, so this stays live as the organiser enters scores.
// Deliberately excludes pre-generated-but-'upcoming' rounds (see
// playedDynamicPairingRounds) — those haven't been played yet, so they
// must not affect anyone's win/loss record.
export function DynamicPairingRankings({ players, rounds }: DynamicPairingRankingsProps) {
  if (players.length === 0) {
    return (
      <section className="card">
        <h2>Rankings</h2>
        <p className="empty-state">Add players to see rankings.</p>
      </section>
    );
  }

  const rows = calculatePlayerRankings(players, playedDynamicPairingRounds(rounds));

  return (
    <section className="card">
      <h2>Rankings</h2>
      <p className="hint">
        Ranked by win %, then average point differential, then average points scored, then head-to-head, starting
        seed, and previous rank as tiebreakers.
      </p>
      <div className="leaderboard-scroll">
        <table className="leaderboard-table stats-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Played</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Win %</th>
              <th>PF</th>
              <th>PA</th>
              <th>+/-</th>
              <th>Avg +/-</th>
              <th>Avg Pts</th>
              <th>Rests</th>
              <th>Court</th>
              <th>Prev #</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ player, stats, rank }) => (
              <tr key={player.id} className={rank === 1 ? 'leaderboard-top' : undefined}>
                <td>{rank}</td>
                <td>{player.name}</td>
                <td>{stats.gamesPlayed}</td>
                <td>{stats.wins}</td>
                <td>{stats.losses}</td>
                <td>{(stats.winPercentage * 100).toFixed(0)}%</td>
                <td>{stats.pointsFor}</td>
                <td>{stats.pointsAgainst}</td>
                <td>{formatSigned(stats.pointDifferential)}</td>
                <td>{formatSigned(stats.averagePointDifferential)}</td>
                <td>{stats.averagePointsScored.toFixed(1)}</td>
                <td>{stats.totalRests}</td>
                <td>{stats.currentCourt ?? '—'}</td>
                <td>{stats.previousRank ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
