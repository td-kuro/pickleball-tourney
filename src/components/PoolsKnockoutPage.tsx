import { useState } from 'react';
import type { KnockoutBracket, Pool, Team, TournamentStage } from '../types';
import { KnockoutBracketView } from './KnockoutBracketView';
import { PoolStageView } from './PoolStageView';

type PoolsKnockoutSubView = 'pool' | 'knockout';

interface PoolsKnockoutPageProps {
  teams: Team[];
  pools: Pool[];
  bracket: KnockoutBracket | null;
  stage: TournamentStage;
  teamsAdvancingPerPool: number;
  onSetPoolMatchScore: (poolId: string, matchId: string, scoreA: number, scoreB: number) => void;
  onAdvanceToKnockout: () => void;
  onSetKnockoutScore: (matchId: string, scoreA: number, scoreB: number) => void;
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
  teamsAdvancingPerPool,
  onSetPoolMatchScore,
  onAdvanceToKnockout,
  onSetKnockoutScore,
}: PoolsKnockoutPageProps) {
  const [subView, setSubView] = useState<PoolsKnockoutSubView>(stage === 'pool-stage' ? 'pool' : 'knockout');

  return (
    <>
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
