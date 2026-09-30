import type { ScoreRecordingMode } from '../types';
import { SCORE_RECORDING_MODES, scoreRecordingModeLabel } from '../utils/results';

interface ScoreRecordingSelectorProps {
  value: ScoreRecordingMode;
  onChange: (mode: ScoreRecordingMode) => void;
  // Shown (and required via window.confirm) before switching *to* Win/Loss
  // only — e.g. Dynamic Team Qualifier, whose official tiebreaks use point
  // differential. The change is cancelled if the organiser declines.
  winLossConfirmation?: string;
  idPrefix: string;
}

// The "Score Recording" setting, shared by every mode's setup screen — see
// ScoreRecordingMode. Deliberately never disabled once a session has
// started: both result shapes stay valid side by side (see utils/results.ts),
// so switching mid-session only changes how *new* results are entered.
export function ScoreRecordingSelector({ value, onChange, winLossConfirmation, idPrefix }: ScoreRecordingSelectorProps) {
  function select(mode: ScoreRecordingMode) {
    if (mode === value) return;
    if (mode === 'win-loss-only' && winLossConfirmation && !window.confirm(`${winLossConfirmation} Continue?`)) return;
    onChange(mode);
  }

  return (
    <div className="form-row">
      <span id={`${idPrefix}-score-recording-label`}>Score Recording</span>
      <div className="toggle-group" role="group" aria-labelledby={`${idPrefix}-score-recording-label`}>
        {SCORE_RECORDING_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            className={value === mode ? 'toggle-option active' : 'toggle-option'}
            onClick={() => select(mode)}
          >
            {scoreRecordingModeLabel(mode)}
          </button>
        ))}
      </div>
      <p className="hint">
        {value === 'win-loss-only'
          ? 'Just tap who won — no scores needed, so transitions between games are faster. Points For/Against and point differential are not available in this mode.'
          : 'Enter both scores for every result. Tracks points and point differential as well as wins and losses.'}
      </p>
      {winLossConfirmation && <p className="hint">{winLossConfirmation}</p>}
    </div>
  );
}
