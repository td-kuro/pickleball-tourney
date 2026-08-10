import { useId, useState, type ChangeEvent } from 'react';
import { generateCourtOptions, validateCourtCount } from '../utils/tournament';

interface CourtSelectorProps {
  value: number;
  onChange: (courts: number) => void;
  label?: string;
  disabled?: boolean;
}

const PRESET_COURTS = generateCourtOptions();

// Clickable court-count picker: buttons for 1–6 (large tap targets — see
// .court-btn in App.css), plus an "Other" button that reveals a validated
// number input for anything beyond 6. Used anywhere "Number of Courts" is
// configured — Social Play/Tournament setup (TournamentSetup) and King
// Court setup (KingCourtSetup) — so the court count stays a single concept
// (a plain number on TournamentSettings/KingCourt state) with one shared
// picker UI, rather than a separate input per screen.
export function CourtSelector({ value, onChange, label = 'Number of Courts', disabled }: CourtSelectorProps) {
  const id = useId();
  const isPreset = PRESET_COURTS.includes(value);
  // "Other" mode is sticky once chosen (even if the typed value happens to
  // match a preset, e.g. typing "3" then continuing to "30") so the input
  // doesn't disappear out from under the organiser mid-edit.
  const [showOther, setShowOther] = useState(!isPreset);
  const [otherValue, setOtherValue] = useState(isPreset ? '' : String(value));
  const [error, setError] = useState<string | null>(null);

  function selectPreset(n: number) {
    setShowOther(false);
    setError(null);
    onChange(n);
  }

  function selectOther() {
    setShowOther(true);
    setOtherValue(String(value));
    setError(null);
  }

  function handleOtherChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    setOtherValue(raw);
    const parsed = parseInt(raw, 10);
    const check = validateCourtCount(parsed);
    if (!check.ok) {
      setError(raw.trim() === '' ? null : check.reason);
      return;
    }
    setError(null);
    onChange(parsed);
  }

  return (
    <div className="form-row">
      <span>{label}</span>
      <div className="court-selector-buttons" role="group" aria-label={label}>
        {PRESET_COURTS.map((n) => (
          <button
            key={n}
            type="button"
            className={!showOther && value === n ? 'court-btn active' : 'court-btn'}
            onClick={() => selectPreset(n)}
            disabled={disabled}
          >
            {n}
          </button>
        ))}
        <button type="button" className={showOther ? 'court-btn active' : 'court-btn'} onClick={selectOther} disabled={disabled}>
          Other
        </button>
      </div>
      {showOther && (
        <input
          id={`${id}-other`}
          type="number"
          min={1}
          value={otherValue}
          onChange={handleOtherChange}
          placeholder="Enter number of courts"
          aria-label="Custom number of courts"
          disabled={disabled}
          className="court-selector-other-input"
        />
      )}
      {error && <p className="hint error">{error}</p>}
    </div>
  );
}
