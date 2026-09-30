import type { KnockoutBracket, KnockoutMatch, ResultSubmission, ScoreRecordingMode, Team } from '../types';
import { SCORE_NOT_RECORDED } from '../utils/results';
import { MatchResultEntry } from './MatchResultEntry';

interface KnockoutBracketViewProps {
  bracket: KnockoutBracket;
  teams: Team[];
  // Omitted entirely by FinalResults, which reuses this component purely
  // as a read-only summary once the bracket is already complete.
  onSetResult?: (matchId: string, result: ResultSubmission) => void;
  scoreRecordingMode: ScoreRecordingMode;
  // Team ids the organiser has marked unavailable — flagged on any match
  // they're still in, since the bracket itself is never changed
  // automatically once knockout has started.
  unavailableTeamIds?: string[];
}

// A simple vertical list of rounds (Quarterfinals, Semifinals, Final, ...)
// plus the 3rd Place Match when there is one — deliberately not a graphical
// bracket, so it stays readable on mobile.
export function KnockoutBracketView({ bracket, teams, onSetResult, scoreRecordingMode, unavailableTeamIds = [] }: KnockoutBracketViewProps) {
  const unavailable = new Set(unavailableTeamIds);
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  function teamLabel(teamId?: string): string {
    if (!teamId) return 'TBD';
    return teamNameById.get(teamId) ?? 'Unknown team';
  }

  return (
    <>
      {bracket.rounds.map((round) => (
        <section key={round.name} className="card">
          <h3>{round.name}</h3>
          <div className="match-list">
            {round.matches.map((match) => (
              <KnockoutMatchCard
                key={match.id}
                match={match}
                teamAName={teamLabel(match.teamAId)}
                teamBName={teamLabel(match.teamBId)}
                scoreMode={scoreRecordingMode}
                hasUnavailableTeam={[match.teamAId, match.teamBId].some((id) => id != null && unavailable.has(id))}
                onSetResult={onSetResult ? (result) => onSetResult(match.id, result) : undefined}
              />
            ))}
          </div>
        </section>
      ))}

      {bracket.thirdPlaceMatch && (
        <section className="card">
          <h3>3rd Place Match</h3>
          <div className="match-list">
            <KnockoutMatchCard
              match={bracket.thirdPlaceMatch}
              teamAName={teamLabel(bracket.thirdPlaceMatch.teamAId)}
              teamBName={teamLabel(bracket.thirdPlaceMatch.teamBId)}
              scoreMode={scoreRecordingMode}
              hasUnavailableTeam={[bracket.thirdPlaceMatch.teamAId, bracket.thirdPlaceMatch.teamBId].some(
                (id) => id != null && unavailable.has(id),
              )}
              onSetResult={onSetResult ? (result) => onSetResult(bracket.thirdPlaceMatch!.id, result) : undefined}
            />
          </div>
        </section>
      )}
    </>
  );
}

interface KnockoutMatchCardProps {
  match: KnockoutMatch;
  teamAName: string;
  teamBName: string;
  scoreMode: ScoreRecordingMode;
  hasUnavailableTeam: boolean;
  onSetResult?: (result: ResultSubmission) => void;
}

function KnockoutMatchCard({ match, teamAName, teamBName, scoreMode, hasUnavailableTeam, onSetResult }: KnockoutMatchCardProps) {
  const unavailableNote = hasUnavailableTeam && match.status !== 'completed' && (
    <p className="hint error">A team in this match is marked unavailable — the bracket isn't changed automatically.</p>
  );
  if (match.status === 'bye') {
    const advancingName = match.teamAId ? teamAName : teamBName;
    return (
      <div className="match-card">
        <div className="match-teams">
          <div className="match-team winner">
            <span className="match-team-name">{advancingName}</span>
          </div>
        </div>
        <p className="hint">Bye — advances automatically.</p>
      </div>
    );
  }

  if (match.status === 'pending') {
    return (
      <div className="match-card">
        <div className="match-header">Waiting for previous round</div>
        <div className="match-teams">
          <div className="match-team">
            <span className="match-team-name">{teamAName}</span>
          </div>
          <div className="match-vs">vs</div>
          <div className="match-team">
            <span className="match-team-name">{teamBName}</span>
          </div>
        </div>
      </div>
    );
  }

  if (match.status === 'completed' || !onSetResult) {
    const winner = match.winnerId === match.teamAId ? 'A' : match.winnerId === match.teamBId ? 'B' : undefined;
    return (
      <div className="match-card">
        <div className="match-teams">
          <div className={winner === 'A' ? 'match-team winner' : 'match-team'}>
            <span className="match-team-name">
              {teamAName}
              {match.scoreA != null ? ` — ${match.scoreA}` : ''}
            </span>
          </div>
          <div className="match-vs">vs</div>
          <div className={winner === 'B' ? 'match-team winner' : 'match-team'}>
            <span className="match-team-name">
              {teamBName}
              {match.scoreB != null ? ` — ${match.scoreB}` : ''}
            </span>
          </div>
        </div>
        {winner && (
          <p className="hint winner-hint">
            Winner: {winner === 'A' ? teamAName : teamBName}
            {match.scoreA == null ? ` · ${SCORE_NOT_RECORDED}` : ''}
          </p>
        )}
        {unavailableNote}
      </div>
    );
  }

  // status === 'ready': both teams known, awaiting a result.
  return (
    <div className="match-card">
      <div className="match-teams">
        <div className="match-team">
          <span className="match-team-name">{teamAName}</span>
        </div>
        <div className="match-vs">vs</div>
        <div className="match-team">
          <span className="match-team-name">{teamBName}</span>
        </div>
      </div>
      <MatchResultEntry mode={scoreMode} sideALabel={teamAName} sideBLabel={teamBName} onSubmit={onSetResult} />
      {unavailableNote}
    </div>
  );
}
