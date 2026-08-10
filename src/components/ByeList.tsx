import type { Player, Round, Team } from '../types';

interface ByeListProps {
  round: Round;
  players: Player[];
  // Only relevant (and only ever non-empty) for Doubles with at least one
  // fixed team — groups a whole fixed team's bye into one chip (e.g.
  // "Carol / Dave") instead of two separate player chips, using
  // round.byeTeamIds. A temporarily split team's still-sitting player
  // (round.splitTeamIds) is intentionally left as an individual chip,
  // since only one of the two actually sat out.
  teams?: Team[];
}

// Shown below the current round's matches: whoever isn't playing this
// round because they were selected for a bye (see the rotation logic in
// src/utils/tournament.ts and utils/pairing.ts).
export function ByeList({ round, players, teams = [] }: ByeListProps) {
  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const byeTeamIds = round.byeTeamIds ?? [];
  const byeTeamPlayerIds = new Set(byeTeamIds.flatMap((teamId) => teams.find((t) => t.id === teamId)?.playerIds ?? []));
  const individualByeIds = round.byePlayerIds.filter((id) => !byeTeamPlayerIds.has(id));

  const hasByes = round.byePlayerIds.length > 0;

  return (
    <section className="card">
      <h2>Bye / Sitting Out This Round</h2>
      {!hasByes ? (
        <p className="empty-state">Everyone is playing this round.</p>
      ) : (
        <ul className="bye-list">
          {byeTeamIds.map((teamId) => {
            const team = teams.find((t) => t.id === teamId);
            return (
              <li key={teamId} className="bye-chip">
                {team?.name ?? 'Unknown team'}
              </li>
            );
          })}
          {individualByeIds.map((id) => (
            <li key={id} className="bye-chip">
              {playerNameById.get(id) ?? 'Unknown player'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
