import type { KingCourtCycle, Player } from '../types';
import { isCurrentGameComplete } from '../utils/kingCourt';
import { KingCourtGameCard } from './KingCourtGameCard';
import { KingCourtMovementPreview } from './KingCourtMovementPreview';

interface KingCourtViewProps {
  players: Player[];
  numberOfCourts: number;
  currentCycle: KingCourtCycle;
  onSetGameScore: (courtNumber: number, gameNumber: number, team1Score: number, team2Score: number) => void;
  onAdvanceGame: () => void;
  onSetManualTiebreakOrder: (courtNumber: number, orderedPlayerIds: string[]) => void;
  onSetManualMovementOverride: (courtNumber: number, playerId: string, toCourt: number) => void;
  onConfirmMovement: () => void;
}

// The "King Court" tab: every court's current game side by side (all
// courts move through the same game number together — see the README's
// app-flow walkthrough), or the Movement Preview once a cycle's 5th game
// is complete everywhere.
export function KingCourtView({
  players,
  numberOfCourts,
  currentCycle,
  onSetGameScore,
  onAdvanceGame,
  onSetManualTiebreakOrder,
  onSetManualMovementOverride,
  onConfirmMovement,
}: KingCourtViewProps) {
  const nameById = new Map(players.map((p) => [p.id, p.name]));

  if (currentCycle.status === 'awaiting-movement') {
    return (
      <KingCourtMovementPreview
        cycle={currentCycle}
        nameById={nameById}
        numberOfCourts={numberOfCourts}
        onSetManualTiebreakOrder={onSetManualTiebreakOrder}
        onSetManualMovementOverride={onSetManualMovementOverride}
        onConfirm={onConfirmMovement}
      />
    );
  }

  const allComplete = isCurrentGameComplete(currentCycle);
  const courts = [...currentCycle.courts].sort((a, b) => b.courtNumber - a.courtNumber);

  return (
    <section className="card">
      <div className="section-heading-row">
        <h2>
          Cycle {currentCycle.cycleNumber} — Game {currentCycle.currentGameNumber} of 5
        </h2>
        <button type="button" className="cta-button" onClick={onAdvanceGame} disabled={!allComplete}>
          {currentCycle.currentGameNumber < 5 ? 'Next Game' : 'Finish Cycle'}
        </button>
      </div>
      {!allComplete && <p className="hint">Enter scores for every court's current game to continue.</p>}

      <div className="match-list">
        {courts.map((court) => (
          <KingCourtGameCard
            key={`${currentCycle.cycleNumber}-${court.courtNumber}-${currentCycle.currentGameNumber}`}
            court={court}
            gameNumber={currentCycle.currentGameNumber}
            nameById={nameById}
            onSetScore={(team1Score, team2Score) =>
              onSetGameScore(court.courtNumber, currentCycle.currentGameNumber, team1Score, team2Score)
            }
          />
        ))}
      </div>
    </section>
  );
}
