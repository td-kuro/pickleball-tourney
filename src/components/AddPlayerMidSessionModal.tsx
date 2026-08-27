import { useState, type FormEvent } from 'react';
import type { AddPlayerMidSessionResult, MidSessionJoinTiming } from '../types';

export interface AddPlayerMidSessionFields {
  name: string;
  rating?: number;
  startingSeed?: number;
  note?: string;
}

interface AddPlayerMidSessionModalProps {
  onAdd: (fields: AddPlayerMidSessionFields, joinTiming: MidSessionJoinTiming) => AddPlayerMidSessionResult;
  onClose: () => void;
  // Whether "Join current round if possible" should even be offered — some
  // modes/stages structurally can't fold a new player into what's already
  // live (see each mode's own wiring of this modal) and just skip straight
  // to "Join from next round" / "Add as unavailable for now".
  offerCurrentRoundJoin: boolean;
  // "round" (Standard Social Play, Tournament Leaderboard, Dynamic Pairing
  // Social) or "cycle" (King Court) — used to phrase every message
  // consistently with the mode's own vocabulary.
  unitLabel?: string;
  // "bye list" (Standard Social Play/Tournament Leaderboard) or "resting
  // list" (Dynamic Pairing Social, which never says "bye") — see
  // dynamicPairingAvailabilityLabel's file comment on why that mode keeps
  // its own wording separate from utils/tournament.ts's.
  restingListLabel?: string;
  // A mode/stage-specific caveat shown above the form (e.g. Pools &
  // Knockout's "adding mid-pool-stage may require regenerating future pool
  // matches") — purely informational, doesn't block submission.
  warningMessage?: string;
  // False for a mode with no "current round" concept to join into at all
  // (Pools & Knockout's pool matches aren't scheduled into rounds — see
  // README) — hides the whole Join Timing section and always submits
  // 'next', which that mode's `onAdd` simply doesn't use. Default true.
  showJoinTiming?: boolean;
}

