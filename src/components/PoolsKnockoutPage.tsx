import { useState } from 'react';
import type {
  AddPlayerMidSessionResult,
  KnockoutBracket,
  MatchType,
  MidSessionJoinTiming,
  Pool,
  ResultSubmission,
  ScoreRecordingMode,
  Team,
  TournamentStage,
} from '../types';
import { AddPlayerMidSessionButton, type AddPlayerMidSessionFields } from './AddPlayerMidSessionModal';
import { KnockoutBracketView } from './KnockoutBracketView';
import { PoolStageView } from './PoolStageView';

type PoolsKnockoutSubView = 'pool' | 'knockout';

interface PoolsKnockoutPageProps {
  teams: Team[];
  pools: Pool[];
  bracket: KnockoutBracket | null;
  stage: TournamentStage;
  matchType: MatchType;
  teamsAdvancingPerPool: number;
  onSetPoolMatchResult: (poolId: string, matchId: string, result: ResultSubmission) => void;
  onAdvanceToKnockout: () => void;
  onSetKnockoutResult: (matchId: string, result: ResultSubmission) => void;
  onAddPlayerMidSession: (fields: AddPlayerMidSessionFields, joinTiming: MidSessionJoinTiming) => AddPlayerMidSessionResult;
  scoreRecordingMode: ScoreRecordingMode;
  unavailableTeamIds: string[];
  onSetTeamAvailability: (teamId: string, available: boolean) => void;
}

// Parent for the "Tournament" tab in Pools & Knockout: a Pool Stage /
// Knockout Bracket toggle, mirroring RoundsPage's Current Round / All
// Rounds toggle. Opens on whichever stage is actually active — this
// remounts (and the sub-view resets) each time the tab is re-entered, same
// as RoundsPage.
export function PoolsKnockoutPage({
  teams,
  pools,
  bracket,
  stage,
  matchType,
  teamsAdvancingPerPool,
  onSetPoolMatchResult,
  onAdvanceToKnockout,
  onSetKnockoutResult,
  onAddPlayerMidSession,
  scoreRecordingMode,
  unavailableTeamIds,
  onSetTeamAvailability,
}: PoolsKnockoutPageProps) {
  const unavailable = new Set(unavailableTeamIds);
  const [subView, setSubView] = useState<PoolsKnockoutSubView>(stage === 'pool-stage' ? 'pool' : 'knockout');

  // See canAddTeamMidSession in utils/poolsKnockout.ts for the stage rule
  // this mirrors, and addSinglesTeamMidSession in usePoolsKnockout.ts for
  // why Doubles is blocked here rather than in that shared function — a
  // lone new player can't form a complete 2-player team on its own.
  const addPlayerWarning =
    matchType === 'doubles'
      ? "Doubles needs a full team — add both players as a Fixed Team from Setup, then bring that team in once pool stage allows it. This action only supports Singles' one-player teams."
      : stage === 'knockout-stage' || stage === 'complete'
        ? 'Knockout stage has already started. Late joiners are not supported.'
        : stage === 'pool-stage'
          ? 'Pool stage has already started. Adding a new team schedules fresh matches against everyone already in its pool — existing matches are never changed.'
          : undefined;

  return (
    <>
      {stage !== 'setup' && (
        <section className="card">
          <h2>Session Controls</h2>
          {addPlayerWarning && <p className="hint error">{addPlayerWarning}</p>}
          {matchType === 'singles' && (
            <AddPlayerMidSessionButton
              onAdd={onAddPlayerMidSession}
              offerCurrentRoundJoin={false}
              showJoinTiming={false}
              disabled={stage === 'knockout-stage' || stage === 'complete'}
            />
          )}
        </section>
      )}

      {stage !== 'setup' && (
        <section className="card">
          <h2>{matchType === 'singles' ? 'Player' : 'Team'} Availability</h2>
          <p className="hint">
            {stage === 'pool-stage'
              ? 'Pools & Knockout uses a fixed round-robin schedule, so changing availability only reschedules unplayed pool matches if you confirm — matches with a result are never changed.'
              : 'Knockout bracket has started. Player availability changes will not automatically alter completed or active bracket matches.'}
          </p>
          <div className="player-list">
            {teams.map((team) => {
              const isUnavailable = unavailable.has(team.id);
              return (
                <div key={team.id} className="player-row availability-row">
                  <span className="player-row-name availability-row-name">{team.name}</span>
                  <span className={isUnavailable ? 'status-badge status-badge-danger' : 'status-badge'}>
                    {isUnavailable ? 'Unavailable' : 'Available'}
                  </span>
                  <div className="availability-actions">
                    <button type="button" className="secondary" onClick={() => onSetTeamAvailability(team.id, isUnavailable)}>
                      {isUnavailable ? 'Make available' : 'Mark unavailable'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="rounds-subnav">
        <div className="toggle-group rounds-toggle" role="group" aria-label="Tournament view">
          <button
            type="button"
            className={subView === 'pool' ? 'toggle-option active' : 'toggle-option'}
            onClick={() => setSubView('pool')}
          >
            Pool Stage
          </button>
          <button
            type="button"
            className={subView === 'knockout' ? 'toggle-option active' : 'toggle-option'}
            onClick={() => setSubView('knockout')}
            disabled={!bracket}
          >
            Knockout Bracket
          </button>
        </div>
      </div>

      {subView === 'pool' ? (
        <PoolStageView
          teams={teams}
          pools={pools}
          teamsAdvancingPerPool={teamsAdvancingPerPool}
          knockoutStarted={stage !== 'pool-stage'}
          onSetResult={onSetPoolMatchResult}
          onAdvanceToKnockout={onAdvanceToKnockout}
          scoreRecordingMode={scoreRecordingMode}
        />
      ) : (
        bracket && (
          <KnockoutBracketView
            bracket={bracket}
            teams={teams}
            onSetResult={onSetKnockoutResult}
            scoreRecordingMode={scoreRecordingMode}
            unavailableTeamIds={unavailableTeamIds}
          />
        )
      )}
    </>
  );
}
