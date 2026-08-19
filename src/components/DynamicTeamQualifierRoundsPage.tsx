import { useState } from 'react';
import type { DynamicTeam, DynamicTeamQualifierStage, MedalBracket, QualifyingRound, RestAssignment } from '../types';
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

  return (
    <>
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
