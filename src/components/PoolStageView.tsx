import { useState, type FormEvent } from 'react';
import type { Pool, PoolMatch, Team } from '../types';
import { allPoolsComplete, isPoolComplete } from '../utils/poolsKnockout';
import { PoolLeaderboard } from './PoolLeaderboard';

interface PoolStageViewProps {
  teams: Team[];
  pools: Pool[];
  teamsAdvancingPerPool: number;
  knockoutStarted: boolean;
  onSetScore: (poolId: string, matchId: string, scoreA: number, scoreB: number) => void;
  onAdvanceToKnockout: () => void;
}

// Every pool, each showing its own match list (score entry for anything
// not yet scored) and its own live standings table underneath. All pool
// matches across all pools are generated up front (see
// usePoolsKnockout.startPoolStage), so there's no "current round" concept
// here — every match is independently scoreable at any time.
export function PoolStageView({
  teams,
  pools,
  teamsAdvancingPerPool,
  knockoutStarted,
  onSetScore,
  onAdvanceToKnockout,
}: PoolStageViewProps) {
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const allComplete = allPoolsComplete(pools);

  return (
    <>
      <section className="card">
        <div className="section-heading-row">
          <h2>Pool Stage</h2>
          {!knockoutStarted && (
            <button type="button" className="cta-button" onClick={onAdvanceToKnockout} disabled={!allComplete}>
              Advance to Knockout
            </button>
          )}
        </div>
        {!allComplete && !knockoutStarted && (
          <p className="hint">Complete every pool match before advancing to the knockout bracket.</p>
        )}
      </section>

      {pools.map((pool) => (
        <section key={pool.id} className="card">
          <h3>{pool.name}</h3>
          <div className="match-list">
            {pool.matches.map((match) => (
              <PoolMatchCard
                key={match.id}
                match={match}
                teamAName={teamNameById.get(match.teamAId) ?? 'Unknown team'}
                teamBName={teamNameById.get(match.teamBId) ?? 'Unknown team'}
                onSetScore={(scoreA, scoreB) => onSetScore(pool.id, match.id, scoreA, scoreB)}
              />
            ))}
          </div>
          <PoolLeaderboard pool={pool} teams={teams} teamsAdvancingPerPool={teamsAdvancingPerPool} poolComplete={isPoolComplete(pool)} />
        </section>
      ))}
    </>
  );
}

interface PoolMatchCardProps {
  match: PoolMatch;
  teamAName: string;
  teamBName: string;
  onSetScore: (scoreA: number, scoreB: number) => void;
}

function PoolMatchCard({ match, teamAName, teamBName, onSetScore }: PoolMatchCardProps) {
  const [scoreA, setScoreA] = useState(match.scoreA != null ? String(match.scoreA) : '');
  const [scoreB, setScoreB] = useState(match.scoreB != null ? String(match.scoreB) : '');
  const [error, setError] = useState<string | null>(null);

  const hasScore = match.scoreA != null && match.scoreB != null;
  const winner = hasScore && match.scoreA !== match.scoreB ? (match.scoreA! > match.scoreB! ? 'A' : 'B') : undefined;

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
    setError(null);
    onSetScore(parsedA, parsedB);
  }

  return (
    <form className="match-card" onSubmit={handleSubmit}>
      <div className="match-header">Court {match.court}</div>
      <div className="match-teams">
        <div className={winner === 'A' ? 'match-team winner' : 'match-team'}>
          <span className="match-team-name">{teamAName}</span>
          <input
            type="number"
            min={0}
            value={scoreA}
            onChange={(event) => setScoreA(event.target.value)}
            aria-label={`${teamAName} score`}
          />
        </div>
        <div className="match-vs">vs</div>
        <div className={winner === 'B' ? 'match-team winner' : 'match-team'}>
          <span className="match-team-name">{teamBName}</span>
          <input
            type="number"
            min={0}
            value={scoreB}
            onChange={(event) => setScoreB(event.target.value)}
            aria-label={`${teamBName} score`}
          />
        </div>
      </div>
      {error && <p className="hint error">{error}</p>}
      {winner && <p className="hint winner-hint">Winner: {winner === 'A' ? teamAName : teamBName}</p>}
      <button type="submit" className="secondary">
        Save Score
      </button>
    </form>
  );
}
