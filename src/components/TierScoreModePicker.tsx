import type { TierScoreMode } from '../types';
import { scoreModeLabel } from '../utils/tierSession';

const SCORE_MODES: { mode: TierScoreMode; hint: string }[] = [
  { mode: 'win-loss-only', hint: 'Tap the winning side — quickest between rounds.' },
  { mode: 'full-score', hint: 'Enter both scores; tracks points for/against and differential.' },
  { mode: 'none', hint: 'No results — rotation only, no winner.' },
];

export function TierScoreModePicker({ value, onChange, disabled }: { value: TierScoreMode; onChange: (mode: TierScoreMode) => void; disabled?: boolean }) {
  return (
    <div className="form-row">
      <span>Score Recording</span>
      <div className="toggle-group" role="group" aria-label="Score recording">
        {SCORE_MODES.map(({ mode }) => (
          <button
            key={mode}
            type="button"
            className={value === mode ? 'toggle-option active toggle-option-green' : 'toggle-option'}
            onClick={() => onChange(mode)}
            disabled={disabled}
            aria-pressed={value === mode}
          >
            {scoreModeLabel(mode)}
          </button>
        ))}
      </div>
      <p className="hint">{SCORE_MODES.find((m) => m.mode === value)?.hint} Scores never affect tiers or who plays whom.</p>
    </div>
  );
}
