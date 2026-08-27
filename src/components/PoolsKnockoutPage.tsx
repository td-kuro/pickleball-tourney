import { useState } from 'react';
import type { AddPlayerMidSessionResult, KnockoutBracket, MatchType, MidSessionJoinTiming, Pool, Team, TournamentStage } from '../types';
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
  onSetPoolMatchScore: (poolId: string, matchId: string, scoreA: number, scoreB: number) => void;
  onAdvanceToKnockout: () => void;
  onSetKnockoutScore: (matchId: string, scoreA: number, scoreB: number) => void;
  onAddPlayerMidSession: (fields: AddPlayerMidSessionFields, joinTiming: MidSessionJoinTiming) => AddPlayerMidSessionResult;
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
  onSetPoolMatchScore,
  onAdvanceToKnockout,
  onSetKnockoutScore,
  onAddPlayerMidSession,
}: PoolsKnockoutPageProps) {
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
          onSetScore={onSetPoolMatchScore}
          onAdvanceToKnockout={onAdvanceToKnockout}
        />
      ) : (
        bracket && <KnockoutBracketView bracket={bracket} teams={teams} onSetScore={onSetKnockoutScore} />
      )}
    </>
  );
}
