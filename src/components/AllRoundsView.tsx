import type { Player, Round, TournamentSettings } from '../types';
import { getMatchWinner, isScoringEnabled } from '../utils/tournament';

interface AllRoundsViewProps {
  rounds: Round[];
  players: Player[];
  settings: TournamentSettings;
}

// Read-only record of every round so far (most recent first), for both
// Tournament and Social Play — useful for reviewing a session live or after
// the fact. The current/active round is included too (clearly badged)
// rather than only completed ones, since it's the same `rounds` state
// CurrentRoundView reads — no separate history is tracked.
export function AllRoundsView({ rounds, players, settings }: AllRoundsViewProps) {
  if (rounds.length === 0) {
    return (
      <section className="card">
        <h2>All Rounds</h2>
        <p className="empty-state">No completed rounds yet. Start or complete a round to see round history here.</p>
      </section>
    );
  }

  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const showScoring = isScoringEnabled(settings);
  const currentRoundId = rounds[rounds.length - 1].id;

  function teamLabel(playerIds: string[]) {
    return playerIds.map((id) => playerNameById.get(id) ?? 'Unknown player').join(' & ');
  }

  function byeLabel(byePlayerIds: string[]) {
    return byePlayerIds.map((id) => playerNameById.get(id) ?? 'Unknown player').join(', ');
  }

  // Doubles teams have 2 players; derived from the round's own match data
  // (rather than the current settings) so a mid-session match type change
  // doesn't relabel earlier rounds.
  function matchTypeLabel(round: Round): string {
    return round.matches[0]?.teamA.playerIds.length === 2 ? 'Doubles' : 'Singles';
  }

  const orderedRounds = [...rounds].reverse();

  return (
    <section className="card">
      <h2>All Rounds</h2>
      <div className="all-rounds-list">
        {orderedRounds.map((round) => {
          const isCurrent = round.id === currentRoundId;
          return (
            <div key={round.id} className={isCurrent ? 'all-rounds-entry all-rounds-entry-current' : 'all-rounds-entry'}>
              <div className="all-rounds-entry-heading">
                <h3>Round {round.roundNumber}</h3>
                {isCurrent && <span className="mode-badge social">Current Round</span>}
                <span className="all-rounds-match-type">{matchTypeLabel(round)}</span>
              </div>
              <ul className="all-rounds-matches">
                {round.matches.map((match) => {
                  const teamALabel = teamLabel(match.teamA.playerIds);
                  const teamBLabel = teamLabel(match.teamB.playerIds);
                  const winner = getMatchWinner(match);
                  const hasScore = match.scoreA != null && match.scoreB != null;

                  return (
                    <li key={match.id} className="all-rounds-match">
                      <span>
                        Court {match.court}: {teamALabel} vs {teamBLabel}
                      </span>
                      {showScoring && hasScore && (
                        <span className="all-rounds-score">
                          {match.scoreA}–{match.scoreB}
                          {winner && ` · Winner: ${winner === 'A' ? teamALabel : teamBLabel}`}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="all-rounds-byes">
                {round.byePlayerIds.length > 0 ? `Bye: ${byeLabel(round.byePlayerIds)}` : 'Everyone played this round.'}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
