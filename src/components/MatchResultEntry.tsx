import { useState, type FormEvent } from 'react';
import type { ResultSubmission, ScoreRecordingMode } from '../types';
import { SCORE_NOT_RECORDED } from '../utils/results';

interface MatchResultEntryProps {
  mode: ScoreRecordingMode;
  sideALabel: string;
  sideBLabel: string;
  initialScoreA?: number;
  initialScoreB?: number;
  // The recorded winner, however it was recorded (derived from scores or
  // explicit) — highlights the matching button in Win/Loss only mode.
  currentWinner?: 'A' | 'B';
  // Completed/locked result: read-only summary instead of inputs.
  locked?: boolean;
  // Full-score mode only: whether a tied score is accepted (Standard Social
  // Play/Tournament Leaderboard allow it; every mode that needs a winner
  // to advance a bracket or ranking doesn't).
  allowTie?: boolean;
  onSubmit: (result: ResultSubmission) => void;
}

// Reusable result entry for every mode's match/court/game card — see
// ScoreRecordingMode. Full score: two score inputs and a Save button (winner
// derived by the caller from the scores). Win/Loss only: a "Who won?" pair
// of buttons that records the result in one tap — no score inputs at all,
// so nothing is ever required that the organiser isn't tracking.
export function MatchResultEntry({
  mode,
  sideALabel,
  sideBLabel,
  initialScoreA,
  initialScoreB,
  currentWinner,
  locked = false,
  allowTie = false,
  onSubmit,
}: MatchResultEntryProps) {
  const [scoreA, setScoreA] = useState(initialScoreA != null ? String(initialScoreA) : '');
  const [scoreB, setScoreB] = useState(initialScoreB != null ? String(initialScoreB) : '');
  const [error, setError] = useState<string | null>(null);
  const hasScore = initialScoreA != null && initialScoreB != null;

  if (locked) {
    if (currentWinner == null && !hasScore) return <p className="hint">No result recorded.</p>;
    const winnerLabel = currentWinner === 'A' ? sideALabel : currentWinner === 'B' ? sideBLabel : null;
    return (
      <p className="hint winner-hint">
        {winnerLabel ? `Winner: ${winnerLabel}` : 'Tied'}
        {hasScore ? ` · ${initialScoreA}–${initialScoreB}` : ` · ${SCORE_NOT_RECORDED}`}
      </p>
    );
  }

  if (mode === 'win-loss-only') {
    return (
      <div className="match-result-entry">
        <span className="match-result-entry-label">Who won?</span>
        <div className="toggle-group" role="group" aria-label="Who won?">
          {(['A', 'B'] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={currentWinner === side ? 'toggle-option active' : 'toggle-option'}
              aria-pressed={currentWinner === side}
              onClick={() => onSubmit({ kind: 'winner', winner: side })}
            >
              {side === 'A' ? sideALabel : sideBLabel}
            </button>
          ))}
        </div>
        {hasScore && <p className="hint">Recorded earlier with a full score ({initialScoreA}–{initialScoreB}).</p>}
      </div>
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedA = Number(scoreA);
    const parsedB = Number(scoreB);
    if (scoreA.trim() === '' || scoreB.trim() === '' || Number.isNaN(parsedA) || Number.isNaN(parsedB)) {
      setError('Enter a valid score for both sides.');
      return;
    }
    if (parsedA < 0 || parsedB < 0) {
      setError('Scores cannot be negative.');
      return;
    }
    if (!allowTie && parsedA === parsedB) {
      setError('Scores cannot be tied — one side must win.');
      return;
    }
    setError(null);
    onSubmit({ kind: 'score', scoreA: parsedA, scoreB: parsedB });
  }

  return (
    <form className="match-result-entry" onSubmit={handleSubmit}>
      <div className="match-result-entry-scores">
        <label>
          <span>{sideALabel}</span>
          <input type="number" min={0} value={scoreA} onChange={(event) => setScoreA(event.target.value)} aria-label={`${sideALabel} score`} />
        </label>
        <span className="match-vs">–</span>
        <label>
          <span>{sideBLabel}</span>
          <input type="number" min={0} value={scoreB} onChange={(event) => setScoreB(event.target.value)} aria-label={`${sideBLabel} score`} />
        </label>
      </div>
      {error && <p className="hint error">{error}</p>}
      <button type="submit" className="secondary">
        Save Score
      </button>
    </form>
  );
}
