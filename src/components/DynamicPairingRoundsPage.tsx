import { useState } from 'react';
import type { DynamicPairingRound, Player } from '../types';
import { DynamicPairingAllRounds } from './DynamicPairingAllRounds';
import { DynamicPairingCurrentRound } from './DynamicPairingCurrentRound';

type RoundsSubView = 'current' | 'all';

interface DynamicPairingRoundsPageProps {
  rounds: DynamicPairingRound[];
  currentRound: DynamicPairingRound | undefined;
  players: Player[];
  onSetScore: (courtNumber: number, score1: number, score2: number) => void;
  onGenerateNextRound: () => void;
}

// Parent for Dynamic Pairing Social's "Rounds" tab — a Current Round / All
// Rounds toggle, mirroring RoundsPage's shape for the standard rotating-
// round modes.
export function DynamicPairingRoundsPage({
  rounds,
  currentRound,
  players,
  onSetScore,
  onGenerateNextRound,
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
        <DynamicPairingCurrentRound
          round={currentRound}
          players={players}
          onSetScore={onSetScore}
          onGenerateNextRound={onGenerateNextRound}
        />
      ) : (
        <DynamicPairingAllRounds rounds={rounds} players={players} />
      )}
    </>
  );
}
