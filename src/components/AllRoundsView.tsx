import type { Player, Round, RoundStatus, Team, TournamentSettings } from '../types';
import { getMatchWinner, isScoringEnabled, teamKey } from '../utils/tournament';

interface AllRoundsViewProps {
  rounds: Round[];
  players: Player[];
  settings: TournamentSettings;
  // Only relevant (and only ever non-empty) for Doubles with at least one
  // fixed team — badges a match side as "Fixed Team" when its playerIds
  // match a declared team, same as CurrentRoundView.
  teams?: Team[];
}

const STATUS_LABEL: Record<RoundStatus, string> = {
  current: 'Current',
  upcoming: 'Upcoming',
  completed: 'Completed',
};

// Read-only record of every planned round, in order. In Social Play, the
// full session schedule (matches and byes included) is pre-generated at
// Start Matches — see useTournament.startSession — so this shows all of
// it up front, each round clearly badged Completed / Current / Upcoming.
// In Tournament Mode, rounds are still generated one at a time, so only
// rounds generated so far appear here (the last one always "current").
// Score entry only ever happens on Current Round — this view never lets
// you edit a score, even for the current round.
export function AllRoundsView({ rounds, players, settings, teams = [] }: AllRoundsViewProps) {
  if (rounds.length === 0) {
    return (
      <section className="card">
        <h2>All Rounds</h2>
        <p className="empty-state">No rounds yet. Start matches to see the round schedule here.</p>
      </section>
    );
  }

  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const fixedTeamNameByKey = new Map(teams.map((team) => [teamKey(team.playerIds), team.name]));
  const showScoring = isScoringEnabled(settings);

  function teamLabel(playerIds: string[]) {
    const fixedName = playerIds.length === 2 ? fixedTeamNameByKey.get(teamKey(playerIds)) : undefined;
    if (fixedName) return `${fixedName} (Fixed Team)`;
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

  return (
    <section className="card">
      <h2>All Rounds</h2>
      <div className="all-rounds-list">
        {rounds.map((round) => (
          <div key={round.id} className={`all-rounds-entry all-rounds-entry-${round.status}`}>
            <div className="all-rounds-entry-heading">
              <h3>Round {round.roundNumber}</h3>
              <span className={`status-badge status-badge-${round.status}`}>{STATUS_LABEL[round.status]}</span>
              <span className="all-rounds-match-type">{matchTypeLabel(round)}</span>
            </div>
            {round.matches.length === 0 ? (
              <p className="empty-state">No matchups for this round.</p>
            ) : (
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
            )}
            <p className="all-rounds-byes">
              {round.byePlayerIds.length > 0 ? `Bye: ${byeLabel(round.byePlayerIds)}` : 'Everyone played this round.'}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
