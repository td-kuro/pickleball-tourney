import { useState } from 'react';
import type { DynamicPairingRound, Player } from '../types';
import { DynamicPairingAdminSkillReview } from './DynamicPairingAdminSkillReview';
import { DynamicPairingAllRounds } from './DynamicPairingAllRounds';
import { DynamicPairingCurrentRound } from './DynamicPairingCurrentRound';

type RoundsSubView = 'current' | 'all';

interface DynamicPairingRoundsPageProps {
  rounds: DynamicPairingRound[];
  currentRound: DynamicPairingRound | undefined;
  players: Player[];
  awaitingSkillReview: boolean;
  onSetScore: (courtNumber: number, score1: number, score2: number) => void;
  onGenerateNextRound: () => void;
  onUpdatePlayerSkillLevel: (id: string, skillLevel?: number) => void;
  onConfirmSkillReview: () => void;
}

// Parent for Dynamic Pairing Social's "Rounds" tab — a Current Round / All
// Rounds toggle, mirroring RoundsPage's shape for the standard rotating-
// round modes. While awaitingSkillReview is true (all pre-generated
// grading rounds played, Round 4 not generated yet — see
// isAwaitingSkillReview), the "Current Round" slot shows
// DynamicPairingAdminSkillReview instead — All Rounds keeps working
// exactly as normal throughout, since it doesn't depend on there being an
// active round.
export function DynamicPairingRoundsPage({
  rounds,
  currentRound,
  players,
  awaitingSkillReview,
  onSetScore,
  onGenerateNextRound,
  onUpdatePlayerSkillLevel,
  onConfirmSkillReview,
}: DynamicPairingRoundsPageProps) {
  const [subView, setSubView] = useState<RoundsSubView>('current');

  return (
    <>
      <div className="rounds-subnav">
        <div className="toggle-group rounds-toggle" role="group" aria-label="Rounds view">
          <button
            type="button"
            className={subView === 'current' ? 'toggle-option active' : 'toggle-option'}
            onClick={() => setSubView('current')}
          >
            Current Round
          </button>
          <button
            type="button"
            className={subView === 'all' ? 'toggle-option active' : 'toggle-option'}
            onClick={() => setSubView('all')}
          >
            All Rounds
          </button>
        </div>
      </div>

      {subView === 'current' ? (
        awaitingSkillReview ? (
          <DynamicPairingAdminSkillReview
            players={players}
            rounds={rounds}
            onUpdateSkillLevel={onUpdatePlayerSkillLevel}
            onConfirm={onConfirmSkillReview}
          />
        ) : (
          <DynamicPairingCurrentRound
            round={currentRound}
            rounds={rounds}
            players={players}
            onSetScore={onSetScore}
            onGenerateNextRound={onGenerateNextRound}
          />
        )
      ) : (
        <DynamicPairingAllRounds rounds={rounds} players={players} />
      )}
    </>
  );
}
