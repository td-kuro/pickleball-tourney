import { useState } from 'react';
import type { KingCourtCycle, Player, PlayerAvailabilityStatus } from '../types';
import { availabilityStatusLabel } from '../utils/tournament';
import { availableSubstitutes, isCurrentGameComplete } from '../utils/kingCourt';
import { KingCourtGameCard } from './KingCourtGameCard';
import { KingCourtMovementPreview } from './KingCourtMovementPreview';
import { PlayerActionMenu, type PlayerActionMenuReplacement } from './PlayerActionMenu';

interface KingCourtViewProps {
  players: Player[];
  numberOfCourts: number;
  currentCycle: KingCourtCycle;
  onSetGameScore: (courtNumber: number, gameNumber: number, team1Score: number, team2Score: number) => void;
  onAdvanceGame: () => void;
  onSetManualTiebreakOrder: (courtNumber: number, orderedPlayerIds: string[]) => void;
  onSetManualMovementOverride: (courtNumber: number, playerId: string, toCourt: number) => void;
  onConfirmMovement: () => void;
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onSubstitute: (courtNumber: number, outgoingId: string, incomingId: string) => void;
}

// The "King Court" tab: every court's current game side by side (all
// courts move through the same game number together — see the README's
// app-flow walkthrough), or the Movement Preview once a cycle's 5th game
// is complete everywhere. Every player name is clickable — see
// PlayerActionMenu — offering the same status actions and the existing
// per-court substitute mechanism (see KingCourtManageCourts' identical
// "Substitute a Player This Cycle" form) directly from the game card,
// rather than only from the Manage Courts / Players card below.
export function KingCourtView({
  players,
  numberOfCourts,
  currentCycle,
  onSetGameScore,
  onAdvanceGame,
  onSetManualTiebreakOrder,
  onSetManualMovementOverride,
  onConfirmMovement,
  onSetAvailability,
  onSubstitute,
}: KingCourtViewProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const selectedPlayer = selectedPlayerId ? playerById.get(selectedPlayerId) : undefined;

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
  const substitutePool = availableSubstitutes(players, currentCycle);

  function menuContextFor(playerId: string): { contextLines: string[]; replacement: PlayerActionMenuReplacement | undefined } {
    const court = currentCycle.courts.find((c) => c.playerIds.includes(playerId));
    if (!court) return { contextLines: [], replacement: undefined };
    const game = court.games.find((g) => g.gameNumber === currentCycle.currentGameNumber);
    const lines = [`Court ${court.courtNumber}`];
    if (!game) return { contextLines: lines, replacement: undefined };

    if (game.restingPlayerId === playerId) {
      lines.push(`Resting this game (Game ${game.gameNumber} of 5) — still on Court ${court.courtNumber} for the cycle.`);
      return { contextLines: lines, replacement: undefined };
    }

    const sideIds = game.team1PlayerIds.includes(playerId) ? game.team1PlayerIds : game.team2PlayerIds;
    const teammateId = sideIds.find((id) => id !== playerId);
    lines.push(`Playing Game ${game.gameNumber} of 5${teammateId ? ` with ${nameById.get(teammateId) ?? 'Unknown player'}` : ''}`);

    if (game.status === 'completed') {
      lines.push('This game already has a score — substitution only affects games not yet played this cycle.');
    }

    return {
      contextLines: lines,
      replacement: {
        label: 'Substitute a player',
        options: substitutePool.map((p) => ({ id: p.id, label: p.name })),
        onReplace: (incomingId: string) => {
          onSubstitute(court.courtNumber, playerId, incomingId);
          return { ok: true };
        },
      },
    };
  }

  return (
    <>
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
              onSelectPlayer={setSelectedPlayerId}
            />
          ))}
        </div>
      </section>

      {selectedPlayer && (
        <PlayerActionMenu
          player={selectedPlayer}
          statusLabel={availabilityStatusLabel}
          contextLines={menuContextFor(selectedPlayer.id).contextLines}
          replacement={menuContextFor(selectedPlayer.id).replacement}
          onSetStatus={(status) => onSetAvailability(selectedPlayer.id, status)}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}
    </>
  );
}