// Reusable "Add Player Mid-Session" action — see README's "Mid-session
// player additions". Deliberately mode-agnostic: every mode-specific
// decision (is a current-round join even possible right now, what "safely"
// means, how future rounds get regenerated) lives in that mode's own
// `onAdd` callback (see App.tsx's handleAddPlayerMidSession,
// useDynamicPairingSocial.addPlayerMidSession) — this component only
// collects the fields, submits once, and renders whatever
// AddPlayerMidSessionResult comes back.
export function AddPlayerMidSessionModal({
  onAdd,
  onClose,
  offerCurrentRoundJoin,
  unitLabel = 'round',
  restingListLabel = 'bye list',
  warningMessage,
  showJoinTiming = true,
}: AddPlayerMidSessionModalProps) {
  const [name, setName] = useState('');
  const [rating, setRating] = useState('');
  const [seed, setSeed] = useState('');
  const [note, setNote] = useState('');
  // Default "Join from next round" — see the design brief: joining live
  // mid-round is the exception, not the assumption, even when it turns out
  // to be safe.
  const [joinTiming, setJoinTiming] = useState<MidSessionJoinTiming>('next');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; caveat?: string } | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName === '') {
      setError('Enter a player name before adding.');
      return;
    }
    const parsedRating = rating.trim() === '' ? undefined : parseFloat(rating);
    const parsedSeed = seed.trim() === '' ? undefined : parseInt(seed, 10);
    const outcome = onAdd(
      {
        name: trimmedName,
        rating: parsedRating != null && !Number.isNaN(parsedRating) ? parsedRating : undefined,
        startingSeed: parsedSeed != null && !Number.isNaN(parsedSeed) ? parsedSeed : undefined,
        note: note.trim() === '' ? undefined : note.trim(),
      },
      showJoinTiming ? joinTiming : 'next',
    );

    if (!outcome.ok) {
      setError(outcome.reason ?? 'That player could not be added.');
      return;
    }

    setError(null);
    setResult({
      message: showJoinTiming ? successMessage(trimmedName, outcome, unitLabel, restingListLabel) : `${trimmedName} added.`,
      caveat: outcome.reason,
    });
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Add player mid-session">
      <div className="modal-card card">
        <div className="section-heading-row">
          <h2>Add Player Mid-Session</h2>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {warningMessage && <p className="hint error">{warningMessage}</p>}

        {result ? (
          <>
            <p className="hint winner-hint">{result.message}</p>
            {result.caveat && <p className="hint">{result.caveat}</p>}
            <div className="form-actions">
              <button type="button" className="cta-button" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label htmlFor="amp-name">Player name</label>
              <input id="amp-name" type="text" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </div>
            <div className="form-row">
              <label htmlFor="amp-rating">Rating (optional)</label>
              <input
                id="amp-rating"
                type="number"
                step="0.1"
                min="0"
                value={rating}
                onChange={(event) => setRating(event.target.value)}
                placeholder="Unrated"
              />
            </div>
            <div className="form-row">
              <label htmlFor="amp-seed">Seed (optional)</label>
              <input
                id="amp-seed"
                type="number"
                min={1}
                step={1}
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                placeholder="No seed"
              />
            </div>
            <div className="form-row">
              <label htmlFor="amp-note">Note (optional)</label>
              <input
                id="amp-note"
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. sub for Alex, showed up late"
              />
            </div>

            {showJoinTiming && (
              <div className="form-row">
                <span>Join timing</span>
                <div className="toggle-group" role="radiogroup" aria-label="Join timing">
                  {offerCurrentRoundJoin && (
                    <button
                      type="button"
                      className={joinTiming === 'current' ? 'toggle-option active' : 'toggle-option'}
                      onClick={() => setJoinTiming('current')}
                    >
                      Join current {unitLabel} if possible
                    </button>
                  )}
                  <button
                    type="button"
                    className={joinTiming === 'next' ? 'toggle-option active' : 'toggle-option'}
                    onClick={() => setJoinTiming('next')}
                  >
                    Join from next {unitLabel}
                  </button>
                  <button
                    type="button"
                    className={joinTiming === 'unavailable' ? 'toggle-option active' : 'toggle-option'}
                    onClick={() => setJoinTiming('unavailable')}
                  >
                    Add as unavailable for now
                  </button>
                </div>
                {joinTiming === 'current' && (
                  <p className="hint">
                    Only applied if the current {unitLabel} has no score entered yet — otherwise this player joins from
                    the next {unitLabel} instead.
                  </p>
                )}
              </div>
            )}

            {error && <p className="hint error">{error}</p>}

            <div className="form-actions">
              <button type="submit" className="cta-button">
                Confirm
              </button>
              <button type="button" className="secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

interface AddPlayerMidSessionButtonProps
  extends Pick<
    AddPlayerMidSessionModalProps,
    'onAdd' | 'offerCurrentRoundJoin' | 'unitLabel' | 'restingListLabel' | 'warningMessage' | 'showJoinTiming'
  > {
  label?: string;
  disabled?: boolean;
  disabledReason?: string;
}

// Thin stateful wrapper so every mode's "Add Player Mid-Session" entry
// point (Session Controls, Player Management, Current Round — see the
// design brief) is a one-line drop-in rather than each caller managing its
// own open/close state.
export function AddPlayerMidSessionButton({
  onAdd,
  offerCurrentRoundJoin,
  unitLabel,
  restingListLabel,
  warningMessage,
  showJoinTiming,
  label = 'Add Player Mid-Session',
  disabled,
  disabledReason,
}: AddPlayerMidSessionButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="secondary" onClick={() => setOpen(true)} disabled={disabled}>
        {label}
      </button>
      {disabled && disabledReason && <p className="hint error">{disabledReason}</p>}
      {open && (
        <AddPlayerMidSessionModal
          onAdd={onAdd}
          onClose={() => setOpen(false)}
          offerCurrentRoundJoin={offerCurrentRoundJoin}
          unitLabel={unitLabel}
          restingListLabel={restingListLabel}
          warningMessage={warningMessage}
          showJoinTiming={showJoinTiming}
        />
      )}
    </>
  );
}

function successMessage(
  name: string,
  outcome: AddPlayerMidSessionResult,
  unitLabel: string,
  restingListLabel: string,
): string {
  if (outcome.joinedCurrentRound) {
    return outcome.restingInCurrentRound
      ? `${name} added to the current ${unitLabel}'s ${restingListLabel}.`
      : `${name} added to the current ${unitLabel}.`;
  }
  if (outcome.effectiveFromRound != null) {
    return `${name} added. They will join from Round ${outcome.effectiveFromRound}.`;
  }
  return `${name} added as unavailable. Make them available from Player Management when they're ready to play.`;
}
