import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { KingCourtPlayerAssignment, Player } from '../types';
import { isCourtFull, validateKingCourtSeeding } from '../utils/kingCourt';

interface CourtSeedingProps {
  players: Player[];
  numberOfCourts: number;
  assignments: KingCourtPlayerAssignment[];
  onAssign: (playerId: string, courtNumber: number | null) => void;
  onReorderInCourt: (courtNumber: number, playerId: string, direction: -1 | 1) => void;
  onStartCycle1: () => void;
}

const CAPACITY = 5;

// Setup tab content, part 2: manually seed players into their starting
// courts before Cycle 1. Click-to-assign rather than dropdowns: click a
// player chip (Unassigned or already on a court) to select it, then click
// a court box — or one of its empty slots — to place them there. A
// selected chip clicked again, or the court it's already on, deselects.
// Court slot order mirrors `assignments`' own order for that court
// (assignPlayerToCourt appends on assign/move) — see reorderPlayerInCourt
// in useKingCourt and generateNextKingCourtCycle in utils/kingCourt.ts for
// why that order isn't just cosmetic.
export function CourtSeeding({
  players,
  numberOfCourts,
  assignments,
  onAssign,
  onReorderInCourt,
  onStartCycle1,
}: CourtSeedingProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerById = new Map(players.map((p) => [p.id, p]));
  const courtByPlayer = new Map(assignments.map((a) => [a.playerId, a.courtNumber]));
  // Strongest court first, matching the "Court 6 = strongest" convention.
  const courtNumbers = Array.from({ length: numberOfCourts }, (_, i) => numberOfCourts - i);
  const unassigned = players.filter((p) => !courtByPlayer.has(p.id));
  const seedingCheck = validateKingCourtSeeding(assignments, players, numberOfCourts);

  function togglePlayer(playerId: string) {
    setError(null);
    setSelectedPlayerId((current) => (current === playerId ? null : playerId));
  }

  function assignSelectedTo(courtNumber: number) {
    if (!selectedPlayerId) return;
    if (courtByPlayer.get(selectedPlayerId) === courtNumber) {
      setSelectedPlayerId(null);
      return;
    }
    if (isCourtFull(assignments, courtNumber, selectedPlayerId)) {
      setError('Court full. Each King Court court can only have 5 players.');
      return;
    }
    setError(null);
    onAssign(selectedPlayerId, courtNumber);
    setSelectedPlayerId(null);
  }

  function handleChipClick(event: MouseEvent, playerId: string) {
    event.stopPropagation();
    togglePlayer(playerId);
  }

  function handleRemove(event: MouseEvent, playerId: string) {
    event.stopPropagation();
    setError(null);
    onAssign(playerId, null);
    if (selectedPlayerId === playerId) setSelectedPlayerId(null);
  }

  function handleReorder(event: MouseEvent, courtNumber: number, playerId: string, direction: -1 | 1) {
    event.stopPropagation();
    onReorderInCourt(courtNumber, playerId, direction);
  }

  function handleEmptySlotClick(event: MouseEvent, courtNumber: number) {
    event.stopPropagation();
    assignSelectedTo(courtNumber);
  }

  function handleCourtKeyDown(event: KeyboardEvent, courtNumber: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      assignSelectedTo(courtNumber);
    }
  }

  return (
    <section className="card">
      <h2>Court Seeding</h2>
      <p className="hint">
        Click a player, then click a court to assign them — e.g. seed your strongest 5 players onto Court{' '}
        {numberOfCourts}. Every court needs exactly {CAPACITY} players before Cycle 1 can start.
      </p>

      {unassigned.length > 0 && (
        <div className="kc-unassigned">
          <p className="bulk-add-label">Unassigned ({unassigned.length})</p>
          <div className="kc-chip-row">
            {unassigned.map((player) => (
              <button
                key={player.id}
                type="button"
                className={selectedPlayerId === player.id ? 'kc-player-chip selected' : 'kc-player-chip'}
                onClick={(event) => handleChipClick(event, player.id)}
              >
                {player.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="hint error">{error}</p>}

      <div className="kc-court-grid">
        {courtNumbers.map((court) => {
          const courtPlayers = assignments
            .filter((a) => a.courtNumber === court)
            .map((a) => playerById.get(a.playerId))
            .filter((p): p is Player => p != null);
          const isFull = courtPlayers.length >= CAPACITY;

          return (
            <div
              key={court}
              className={isFull ? 'kc-court-card kc-court-card-full' : 'kc-court-card'}
              role="button"
              tabIndex={0}
              aria-label={`Assign selected player to Court ${court}`}
              onClick={() => assignSelectedTo(court)}
              onKeyDown={(event) => handleCourtKeyDown(event, court)}
            >
              <div className="kc-court-card-header">
                <h3>
                  Court {court}
                  {court === numberOfCourts ? ' — Strongest' : court === 1 ? ' — Weakest' : ''}
                </h3>
                <span className={isFull ? 'kc-court-count full' : 'kc-court-count'}>
                  {courtPlayers.length} / {CAPACITY} players
                </span>
              </div>

              <ul className="kc-court-slots">
                {Array.from({ length: CAPACITY }, (_, i) => courtPlayers[i]).map((player, index) => (
                  <li key={player?.id ?? index} className={player ? 'kc-court-slot filled' : 'kc-court-slot'}>
                    {player ? (
                      <>
                        <button
                          type="button"
                          className={selectedPlayerId === player.id ? 'kc-player-chip selected' : 'kc-player-chip'}
                          onClick={(event) => handleChipClick(event, player.id)}
                        >
                          {index + 1}. {player.name}
                        </button>
                        <div className="kc-court-slot-actions">
                          <button
                            type="button"
                            className="kc-reorder-button"
                            aria-label={`Move ${player.name} earlier in Court ${court}`}
                            onClick={(event) => handleReorder(event, court, player.id, -1)}
                            disabled={index === 0}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="kc-reorder-button"
                            aria-label={`Move ${player.name} later in Court ${court}`}
                            onClick={(event) => handleReorder(event, court, player.id, 1)}
                            disabled={index === courtPlayers.length - 1}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="kc-remove-button"
                            aria-label={`Remove ${player.name} from Court ${court}`}
                            onClick={(event) => handleRemove(event, player.id)}
                          >
                            ×
                          </button>
                        </div>
                      </>
                    ) : (
                      <button type="button" className="kc-court-slot-empty" onClick={(event) => handleEmptySlotClick(event, court)}>
                        Empty slot
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              <p className={isFull ? 'kc-court-status full' : 'kc-court-status'}>
                {isFull ? 'Full' : `Needs ${CAPACITY - courtPlayers.length} more`}
              </p>
            </div>
          );
        })}
      </div>

      {!seedingCheck.ok && <p className="hint error">{seedingCheck.reason}</p>}

      <button type="button" className="cta-button start-button" onClick={onStartCycle1} disabled={!seedingCheck.ok}>
        Start Cycle 1
      </button>
    </section>
  );
}
