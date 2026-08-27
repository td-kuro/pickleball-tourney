import type { DynamicPairingRound, DynamicPairingTeam, Player } from '../types';
import { calculateEntrantRankings, formatSignedPoints, playedDynamicPairingRounds } from '../utils/dynamicPairingSocial';

interface DynamicPairingRankingsProps {
  players: Player[];
  teams: DynamicPairingTeam[];
  rounds: DynamicPairingRound[];
}

// Current standings — see calculateEntrantRankings in
// utils/dynamicPairingSocial.ts for the ranking rules (win % → avg point
// differential → avg points scored → head-to-head → skill level →
// starting seed → previous rank → stable tiebreak), applied per *entrant*
// (an individual player, or a fixed team ranked as one unit — see
// buildDynamicPairingEntrants). When no fixed team exists this is
// identical to ranking players directly, so this component works
// unconditionally regardless of whether the session uses fixed teams.
// Recalculated fresh from every round played so far, including any scores
// already entered in the still-open current round, so this stays live as
// the organiser enters scores. Deliberately excludes pre-generated-but-
// 'upcoming' rounds (see playedDynamicPairingRounds) — those haven't been
// played yet, so they must not affect anyone's win/loss record.
export function DynamicPairingRankings({ players, teams, rounds }: DynamicPairingRankingsProps) {
  if (players.length === 0) {
    return (
      <section className="card">
        <h2>Rankings</h2>
        <p className="empty-state">Add players to see rankings.</p>
      </section>
    );
  }

  const rows = calculateEntrantRankings(players, teams, playedDynamicPairingRounds(rounds));
  const playerById = new Map(players.map((p) => [p.id, p]));
  // "New" badge: added mid-session and hasn't played a single game yet — see
  // usePlayers.addPlayerMidSession/section 3's "Neutral stats for new
  // players". A fixed team only badges "New" once every member qualifies —
  // one already-established player joining a brand-new one still has real
  // history behind the pairing.
  function isNewNoStats(playerIds: string[], gamesPlayed: number): boolean {
    if (gamesPlayed > 0) return false;
    return playerIds.every((id) => playerById.get(id)?.addedMidSession);
  }

  return (
    <section className="card">
      <h2>Rankings</h2>
      <p className="hint">
        Ranked by win %, then average point differential, then average points scored, then head-to-head, skill
        level, starting seed, and previous rank as tiebreakers. A fixed team is ranked as one unit — see README's
        "Fixed teams".
      </p>
      <div className="leaderboard-scroll">
        <table className="leaderboard-table stats-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player / Team</th>
              <th>Type</th>
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
            {rows.map(({ entrant, stats, rank }) => (
              <tr key={entrant.id} className={rank === 1 ? 'leaderboard-top' : undefined}>
                <td>{rank}</td>
                <td>
                  {entrant.displayName}
                  {isNewNoStats(entrant.playerIds, stats.gamesPlayed) && (
                    <span className="status-badge status-badge-new" title="Added mid-session — no completed stats yet">
                      {' '}
                      New
                    </span>
                  )}
                </td>
                <td>
                  <span className={entrant.type === 'fixed-team' ? 'participant-badge participant-badge-team' : 'participant-badge participant-badge-player'}>
                    {entrant.type === 'fixed-team' ? 'Fixed Team' : 'Individual'}
                  </span>
                </td>
                <td>{stats.gamesPlayed}</td>
                <td>{stats.wins}</td>
                <td>{stats.losses}</td>
                <td>{(stats.winPercentage * 100).toFixed(0)}%</td>
                <td>{stats.pointsFor}</td>
                <td>{stats.pointsAgainst}</td>
                <td>{formatSignedPoints(stats.pointDifferential)}</td>
                <td>{formatSignedPoints(stats.averagePointDifferential)}</td>
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
