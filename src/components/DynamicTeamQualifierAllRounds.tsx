import type { DynamicTeam, MedalBracket, MedalBracketMatch, QualifyingRound, QualifyingRoundStatus } from '../types';
import { getAllRoundsForDisplay, qualifyingRoundStatusLabel } from '../utils/dynamicTeamQualifier';

const STATUS_CLASS: Record<QualifyingRoundStatus, string> = {
  upcoming: 'status-badge',
  current: 'status-badge status-badge-current',
  completed: 'status-badge status-badge-completed',
  locked: 'status-badge status-badge-completed',
};

interface DynamicTeamQualifierAllRoundsProps {
  teams: DynamicTeam[];
  rounds: QualifyingRound[];
  medalBracket: MedalBracket | null;
}

// Read-only history of every Dynamic Team Qualifier round — every
// qualifying round generated so far (including 'upcoming' ones, whose
// resting teams are already known from the rest schedule even before
// pairings exist), plus the medal bracket once it's been generated. Score
// entry lives only in Current Round — see README's "All Rounds view".
export function DynamicTeamQualifierAllRounds({ teams, rounds, medalBracket }: DynamicTeamQualifierAllRoundsProps) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  function teamLabel(id?: string): string {
    if (!id) return 'TBD';
    const team = teamById.get(id);
    return team ? `${team.teamCode} ${team.displayName}` : 'Unknown team';
  }

  if (rounds.length === 0) {
    return (
      <section className="card">
        <h2>All Rounds</h2>
        <p className="empty-state">No rounds yet. Start Qualifying to see the round schedule here.</p>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <h2>All Rounds</h2>
        <div className="all-rounds-list">
          {getAllRoundsForDisplay(rounds).map((round) => (
            <div
              key={round.roundNumber}
              className={
                round.status === 'current'
                  ? 'all-rounds-entry all-rounds-entry-current'
                  : round.status === 'upcoming'
                    ? 'all-rounds-entry all-rounds-entry-upcoming'
                    : 'all-rounds-entry'
              }
            >
              <div className="all-rounds-entry-heading">
                <h3>Round {round.roundNumber}</h3>
                <span className={STATUS_CLASS[round.status]}>{qualifyingRoundStatusLabel(round.status)}</span>
                <span className="all-rounds-match-type">Qualifying</span>
              </div>

              {round.matches.length > 0 ? (
                <ul className="all-rounds-matches">
                  {round.matches.map((match) => {
                    const teamAName = teamLabel(match.teamAId);
                    const teamBName = teamLabel(match.teamBId);
                    const hasScore = match.scoreA != null && match.scoreB != null;
                    return (
                      <li key={match.id} className="all-rounds-match">
                        <span>
                          Court {match.courtNumber}: {teamAName} vs {teamBName}
                        </span>
                        {match.forfeit && match.winnerId ? (
                          <span className="all-rounds-score">Forfeit · Winner: {match.winnerId === match.teamAId ? teamAName : teamBName}</span>
                        ) : hasScore ? (
                          <span className="all-rounds-score">
                            {match.scoreA}–{match.scoreB}
                            {match.goldenPoint && ' · Golden point'}
                            {match.winnerId && ` · Winner: ${match.winnerId === match.teamAId ? teamAName : teamBName}`}
                          </span>
                        ) : (
                          <span className="all-rounds-score">Score not yet entered</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="hint">Pairings will be generated after previous round results are locked.</p>
              )}

              <p className="all-rounds-byes">
                {round.restingTeamIds.length > 0
                  ? `Resting: ${round.restingTeamIds.map((id) => teamLabel(id)).join(', ')}`
                  : 'No teams resting this round.'}
              </p>
            </div>
          ))}
        </div>
      </section>

      {medalBracket && <MedalBracketSummary bracket={medalBracket} teamLabel={teamLabel} />}
    </>
  );
}

interface MedalBracketSummaryProps {
  bracket: MedalBracket;
  teamLabel: (id?: string) => string;
}

function MedalBracketSummary({ bracket, teamLabel }: MedalBracketSummaryProps) {
  const matches: MedalBracketMatch[] = [bracket.semifinal1, bracket.semifinal2, bracket.goldMatch, bracket.bronzeMatch];
  const placementByTeamId = new Map<string, string>();
  if (bracket.champion) placementByTeamId.set(bracket.champion, '1st Place');
  if (bracket.runnerUp) placementByTeamId.set(bracket.runnerUp, '2nd Place');
  if (bracket.thirdPlace) placementByTeamId.set(bracket.thirdPlace, '3rd Place');
  if (bracket.fourthPlace) placementByTeamId.set(bracket.fourthPlace, '4th Place');

  return (
    <section className="card">
      <h2>Medal Bracket</h2>
      <div className="all-rounds-list">
        {matches.map((match) => {
          const teamAName = teamLabel(match.teamAId);
          const teamBName = teamLabel(match.teamBId);
          return (
            <div key={match.id} className={match.status === 'current' ? 'all-rounds-entry all-rounds-entry-current' : 'all-rounds-entry'}>
              <div className="all-rounds-entry-heading">
                <h3>{match.roundName}</h3>
                <span
                  className={
                    match.status === 'current'
                      ? 'status-badge status-badge-current'
                      : match.status === 'completed'
                        ? 'status-badge status-badge-completed'
                        : 'status-badge'
                  }
                >
                  {match.status === 'upcoming' ? 'Upcoming' : match.status === 'current' ? 'Current' : 'Completed'}
                </span>
              </div>
              <ul className="all-rounds-matches">
                <li className="all-rounds-match">
                  <span>
                    {teamAName} vs {teamBName}
                  </span>
                  {match.scoreA != null && match.scoreB != null && (
                    <span className="all-rounds-score">
                      {match.scoreA}–{match.scoreB}
                      {match.winnerId && ` · Winner: ${match.winnerId === match.teamAId ? teamAName : teamBName}`}
                    </span>
                  )}
                </li>
              </ul>
              {match.winnerId && placementByTeamId.get(match.winnerId) && (
                <p className="all-rounds-byes">Final placement: {teamLabel(match.winnerId)} — {placementByTeamId.get(match.winnerId)}</p>
              )}
              {match.loserId && placementByTeamId.get(match.loserId) && (
                <p className="all-rounds-byes">Final placement: {teamLabel(match.loserId)} — {placementByTeamId.get(match.loserId)}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
