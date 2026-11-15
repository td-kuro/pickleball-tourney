import { useState } from 'react';
import type {
  AddPlayerMidSessionResult,
  KingCourtCycle,
  KingCourtPlayerAssignment,
  MidSessionJoinTiming,
  Player,
  PlayerAvailabilityStatus,
  ResultSubmission,
  ScoreRecordingMode,
  SessionAdjustment,
} from '../types';
import type { AddPlayerMidSessionFields } from './AddPlayerMidSessionModal';
import { KingCourtAllRoundsView } from './KingCourtAllRoundsView';
import { KingCourtManageCourts } from './KingCourtManageCourts';
import { KingCourtView } from './KingCourtView';

type KingCourtRoundsSubView = 'current' | 'all';

interface KingCourtRoundsPageProps {
  players: Player[];
  numberOfCourts: number;
  // Physical courts in use (by position) — see utils/courtNumbers.ts.
  courtNumbers: number[];
  onChangeCourtNumbers: (courtNumbers: number[], applyToCurrent: boolean) => void;
  cycles: KingCourtCycle[];
  currentCycle: KingCourtCycle;
  sessionAdjustments: SessionAdjustment[];
  nextCycleStaging: KingCourtPlayerAssignment[];
  confirmError: string | null;
  onSetGameResult: (courtNumber: number, gameNumber: number, result: ResultSubmission) => void;
  scoreRecordingMode: ScoreRecordingMode;
  onAdvanceGame: () => void;
  onSetManualTiebreakOrder: (courtNumber: number, orderedPlayerIds: string[]) => void;
  onSetManualMovementOverride: (courtNumber: number, playerId: string, toCourt: number) => void;
  onConfirmMovement: () => void;
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onSubstitute: (courtNumber: number, outgoingId: string, incomingId: string) => void;
  onStageForNextCycle: (playerId: string, courtNumber: number | null) => void;
  onAddPlayerMidSession: (fields: AddPlayerMidSessionFields, joinTiming: MidSessionJoinTiming) => AddPlayerMidSessionResult;
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
  courtNumbers,
  onChangeCourtNumbers,
  cycles,
  currentCycle,
  sessionAdjustments,
  nextCycleStaging,
  confirmError,
  onSetGameResult,
  scoreRecordingMode,
  onAdvanceGame,
  onSetManualTiebreakOrder,
  onSetManualMovementOverride,
  onConfirmMovement,
  onSetAvailability,
  onSubstitute,
  onStageForNextCycle,
  onAddPlayerMidSession,
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
            courtNumbers={courtNumbers}
            currentCycle={currentCycle}
            onSetGameResult={onSetGameResult}
            scoreRecordingMode={scoreRecordingMode}
            onAdvanceGame={onAdvanceGame}
            onSetManualTiebreakOrder={onSetManualTiebreakOrder}
            onSetManualMovementOverride={onSetManualMovementOverride}
            onConfirmMovement={onConfirmMovement}
            onSetAvailability={onSetAvailability}
            onSubstitute={onSubstitute}
          />
          <KingCourtManageCourts
            players={players}
            currentCycle={currentCycle}
            numberOfCourts={numberOfCourts}
            courtNumbers={courtNumbers}
            onChangeCourtNumbers={onChangeCourtNumbers}
            sessionAdjustments={sessionAdjustments}
            nextCycleStaging={nextCycleStaging}
            onSetAvailability={onSetAvailability}
            onSubstitute={onSubstitute}
            onStageForNextCycle={onStageForNextCycle}
            onAddPlayerMidSession={onAddPlayerMidSession}
            confirmError={confirmError}
          />
        </>
      ) : (
        <KingCourtAllRoundsView players={players} cycles={cycles} />
      )}
    </>
  );
}
