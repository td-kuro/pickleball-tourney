import { useState, type FormEvent } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { DEFAULT_VENUE_COURTS, formatCourtList, MAX_COURT_NUMBER, parseCourtNumber, toggleCourtNumber } from '../utils/courtNumbers';

interface CourtNumberPickerProps {
  // Selected physical court numbers, sorted.
  value: number[];
  onChange: (courtNumbers: number[]) => void;
  label?: string;
  disabled?: boolean;
}

// The venue's numbered courts shared across modes — how many numbered
// buttons to offer (1..N). Only grows; selections live in each mode.
const VENUE_KEY = 'pickleball-tourney:venueCourtCount';

// Court Number Selection: tap the physical courts in use (any combination,
// e.g. 3 and 6). The active court count is simply how many are selected.
// "Add Court Number" covers venues with more than six courts.
export function CourtNumberPicker({ value, onChange, label = 'Courts in Use', disabled }: CourtNumberPickerProps) {
  const [venueSize, setVenueSize] = useLocalStorage<number>(VENUE_KEY, DEFAULT_VENUE_COURTS);
  const [adding, setAdding] = useState('');
  const [error, setError] = useState<string | null>(null);
  const highest = Math.max(DEFAULT_VENUE_COURTS, typeof venueSize === 'number' ? venueSize : 0, ...value);
  const buttons = Array.from({ length: highest }, (_, i) => i + 1);

  function toggle(n: number) {
    const next = toggleCourtNumber(value, n);
    if (!next) {
      setError('At least one court must stay selected.');
      return;
    }
    setError(null);
    onChange(next);
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    const n = parseCourtNumber(adding);
    if (n === null) {
      setError(`Enter a whole court number from 1 to ${MAX_COURT_NUMBER}.`);
      return;
    }
    if (value.includes(n)) {
      setError(`Court ${n} is already selected.`);
      return;
    }
    setError(null);
    setAdding('');
    if (n > highest) setVenueSize(n);
    onChange([...value, n].sort((a, b) => a - b));
  }

  return (
    <div className="form-row court-number-picker">
      <span>{label}</span>
      <div className="court-selector-buttons" role="group" aria-label={label}>
        {buttons.map((n) => (
          <button
            key={n}
            type="button"
            className={value.includes(n) ? 'court-btn active' : 'court-btn'}
            onClick={() => toggle(n)}
            disabled={disabled}
            aria-pressed={value.includes(n)}
            aria-label={`Court ${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      {!disabled && (
        <form className="court-number-add" onSubmit={handleAdd} noValidate>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_COURT_NUMBER}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="Court no."
            aria-label="Court number to add"
            className="court-selector-other-input"
          />
          <button type="submit" className="secondary">
            Add Court Number
          </button>
        </form>
      )}
      <p className="hint court-number-summary">
        <strong>Active Courts: {value.length}</strong> · Selected: {formatCourtList(value)}
      </p>
      {error && <p className="hint error">{error}</p>}
    </div>
  );
}
