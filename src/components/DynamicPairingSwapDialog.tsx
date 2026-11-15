import { courtLabel } from '../utils/courtNumbers';
import { useState } from 'react';
import type { DynamicPairingRound, Player } from '../types';
import { isPlayerAvailable, type DynamicPairingSwapPlan } from '../utils/dynamicPairingSocial';

export type SwapPreviewResult =
  | { ok: true; plan: DynamicPairingSwapPlan; upcomingConflicts: string[] }
  | { ok: false; reason: string };

export type SwapResult = { ok: true; summary: string } | { ok: false; reason: string };

interface DynamicPairingSwapDialogProps {
  round: DynamicPairingRound;
  players: Player[];
  // The player the organiser clicked first ("Player A").
  playerId: string;
  onPreview: (playerAId: string, playerBId: string) => SwapPreviewResult;
  onConfirm: (playerAId: string, playerBId: string, options: { refreshUpcoming: boolean }) => SwapResult;
  onClose: () => void;
}

// Step 2 of "click a name → Swap Player": choose who to swap with from any
// court or the rest list, see the line-up before and after, then confirm.
// Every rule (fixed teams move as a whole side, scored courts need their
// result reset first, ...) lives in planDynamicPairingSwap — a choice that
// isn't allowed simply shows its reason in the preview instead.
export function DynamicPairingSwapDialog({ round, players, playerId, onPreview, onConfirm, onClose }: DynamicPairingSwapDialogProps) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [refreshChoice, setRefreshChoice] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name || 'Unknown player';

  const scheduled = new Set([...round.courts.flatMap((c) => c.playerIds), ...round.restingPlayerIds]);
  const unscheduled = players.filter((p) => !scheduled.has(p.id) && isPlayerAvailable(p, round.roundNumber)).map((p) => p.id);
  const groups = [
    ...round.courts.map((court) => ({
      label: courtLabel(round.courtNumbers, court.courtNumber),
      ids: court.playerIds,
    })),
    { label: 'Resting', ids: round.restingPlayerIds },
    { label: 'Available, not scheduled', ids: unscheduled },
  ].filter((group) => group.ids.some((id) => id !== playerId));

  const preview = targetId ? onPreview(playerId, targetId) : null;
  const conflicts = preview?.ok ? preview.upcomingConflicts : [];
  // Refreshing upcoming rounds is offered (and pre-ticked) only when the
  // swap actually made the next saved round unfair for someone it moved.
  const refreshUpcoming = refreshChoice ?? conflicts.length > 0;

  function choose(id: string) {
    setTargetId(id);
    setRefreshChoice(null);
    setError(null);
  }

  function handleConfirm() {
    if (!targetId) return;
    const result = onConfirm(playerId, targetId, { refreshUpcoming: conflicts.length > 0 && refreshUpcoming });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    onClose();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Swap ${nameOf(playerId)}`}>
      <div className="modal-card card dp-swap-dialog">
        <div className="section-heading-row">
          <h2>Swap {nameOf(playerId)}</h2>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="hint">Choose who to swap with — any court, or the rest list.</p>

        {groups.map((group) => (
          <div key={group.label} className="dp-swap-group">
            <span className="dp-swap-group-label">{group.label}</span>
            <div className="dp-swap-options">
              {group.ids
                .filter((id) => id !== playerId)
                .map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={targetId === id ? 'toggle-option active' : 'toggle-option'}
                    aria-pressed={targetId === id}
                    onClick={() => choose(id)}
                  >
                    {nameOf(id)}
                  </button>
                ))}
            </div>
          </div>
        ))}

        {preview && !preview.ok && <p className="hint error">{preview.reason}</p>}
        {preview?.ok && (
          <div className="dp-swap-preview" aria-live="polite">
            <p className="dp-swap-summary">{preview.plan.summary}</p>
            <div className="dp-swap-preview-columns">
              <div>
                <span className="dp-swap-group-label">Before</span>
                {preview.plan.before.map((line) => (
                  <p key={line} className="hint">
                    {line}
                  </p>
                ))}
              </div>
              <div>
                <span className="dp-swap-group-label">After</span>
                {preview.plan.after.map((line) => (
                  <p key={line} className="hint">
                    {line}
                  </p>
                ))}
              </div>
            </div>
            {conflicts.length > 0 && (
              <div className="dp-swap-conflicts">
                <p className="hint error">The next saved round was planned before this swap:</p>
                <ul>
                  {conflicts.map((conflict) => (
                    <li key={conflict} className="hint">
                      {conflict}
                    </li>
                  ))}
                </ul>
                <label className="dp-swap-refresh">
                  <input type="checkbox" checked={refreshUpcoming} onChange={(event) => setRefreshChoice(event.target.checked)} />
                  Also refresh upcoming rounds to account for this swap
                </label>
              </div>
            )}
          </div>
        )}
        {error && <p className="hint error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="cta-button" onClick={handleConfirm} disabled={!preview?.ok}>
            Confirm Swap
          </button>
        </div>
      </div>
    </div>
  );
}
