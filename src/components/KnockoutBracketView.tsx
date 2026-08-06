import { useState, type FormEvent } from 'react';
import type { KnockoutBracket, KnockoutMatch, Team } from '../types';

interface KnockoutBracketViewProps {
  bracket: KnockoutBracket;
  teams: Team[];
  // Omitted entirely by FinalResults, which reuses this component purely
  // as a read-only summary once the bracket is already complete.
  onSetScore?: (matchId: string, scoreA: number, scoreB: number) => void;
}

// A simple vertical list of rounds (Quarterfinals, Semifinals, Final, ...)
// plus the 3rd Place Match when there is one — deliberately not a graphical
// bracket, so it stays readable on mobile.
export function KnockoutBracketView({ bracket, teams, onSetScore }: KnockoutBracketViewProps) {
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
                onSetScore={onSetScore ? (scoreA, scoreB) => onSetScore(match.id, scoreA, scoreB) : undefined}
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
              onSetScore={onSetScore ? (scoreA, scoreB) => onSetScore(bracket.thirdPlaceMatch!.id, scoreA, scoreB) : undefined}
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
  onSetScore?: (scoreA: number, scoreB: number) => void;
}

function KnockoutMatchCard({ match, teamAName, teamBName, onSetScore }: KnockoutMatchCardProps) {
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

  if (match.status === 'completed' || !onSetScore) {
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
        {winner && <p className="hint winner-hint">Winner: {winner === 'A' ? teamAName : teamBName}</p>}
      </div>
    );
  }

  // status === 'ready': both teams known, awaiting a score.
  return <KnockoutScoreForm teamAName={teamAName} teamBName={teamBName} onSetScore={onSetScore} />;
}

interface KnockoutScoreFormProps {
  teamAName: string;
  teamBName: string;
  onSetScore: (scoreA: number, scoreB: number) => void;
}

function KnockoutScoreForm({ teamAName, teamBName, onSetScore }: KnockoutScoreFormProps) {
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedA = Number(scoreA);
    const parsedB = Number(scoreB);
    if (scoreA.trim() === '' || scoreB.trim() === '' || Number.isNaN(parsedA) || Number.isNaN(parsedB)) {
      setError('Enter a valid score for both sides.');
      return;
    }
    if (parsedA < 0 || parsedB < 0) {
      setError('Scores cannot be negative.');
      return;
    }
    if (parsedA === parsedB) {
      setError('Knockout matches need a winner — scores cannot be tied.');
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
