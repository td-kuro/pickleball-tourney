import { useState } from 'react';
import type { Player, PlayerAvailabilityStatus } from '../types';
import { DESTRUCTIVE_CONFIRMATIONS, STATUS_BADGE_CLASS } from './playerStatusPresentation';

export interface ReplacementOption {
  id: string;
  label: string;
}

export interface PlayerActionMenuReplacement {
  // "Swap with bye player" (Standard/Dynamic Pairing Social) or
  // "Substitute a player" (King Court) — same underlying idea, different
  // name per mode's own vocabulary.
  label: string;
  options: ReplacementOption[];
  onReplace: (replacementId: string) => { ok: boolean; reason?: string };
  // Set when a replacement would be valid in principle but isn't right now
  // (e.g. the match already has a score) — shown instead of the option
  // list, so the organiser knows *why* rather than just seeing it vanish.
  disabledReason?: string;
}

interface PlayerActionMenuProps {
  player: Player;
  statusLabel: (status: PlayerAvailabilityStatus) => string;
  // Freeform context lines shown under the player's name — court number,
  // partner/teammate, "Playing this round" / "Resting this round", etc.
  // Computed by the caller since what's relevant differs per mode.
  contextLines: string[];
  onSetStatus: (status: PlayerAvailabilityStatus) => void;
  onClose: () => void;
  // Omitted entirely (no section rendered) when a swap/substitute isn't
  // relevant right now — e.g. the player is already resting, or there's no
  // live round/cycle.
  replacement?: PlayerActionMenuReplacement;
}

// Clicking a player's name anywhere in a live Current Round (Standard
// Social Play, Dynamic Pairing Social, King Court) opens this — a single
// small action menu with only the actions that make sense for that
// player's current state (see the `status !==` guards below, mirroring
// PlayerAvailabilityControls), rather than a separate "manage players"
// section the organiser has to scroll to. Every action here just calls
// back into the same onSetStatus/onReplace handlers those other controls
// already use — no new status/swap logic lives in this component.
export function PlayerActionMenu({ player, statusLabel, contextLines, onSetStatus, onClose, replacement }: PlayerActionMenuProps) {
  const [replacementId, setReplacementId] = useState(replacement?.options[0]?.id ?? '');
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replaceDone, setReplaceDone] = useState<string | null>(null);

  const status = player.availabilityStatus ?? 'available';

  function handleSetStatus(nextStatus: PlayerAvailabilityStatus) {
    const confirmMessage = DESTRUCTIVE_CONFIRMATIONS[nextStatus]?.(player.name);
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    onSetStatus(nextStatus);
    onClose();
  }

  function handleReplace() {
    if (!replacement || !replacementId) return;
    const chosenLabel = replacement.options.find((option) => option.id === replacementId)?.label ?? 'that player';
    const result = replacement.onReplace(replacementId);
    if (!result.ok) {
      setReplaceError(result.reason ?? 'That change is not allowed.');
      return;
    }
    setReplaceError(null);
    setReplaceDone(`${player.name} has been swapped with ${chosenLabel} for this round.`);
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`${player.name} actions`}>
      <div className="modal-card card">
        <div className="section-heading-row">
          <h2>{player.name}</h2>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <span className={STATUS_BADGE_CLASS[status]}>{statusLabel(status)}</span>
        {contextLines.map((line) => (
          <p key={line} className="hint player-action-context">
            {line}
          </p>
        ))}

        {/* Rendered unconditionally (not inside the `replacement &&` block
            below) — a successful swap changes this player's context (they're
            no longer active, so `replacement` recomputes to undefined on
            the next render), which would otherwise make the confirmation
            disappear before the organiser ever sees it. */}
        {replaceDone && <p className="hint winner-hint">{replaceDone}</p>}

        {replacement && !replaceDone && (
          <div className="form-row">
            <span>{replacement.label}</span>
            {replacement.disabledReason ? (
              <p className="hint error">{replacement.disabledReason}</p>
            ) : replacement.options.length === 0 ? (
              <p className="hint error">
                No available replacement right now. This can't continue unless another player is made available.
              </p>
            ) : (
              <>
                <select value={replacementId} onChange={(event) => setReplacementId(event.target.value)}>
                  {replacement.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {replaceError && <p className="hint error">{replaceError}</p>}
                <div className="form-actions">
                  <button type="button" className="cta-button" onClick={handleReplace}>
                    Confirm
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="player-action-list">
          {status !== 'available' && (
            <button type="button" className="secondary" onClick={() => handleSetStatus('available')}>
              Make available
            </button>
          )}
          {status !== 'resting-this-round' && (
            <button type="button" className="secondary" onClick={() => handleSetStatus('resting-this-round')}>
              Rest this round
            </button>
          )}
          {status !== 'late' && (
            <button type="button" className="secondary" onClick={() => handleSetStatus('late')}>
              Mark late
            </button>
          )}
          {status !== 'unavailable' && (
            <button type="button" className="secondary" onClick={() => handleSetStatus('unavailable')}>
              Mark unavailable
            </button>
          )}
          {status !== 'left-early' && (
            <button type="button" className="danger" onClick={() => handleSetStatus('left-early')}>
              Mark left early
            </button>
          )}
          {status !== 'injured' && (
            <button type="button" className="danger" onClick={() => handleSetStatus('injured')}>
              Mark injured
            </button>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
