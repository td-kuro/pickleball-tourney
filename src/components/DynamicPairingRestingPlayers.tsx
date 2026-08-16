import type { DynamicPairingRound, Player, PlayerAvailabilityStatus } from '../types';
import { calculateDynamicPairingStats, playedDynamicPairingRounds } from '../utils/dynamicPairingSocial';

interface DynamicPairingRestingPlayersProps {
  players: Player[];
  rounds: DynamicPairingRound[];
}

function availabilityLabel(status: PlayerAvailabilityStatus): string {
  switch (status) {
    case 'available':
      return 'Available';
    case 'late':
      return 'Late';
    case 'resting':
      return 'Resting';
    case 'withdrawn':
      return 'Withdrawn';
    case 'injured':
      return 'Injured';
  }
}

// Rest fairness at a glance — see selectRestingPlayers in
// utils/dynamicPairingSocial.ts for the rules this reflects (fewest total
// rests first, then most consecutive rounds played, then didn't rest last
// round). Deliberately not sorted by ranking — this view is about rest
// history only, independent of how competitive a player is. Excludes
// pre-generated-but-'upcoming' rounds (see playedDynamicPairingRounds) —
// a planned-but-not-yet-played rest shouldn't count until it actually
// happens.
export function DynamicPairingRestingPlayers({ players, rounds }: DynamicPairingRestingPlayersProps) {
  if (players.length === 0) {
    return (
      <section className="card">
        <h2>Resting Players</h2>
        <p className="empty-state">Add players to see rest history.</p>
      </section>
    );
  }

  const statsById = new Map(
    calculateDynamicPairingStats(players, playedDynamicPairingRounds(rounds)).map((s) => [s.playerId, s]),
  );

  return (
    <section className="card">
      <h2>Resting Players</h2>
      <p className="hint">
        Rest counts are global across the whole session and independent of ranking — a resting player receives no
        win, loss, points, or point differential for that round.
      </p>
      <div className="leaderboard-scroll">
        <table className="leaderboard-table stats-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Total Rests</th>
              <th>Last Rested (Round)</th>
              <th>Consecutive Rounds Played</th>
              <th>Availability</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const stats = statsById.get(player.id);
              return (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{stats?.totalRests ?? 0}</td>
                  <td>{stats?.lastRestRound ?? '—'}</td>
                  <td>{stats?.consecutiveRoundsPlayed ?? 0}</td>
                  <td>{availabilityLabel(player.availabilityStatus ?? 'available')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
