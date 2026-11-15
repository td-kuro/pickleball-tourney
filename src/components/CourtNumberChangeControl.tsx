import { useState } from 'react';
import { formatCourtList, sameCourtNumbers } from '../utils/courtNumbers';
import { CourtNumberPicker } from './CourtNumberPicker';

interface CourtNumberChangeControlProps {
  // The courts in use now.
  courtNumbers: number[];
  // Capacity check for a new court COUNT (e.g. enough players to fill an
  // extra court). Number-only changes always pass.
  checkCount?: (count: number) => { ok: true } | { ok: false; reason: string };
  // When set, the organiser is asked whether the change should also apply
  // to the round/cycle in progress — the text explains what that means for
  // this mode. Omit when the current round can't be changed.
  currentRoundQuestion?: (countChanged: boolean) => string | null;
  onApply: (courtNumbers: number[], applyToCurrent: boolean) => void;
  buttonLabel?: string;
}

// Mid-session Court Number Selection: pick the courts now in use, then
// Change Courts. Future rounds always use the new selection; the current
// round only changes when the organiser explicitly says so; completed
// rounds never change. Shared by Standard Social / Leaderboard, Dynamic
// Pairing Social and King Court.
export function CourtNumberChangeControl({ courtNumbers, checkCount, currentRoundQuestion, onApply, buttonLabel = 'Change Courts' }: CourtNumberChangeControlProps) {
  const [pending, setPending] = useState<number[]>(courtNumbers);
  const [basis, setBasis] = useState<number[]>(courtNumbers);
  // Re-sync when the saved selection changes elsewhere (no effect needed).
  if (!sameCourtNumbers(basis, courtNumbers)) {
    setBasis(courtNumbers);
    setPending(courtNumbers);
  }
  const unchanged = sameCourtNumbers(pending, courtNumbers);
  const countChanged = pending.length !== courtNumbers.length;
  const check = countChanged && checkCount ? checkCount(pending.length) : ({ ok: true } as const);

  function handleApply() {
    if (unchanged || !check.ok) return;
    const from = formatCourtList(courtNumbers);
    const to = formatCourtList(pending);
    const message = !countChanged
      ? `Change courts from ${from} to ${to}? Upcoming rounds will use the new courts.`
      : pending.length > courtNumbers.length
        ? `Change from ${courtNumbers.length} to ${pending.length} courts (${to})? This applies from the next round.`
        : `Change from ${courtNumbers.length} to ${pending.length} court${pending.length === 1 ? '' : 's'} (${to})? More players may sit out from the next round.`;
    if (!window.confirm(message)) {
      setPending(courtNumbers);
      return;
    }
    const question = currentRoundQuestion?.(countChanged) ?? null;
    const applyToCurrent = question !== null && window.confirm(question);
    onApply(pending, applyToCurrent);
  }

  return (
    <div className="form-row">
      <CourtNumberPicker value={pending} onChange={setPending} />
      <div className="session-controls-actions">
        <button type="button" className="secondary" onClick={handleApply} disabled={unchanged || !check.ok}>
          {buttonLabel}
        </button>
        <p className="hint">Applies from the next round by default; completed rounds keep the courts they were played on.</p>
      </div>
      {!check.ok && <p className="hint error">{check.reason}</p>}
    </div>
  );
}
