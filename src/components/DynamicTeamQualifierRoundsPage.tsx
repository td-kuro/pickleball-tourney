import { useState } from 'react';
import type { DynamicTeam, DynamicTeamQualifierStage, MedalBracket, QualifyingRound, RestAssignment } from '../types';
import { canAddTeamMidSession } from '../utils/dynamicTeamQualifier';
import { DynamicTeamQualifierAllRounds } from './DynamicTeamQualifierAllRounds';
import { DynamicTeamQualifierCurrentRound } from './DynamicTeamQualifierCurrentRound';

type RoundsSubView = 'current' | 'all';

interface DynamicTeamQualifierRoundsPageProps {
  teams: DynamicTeam[];
  rounds: QualifyingRound[];
  restAssignments: RestAssignment[];
  medalBracket: MedalBracket | null;
  qualifyingRounds: number;
  stage: DynamicTeamQualifierStage;
  onSetScore: (matchId: string, result: { scoreA?: number; scoreB?: number; winnerId?: string; goldenPoint?: boolean; forfeit?: boolean }) => void;
  onCloseRound: () => void;
  onGenerateNextRound: () => { ok: true } | { ok: false; reason: string };
  onGenerateMedalBracket: () => void;
}

// Parent for Dynamic Team Qualifier's "Rounds" tab — a Current Round / All
// Rounds toggle, mirroring DynamicPairingRoundsPage's shape.
export function DynamicTeamQualifierRoundsPage({
  teams,
  rounds,
  restAssignments,
  medalBracket,
  qualifyingRounds,
  stage,
  onSetScore,
  onCloseRound,
  onGenerateNextRound,
  onGenerateMedalBracket,
}: DynamicTeamQualifierRoundsPageProps) {
  const [subView, setSubView] = useState<RoundsSubView>('current');
  // Always false here — this page only ever renders once qualifying has
  // started (see App.tsx), so canAddTeamMidSession's stage check always
  // fails; surfaced anyway so the "why" is visible without the organiser
  // having to go looking for a disabled action that doesn't exist yet. See
  // that function's comment for why no add-mid-qualifying flow is built.
  const addTeamCheck = canAddTeamMidSession(stage);

  return (
    <>
      {!addTeamCheck.ok && (
        <section className="card">
          <h2>Session Controls</h2>
          <p className="hint error">{addTeamCheck.reason}</p>
        </section>
      )}

      <div className="rounds-subnav">
        <div className="toggle-group rounds-toggle" role="group" aria-label="Rounds view">
          <button type="button" className={subView === 'current' ? 'toggle-option active' : 'toggle-option'} onClick={() => setSubView('current')}>
            Current Round
          </button>
          <button type="button" className={subView === 'all' ? 'toggle-option active' : 'toggle-option'} onClick={() => setSubView('all')}>
            All Rounds
          </button>
        </div>
      </div>

      {subView === 'current' ? (
        <DynamicTeamQualifierCurrentRound
          teams={teams}
          rounds={rounds}
          restAssignments={restAssignments}
          qualifyingRounds={qualifyingRounds}
          stage={stage}
          onSetScore={onSetScore}
          onCloseRound={onCloseRound}
          onGenerateNextRound={onGenerateNextRound}
          onGenerateMedalBracket={onGenerateMedalBracket}
          onViewAllRounds={() => setSubView('all')}
        />
      ) : (
        <DynamicTeamQualifierAllRounds teams={teams} rounds={rounds} medalBracket={medalBracket} />
      )}
    </>
  );
}
