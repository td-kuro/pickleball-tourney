import type { Player, Round, TournamentSettings } from '../types';
import { getMatchWinner, isScoringEnabled } from '../utils/tournament';

interface RoundHistoryProps {
  rounds: Round[];
  players: Player[];
  settings: TournamentSettings;
}

// Read-only record of every round played so far (most recent first), for
// both Tournament and Social Play — useful for reviewing a session after
// the fact regardless of whether it was scored.
export function RoundHistory({ rounds, players, settings }: RoundHistoryProps) {
  if (rounds.length === 0) {
    return (
      <section className="card">
        <h2>Round History</h2>
        <p className="empty-state">No rounds played yet.</p>
      </section>
    );
  }

  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const showScoring = isScoringEnabled(settings);

  function teamLabel(playerIds: string[]) {
    return playerIds.map((id) => playerNameById.get(id) ?? 'Unknown player').join(' & ');
  }

  function byeLabel(byePlayerIds: string[]) {
    return byePlayerIds.map((id) => playerNameById.get(id) ?? 'Unknown player').join(', ');
  }

  const orderedRounds = [...rounds].reverse();

  return (
    <section className="card">
      <h2>Round History</h2>
      <div className="round-history-list">
        {orderedRounds.map((round) => (
          <div key={round.id} className="round-history-entry">
            <h3>Round {round.roundNumber}</h3>
            <ul className="round-history-matches">
              {round.matches.map((match) => {
                const teamALabel = teamLabel(match.teamA.playerIds);
                const teamBLabel = teamLabel(match.teamB.playerIds);
                const winner = getMatchWinner(match);
                const hasScore = match.scoreA != null && match.scoreB != null;

                return (
                  <li key={match.id} className="round-history-match">
                    <span>
                      Court {match.court}: {teamALabel} vs {teamBLabel}
                    </span>
                    {showScoring && hasScore && (
                      <span className="round-history-score">
                        {match.scoreA}–{match.scoreB}
                        {winner && ` · Winner: ${winner === 'A' ? teamALabel : teamBLabel}`}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {round.byePlayerIds.length > 0 && (
              <p className="round-history-byes">Bye: {byeLabel(round.byePlayerIds)}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
