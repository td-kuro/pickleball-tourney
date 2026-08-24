import { useState } from 'react';
import type { DynamicPairingRound, DynamicPairingTeam, Player, PlayerAvailabilityStatus } from '../types';
import { DynamicPairingAdminSkillReview } from './DynamicPairingAdminSkillReview';
import { DynamicPairingAllRounds } from './DynamicPairingAllRounds';
import { DynamicPairingCurrentRound } from './DynamicPairingCurrentRound';

type RoundsSubView = 'current' | 'all';

interface DynamicPairingRoundsPageProps {
  rounds: DynamicPairingRound[];
  currentRound: DynamicPairingRound | undefined;
  players: Player[];
  teams: DynamicPairingTeam[];
  awaitingSkillReview: boolean;
  onSetScore: (courtNumber: number, score1: number, score2: number) => void;
  onGenerateNextRound: () => void;
  onUpdateEntrantSkillLevel: (entrantId: string, skillLevel?: number) => void;
  onConfirmSkillReview: () => void;
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onSwap: (activePlayerId: string, restingPlayerId: string) => { ok: boolean; reason?: string };
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
  teams,
  awaitingSkillReview,
  onSetScore,
  onGenerateNextRound,
  onUpdateEntrantSkillLevel,
  onConfirmSkillReview,
  onSetAvailability,
  onSwap,
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
            teams={teams}
            rounds={rounds}
            onUpdateSkillLevel={onUpdateEntrantSkillLevel}
            onConfirm={onConfirmSkillReview}
          />
        ) : (
          <DynamicPairingCurrentRound
            round={currentRound}
            rounds={rounds}
            players={players}
            teams={teams}
            onSetScore={onSetScore}
            onGenerateNextRound={onGenerateNextRound}
            onSetAvailability={onSetAvailability}
            onSwap={onSwap}
          />
        )
      ) : (
        <DynamicPairingAllRounds rounds={rounds} players={players} />
      )}
    </>
  );
}
