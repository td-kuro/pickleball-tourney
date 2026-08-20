import { useState } from 'react';
import type { KingCourtCycle, Player, PlayerAvailabilityStatus, SessionAdjustment } from '../types';
import { availabilityStatusLabel } from '../utils/tournament';
import { availableSubstitutes, playerHasRemainingGamesOnCourt } from '../utils/kingCourt';
import { PlayerAvailabilityControls } from './PlayerAvailabilityControls';

interface KingCourtManageCourtsProps {
  players: Player[];
  currentCycle: KingCourtCycle;
  sessionAdjustments: SessionAdjustment[];
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onSubstitute: (courtNumber: number, outgoingId: string, incomingId: string) => void;
  confirmError: string | null;
}

// King Court's "Manage Courts / Players" — deliberately the most manual of
// the three Social Play modes' mid-session controls, per the design brief:
// a cycle's 5-game rotation is fixed once generated, so this never
// reshuffles anything automatically. It only ever (1) marks availability,
// (2) warns when that leaves a real gap in games still being played this
// cycle, and (3) lets the organiser manually substitute a genuine
// replacement into that gap — see substitutePlayerInCycle in
// utils/kingCourt.ts. Court-count changes and any resulting "court doesn't
// have 5 players" problem show up here via confirmError (from
// useKingCourt.confirmMovementAndAdvance) — resolved with this panel and/or
// the existing per-player "move to court" override already in the Movement
// Preview UI.
export function KingCourtManageCourts({
  players,
  currentCycle,
  sessionAdjustments,
  onSetAvailability,
  onSubstitute,
  confirmError,
}: KingCourtManageCourtsProps) {
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const lastNotice = sessionAdjustments[sessionAdjustments.length - 1];

  const warnings = players
    .filter((p) => {
      const status = p.availabilityStatus ?? 'available';
      return status !== 'available' && status !== 'resting-this-round';
    })
    .flatMap((p) =>
      currentCycle.courts
        .filter((court) => playerHasRemainingGamesOnCourt(currentCycle, court.courtNumber, p.id))
        .map((court) => ({ player: p, courtNumber: court.courtNumber })),
    );

  const substitutes = availableSubstitutes(players, currentCycle);

  return (
    <>
      {confirmError && <p className="hint error">{confirmError}</p>}

      {lastNotice?.type === 'player-swapped' && !noticeDismissed && (
        <div className="session-adjustment-notice">
          <span className="hint">A player substitution was made this cycle.</span>
          <button type="button" className="secondary" onClick={() => setNoticeDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="card">
        <h2>Manage Courts / Players</h2>
        {warnings.length > 0 && (
          <div className="hint error">
            {warnings.map(({ player, courtNumber }) => (
              <p key={`${player.id}-${courtNumber}`}>
                Court {courtNumber} — {player.name} is marked {availabilityStatusLabel(player.availabilityStatus ?? 'available')} but
                still has games left this cycle. Substitute a replacement below, or resolve manually.
              </p>
            ))}
          </div>
        )}

        <SubstituteForm cycle={currentCycle} nameById={nameById} substitutes={substitutes} onSubstitute={onSubstitute} />
      </section>

      <PlayerAvailabilityControls players={players} onSetStatus={onSetAvailability} statusLabel={availabilityStatusLabel} />
    </>
  );
}

interface SubstituteFormProps {
  cycle: KingCourtCycle;
  nameById: Map<string, string>;
  substitutes: Player[];
  onSubstitute: (courtNumber: number, outgoingId: string, incomingId: string) => void;
}

function SubstituteForm({ cycle, nameById, substitutes, onSubstitute }: SubstituteFormProps) {
  const courts = [...cycle.courts].sort((a, b) => a.courtNumber - b.courtNumber);
  const [courtNumber, setCourtNumber] = useState(courts[0]?.courtNumber ?? 1);
  const currentCourt = courts.find((c) => c.courtNumber === courtNumber);
  const [outgoingId, setOutgoingId] = useState(currentCourt?.playerIds[0] ?? '');
  const [incomingId, setIncomingId] = useState(substitutes[0]?.id ?? '');

  function handleCourtChange(next: number) {
    setCourtNumber(next);
    const nextCourt = courts.find((c) => c.courtNumber === next);
    setOutgoingId(nextCourt?.playerIds[0] ?? '');
  }

  function handleSubstitute() {
    if (!outgoingId || !incomingId) return;
    onSubstitute(courtNumber, outgoingId, incomingId);
  }

  return (
    <div className="form-row">
      <span>Substitute a Player This Cycle</span>
      {substitutes.length === 0 ? (
        <p className="hint">
          No available replacement in the roster right now — every player is already on a court, or marked
          unavailable. If no replacement exists, resolve manually (e.g. play the court short-handed, or use the
          Movement Preview's per-player court override once this cycle finishes).
        </p>
      ) : (
        <>
          <div className="timing-grid">
            <label className="timing-field">
              Court
              <select value={courtNumber} onChange={(event) => handleCourtChange(Number(event.target.value))}>
                {courts.map((court) => (
                  <option key={court.courtNumber} value={court.courtNumber}>
                    Court {court.courtNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="timing-field">
              Outgoing player
              <select value={outgoingId} onChange={(event) => setOutgoingId(event.target.value)}>
                {(currentCourt?.playerIds ?? []).map((id) => (
                  <option key={id} value={id}>
                    {nameById.get(id) ?? 'Unknown player'}
                  </option>
                ))}
              </select>
            </label>
            <label className="timing-field">
              Incoming player
              <select value={incomingId} onChange={(event) => setIncomingId(event.target.value)}>
                {substitutes.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={handleSubstitute}>
              Substitute
            </button>
          </div>
        </>
      )}
    </div>
  );
}
