import type { Player, Round } from '../types';

interface ByeListProps {
  round: Round;
  players: Player[];
}

// Shown below the current round's matches: whoever isn't playing this
// round because they were selected for a bye (see the rotation logic in
// src/utils/tournament.ts).
export function ByeList({ round, players }: ByeListProps) {
  const playerNameById = new Map(players.map((p) => [p.id, p.name]));

  return (
    <section className="card">
      <h2>Bye / Sitting Out This Round</h2>
      {round.byePlayerIds.length === 0 ? (
        <p className="empty-state">Everyone is playing this round.</p>
      ) : (
        <ul className="bye-list">
          {round.byePlayerIds.map((id) => (
            <li key={id} className="bye-chip">
              {playerNameById.get(id) ?? 'Unknown player'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
