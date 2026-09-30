import type { DynamicTeam, MedalBracket, MedalBracketMatch, MedalBracketMatchLabel, ResultSubmission, ScoreRecordingMode } from '../types';
import { SCORE_NOT_RECORDED } from '../utils/results';
import { MatchResultEntry } from './MatchResultEntry';

interface DynamicTeamQualifierMedalBracketProps {
  bracket: MedalBracket | null;
  teams: DynamicTeam[];
  onSetResult: (label: MedalBracketMatchLabel, result: ResultSubmission) => void;
  scoreRecordingMode: ScoreRecordingMode;
}

// Semis / Gold / Bronze bracket for the top 4 final-standings teams — see
// README's "Medal bracket". Both semifinals can be in progress at once
// (they're independent courts, unlike a normal single-elimination
// bracket's strictly one "current" match at a time); Gold and Bronze stay
// "Upcoming" until both semifinals are complete.
export function DynamicTeamQualifierMedalBracket({ bracket, teams, onSetResult, scoreRecordingMode }: DynamicTeamQualifierMedalBracketProps) {
  if (!bracket) {
    return (
      <section className="card">
        <h2>Medal Bracket</h2>
        <p className="empty-state">Complete qualifying and review Final Standings to generate the medal bracket.</p>
      </section>
    );
  }

  const teamById = new Map(teams.map((t) => [t.id, t]));
  function teamLabel(id?: string): string {
    if (!id) return 'TBD';
    const team = teamById.get(id);
    return team ? `${team.teamCode} ${team.displayName}` : 'Unknown team';
  }

  const matches: MedalBracketMatch[] = [bracket.semifinal1, bracket.semifinal2, bracket.goldMatch, bracket.bronzeMatch];

  return (
    <>
      {matches.map((match) => (
        <section key={match.id} className="card">
          <h3>{match.roundName}</h3>
          <div className="match-list">
            <MedalBracketMatchCard
              match={match}
              teamAName={teamLabel(match.teamAId)}
              teamBName={teamLabel(match.teamBId)}
              scoreMode={scoreRecordingMode}
              onSetResult={(result) => onSetResult(match.label, result)}
            />
          </div>
        </section>
      ))}
    </>
  );
}

interface MedalBracketMatchCardProps {
  match: MedalBracketMatch;
  teamAName: string;
  teamBName: string;
  scoreMode: ScoreRecordingMode;
  onSetResult: (result: ResultSubmission) => void;
}

function MedalBracketMatchCard({ match, teamAName, teamBName, scoreMode, onSetResult }: MedalBracketMatchCardProps) {
  if (match.status === 'upcoming') {
    return (
      <div className="match-card">
        <div className="match-header">Waiting for both semifinals</div>
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

  if (match.status === 'completed') {
    return (
      <div className="match-card">
        <div className="match-teams">
          <div className={match.winnerId === match.teamAId ? 'match-team winner' : 'match-team'}>
            <span className="match-team-name">
              {teamAName}
              {match.scoreA != null ? ` — ${match.scoreA}` : ''}
            </span>
          </div>
          <div className="match-vs">vs</div>
          <div className={match.winnerId === match.teamBId ? 'match-team winner' : 'match-team'}>
            <span className="match-team-name">
              {teamBName}
              {match.scoreB != null ? ` — ${match.scoreB}` : ''}
            </span>
          </div>
        </div>
        <p className="hint winner-hint">
          Winner: {match.winnerId === match.teamAId ? teamAName : teamBName}
          {match.scoreA == null ? ` · ${SCORE_NOT_RECORDED}` : ''}
        </p>
      </div>
    );
  }

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
    </div>
  );
}
