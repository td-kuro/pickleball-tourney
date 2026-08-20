import { useState } from 'react';
import type { KingCourtCycle, Player, PlayerAvailabilityStatus, SessionAdjustment } from '../types';
import { KingCourtAllRoundsView } from './KingCourtAllRoundsView';
import { KingCourtManageCourts } from './KingCourtManageCourts';
import { KingCourtView } from './KingCourtView';

type KingCourtRoundsSubView = 'current' | 'all';

interface KingCourtRoundsPageProps {
  players: Player[];
  numberOfCourts: number;
  cycles: KingCourtCycle[];
  currentCycle: KingCourtCycle;
  sessionAdjustments: SessionAdjustment[];
  confirmError: string | null;
  onSetGameScore: (courtNumber: number, gameNumber: number, team1Score: number, team2Score: number) => void;
  onAdvanceGame: () => void;
  onSetManualTiebreakOrder: (courtNumber: number, orderedPlayerIds: string[]) => void;
  onSetManualMovementOverride: (courtNumber: number, playerId: string, toCourt: number) => void;
  onConfirmMovement: () => void;
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onSubstitute: (courtNumber: number, outgoingId: string, incomingId: string) => void;
  onChangeCourts: (newCourts: number) => void;
}

// Parent for King Court's "Rounds" tab: a Current Round / All Rounds
// toggle above either the live cycle (KingCourtView, unchanged — score
// entry and the Movement Preview both stay there) or the full
// game-by-game history across every cycle generated so far
// (KingCourtAllRoundsView). Mirrors RoundsPage's Social Play/Tournament
// equivalent. Always opens on Current Round, same rationale as RoundsPage
// — App.tsx only renders this while the Rounds tab is selected.
export function KingCourtRoundsPage({
  players,
  numberOfCourts,
  cycles,
  currentCycle,
  sessionAdjustments,
  confirmError,
  onSetGameScore,
  onAdvanceGame,
  onSetManualTiebreakOrder,
  onSetManualMovementOverride,
  onConfirmMovement,
  onSetAvailability,
  onSubstitute,
  onChangeCourts,
}: KingCourtRoundsPageProps) {
  const [subView, setSubView] = useState<KingCourtRoundsSubView>('current');

  return (
    <>
      <div className="rounds-subnav">
        <div className="toggle-group rounds-toggle" role="group" aria-label="King Court rounds view">
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
        <>
          <KingCourtView
            players={players}
            numberOfCourts={numberOfCourts}
            currentCycle={currentCycle}
            onSetGameScore={onSetGameScore}
            onAdvanceGame={onAdvanceGame}
            onSetManualTiebreakOrder={onSetManualTiebreakOrder}
            onSetManualMovementOverride={onSetManualMovementOverride}
            onConfirmMovement={onConfirmMovement}
          />
          <KingCourtManageCourts
            players={players}
            currentCycle={currentCycle}
            numberOfCourts={numberOfCourts}
            sessionAdjustments={sessionAdjustments}
            onSetAvailability={onSetAvailability}
            onSubstitute={onSubstitute}
            onChangeCourts={onChangeCourts}
            confirmError={confirmError}
          />
        </>
      ) : (
        <KingCourtAllRoundsView players={players} cycles={cycles} />
      )}
    </>
  );
}
