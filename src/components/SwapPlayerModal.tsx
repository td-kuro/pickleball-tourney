import { useState } from 'react';

interface SwapOption {
  id: string;
  label: string;
}

interface SwapPlayerModalProps {
  activeOptions: SwapOption[];
  byeOptions: SwapOption[];
  onSwap: (activePlayerId: string, byePlayerId: string) => { ok: boolean; reason?: string };
  onClose: () => void;
}

// Swap an active player (currently assigned to a match this round) with a
// bye/resting player — see canSwapPlayerInRound in utils/tournament.ts for
// the full rule set this enforces (only the current round, only before a
// score is submitted, never a fixed team). A single small control rather
// than a "Swap" button scattered onto every player name in every match
// card, per the design brief's "don't overload the match cards".
export function SwapPlayerModal({ activeOptions, byeOptions, onSwap, onClose }: SwapPlayerModalProps) {
  const [activeId, setActiveId] = useState(activeOptions[0]?.id ?? '');
  const [byeId, setByeId] = useState(byeOptions[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmedMessage, setConfirmedMessage] = useState<string | null>(null);

  const activeLabel = activeOptions.find((o) => o.id === activeId)?.label ?? '';
  const byeLabel = byeOptions.find((o) => o.id === byeId)?.label ?? '';

  function handleSwap() {
    if (!activeId || !byeId) {
      setError('Choose a player on court and a player on bye.');
      return;
    }
    const result = onSwap(activeId, byeId);
    if (!result.ok) {
      setError(result.reason ?? 'That swap is not allowed.');
      setConfirmedMessage(null);
      return;
    }
    setError(null);
    setConfirmedMessage(`${activeLabel} has been swapped with ${byeLabel} for this round.`);
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Swap player">
      <div className="modal-card card">
        <div className="section-heading-row">
          <h2>Swap Player</h2>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="hint">
          Swap a player currently on court with a player on bye this round — allowed only before that match's score
          is submitted.
        </p>

        {activeOptions.length === 0 || byeOptions.length === 0 ? (
          <p className="empty-state">
            {activeOptions.length === 0
              ? 'No players currently on court are eligible to be swapped.'
              : 'No players are on bye this round to swap in.'}
          </p>
        ) : (
          <>
            <div className="form-row">
              <label htmlFor="swap-active">Player on court</label>
              <select
                id="swap-active"
                value={activeId}
                onChange={(event) => {
                  setActiveId(event.target.value);
                  setConfirmedMessage(null);
                }}
              >
                {activeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="swap-bye">Player on bye</label>
              <select
                id="swap-bye"
                value={byeId}
                onChange={(event) => {
                  setByeId(event.target.value);
                  setConfirmedMessage(null);
                }}
              >
                {byeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="hint error">{error}</p>}
            {confirmedMessage && <p className="hint winner-hint">{confirmedMessage}</p>}

            <div className="form-actions">
              <button type="button" className="cta-button" onClick={handleSwap}>
                Swap
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
