import type { Pool, PoolMatch, ResultSubmission, ScoreRecordingMode, Team } from '../types';
import { allPoolsComplete, isPoolComplete, poolMatchWinnerId } from '../utils/poolsKnockout';
import { POINT_DIFFERENTIAL_UNAVAILABLE_NOTE, SCORE_NOT_RECORDED, scoreRecordingModeLabel } from '../utils/results';
import { MatchResultEntry } from './MatchResultEntry';
import { PoolLeaderboard } from './PoolLeaderboard';

interface PoolStageViewProps {
  teams: Team[];
  pools: Pool[];
  teamsAdvancingPerPool: number;
  knockoutStarted: boolean;
  onSetResult: (poolId: string, matchId: string, result: ResultSubmission) => void;
  onAdvanceToKnockout: () => void;
  scoreRecordingMode: ScoreRecordingMode;
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
  onSetResult,
  onAdvanceToKnockout,
  scoreRecordingMode,
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
        <p className="hint">Scoring: {scoreRecordingModeLabel(scoreRecordingMode)}</p>
        {scoreRecordingMode === 'win-loss-only' && (
          <p className="hint">{POINT_DIFFERENTIAL_UNAVAILABLE_NOTE} Standings rank by wins, then head-to-head.</p>
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
                scoreMode={scoreRecordingMode}
                onSetResult={(result) => onSetResult(pool.id, match.id, result)}
              />
            ))}
          </div>
          <PoolLeaderboard
            pool={pool}
            teams={teams}
            teamsAdvancingPerPool={teamsAdvancingPerPool}
            poolComplete={isPoolComplete(pool)}
            scoreRecordingMode={scoreRecordingMode}
          />
        </section>
      ))}
    </>
  );
}

interface PoolMatchCardProps {
  match: PoolMatch;
  teamAName: string;
  teamBName: string;
  scoreMode: ScoreRecordingMode;
  onSetResult: (result: ResultSubmission) => void;
}

// Every pool match stays independently editable (there's no "current
// round" to lock behind) — so the entry form is always shown, pre-filled
// with whatever was recorded. A match skipped because a team became
// unavailable (see usePoolsKnockout.setTeamAvailability) has no entry at
// all until it's restored.
function PoolMatchCard({ match, teamAName, teamBName, scoreMode, onSetResult }: PoolMatchCardProps) {
  const winnerId = poolMatchWinnerId(match);
  const winner = winnerId === match.teamAId ? 'A' : winnerId === match.teamBId ? 'B' : undefined;

  return (
    <div className="match-card">
      <div className="match-header">Court {match.court}</div>
      <div className="match-teams">
        <div className={winner === 'A' ? 'match-team winner' : 'match-team'}>
          <span className="match-team-name">{teamAName}</span>
        </div>
        <div className="match-vs">vs</div>
        <div className={winner === 'B' ? 'match-team winner' : 'match-team'}>
          <span className="match-team-name">{teamBName}</span>
        </div>
      </div>
      {match.skipped ? (
        <p className="hint">Skipped — a team is unavailable. Restored automatically if they return and you confirm.</p>
      ) : (
        <>
          <MatchResultEntry
            mode={scoreMode}
            sideALabel={teamAName}
            sideBLabel={teamBName}
            initialScoreA={match.scoreA}
            initialScoreB={match.scoreB}
            currentWinner={winner}
            allowTie
            onSubmit={onSetResult}
          />
          {winner && (
            <p className="hint winner-hint">
              Winner: {winner === 'A' ? teamAName : teamBName}
              {match.scoreA == null ? ` · ${SCORE_NOT_RECORDED}` : ''}
            </p>
          )}
        </>
      )}
    </div>
  );
}
