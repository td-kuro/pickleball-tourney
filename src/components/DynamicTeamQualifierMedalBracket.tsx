import { useState, type FormEvent } from 'react';
import type { DynamicTeam, MedalBracket, MedalBracketMatch, MedalBracketMatchLabel } from '../types';

interface DynamicTeamQualifierMedalBracketProps {
  bracket: MedalBracket | null;
  teams: DynamicTeam[];
  onSetScore: (label: MedalBracketMatchLabel, scoreA: number, scoreB: number) => void;
}

// Semis / Gold / Bronze bracket for the top 4 final-standings teams — see
// README's "Medal bracket". Both semifinals can be in progress at once
// (they're independent courts, unlike a normal single-elimination
// bracket's strictly one "current" match at a time); Gold and Bronze stay
// "Upcoming" until both semifinals are complete.
export function DynamicTeamQualifierMedalBracket({ bracket, teams, onSetScore }: DynamicTeamQualifierMedalBracketProps) {
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
              onSetScore={(scoreA, scoreB) => onSetScore(match.label, scoreA, scoreB)}
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
  onSetScore: (scoreA: number, scoreB: number) => void;
}

function MedalBracketMatchCard({ match, teamAName, teamBName, onSetScore }: MedalBracketMatchCardProps) {
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
        <p className="hint winner-hint">Winner: {match.winnerId === match.teamAId ? teamAName : teamBName}</p>
      </div>
    );
  }

  return <MedalBracketScoreForm teamAName={teamAName} teamBName={teamBName} onSetScore={onSetScore} />;
}

interface MedalBracketScoreFormProps {
  teamAName: string;
  teamBName: string;
  onSetScore: (scoreA: number, scoreB: number) => void;
}

function MedalBracketScoreForm({ teamAName, teamBName, onSetScore }: MedalBracketScoreFormProps) {
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedA = Number(scoreA);
    const parsedB = Number(scoreB);
    if (scoreA.trim() === '' || scoreB.trim() === '' || Number.isNaN(parsedA) || Number.isNaN(parsedB)) {
      setError('Enter a valid score for both teams.');
      return;
    }
    if (parsedA < 0 || parsedB < 0) {
      setError('Scores cannot be negative.');
      return;
    }
    if (parsedA === parsedB) {
      setError('Bracket matches need a winner — scores cannot be tied.');
      return;
    }
    setError(null);
    onSetScore(parsedA, parsedB);
  }

  return (
    <form className="match-card" onSubmit={handleSubmit}>
      <div className="match-teams">
        <div className="match-team">
          <span className="match-team-name">{teamAName}</span>
          <input type="number" min={0} value={scoreA} onChange={(event) => setScoreA(event.target.value)} aria-label={`${teamAName} score`} />
        </div>
        <div className="match-vs">vs</div>
        <div className="match-team">
          <span className="match-team-name">{teamBName}</span>
          <input type="number" min={0} value={scoreB} onChange={(event) => setScoreB(event.target.value)} aria-label={`${teamBName} score`} />
        </div>
      </div>
      {error && <p className="hint error">{error}</p>}
      <button type="submit" className="secondary">
        Save Score
      </button>
    </form>
  );
}
