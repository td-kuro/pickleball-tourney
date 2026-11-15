import { useState, type FormEvent } from 'react';
import type { TierMatch, TierScoreMode } from '../types';
import { describeResult, MAX_GAME_SCORE, type ResultInput } from '../utils/tierLeaderboard';
import type { TierResult } from '../utils/tierSession';

interface TierResultEntryProps {
  match: TierMatch;
  scoreMode: TierScoreMode;
  nameOf: (id: string) => string;
  // Completed rounds are locked: editing needs the explicit "Correct
  // result" step first.
  locked: boolean;
  onRecord: (input: ResultInput, correction: boolean) => TierResult;
  onClear: (correction: boolean) => TierResult;
}

// Result entry inside a court card. Win/Loss: one tap on the winning side.
// Full Score: two number fields and Save. A recorded result shows as text
// with Change / Clear; on a locked round, Correct Result opens the editor
// after a confirmation.
export function TierResultEntry({ match, scoreMode, nameOf, locked, onRecord, onClear }: TierResultEntryProps) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoreA, setScoreA] = useState(match.result?.scoreA?.toString() ?? '');
  const [scoreB, setScoreB] = useState(match.result?.scoreB?.toString() ?? '');
  const team = (ids: readonly string[]) => ids.map(nameOf).join(' / ');
  const result = match.result;
  const correction = locked;

  if (scoreMode === 'none' && !result) return null;

  function apply(r: TierResult) {
    setError(r.ok ? null : r.reason);
    if (r.ok) setEditing(false);
  }

  const showEditor = scoreMode !== 'none' && (!result ? !locked : editing);

  if (!showEditor) {
    return (
      <div className={result ? 'tier-result tier-result-recorded' : 'tier-result tier-result-missing'}>
        <span className="tier-result-text">{result ? describeResult(match, nameOf) : 'No result recorded'}</span>
        {scoreMode !== 'none' && (
          <span className="tier-result-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (locked && !window.confirm('This round is completed. Correct its result? Standings will be recalculated.')) return;
                setScoreA(result?.scoreA?.toString() ?? '');
                setScoreB(result?.scoreB?.toString() ?? '');
                setEditing(true);
              }}
            >
              {locked ? 'Correct Result' : 'Change'}
            </button>
            {result && !locked && (
              <button type="button" className="secondary" onClick={() => apply(onClear(false))}>
                Clear
              </button>
            )}
          </span>
        )}
        {error && <p className="hint error">{error}</p>}
      </div>
    );
  }

  if (scoreMode === 'win-loss-only') {
    return (
      <div className="tier-result tier-result-editor">
        <span className="tier-result-label">Who won?</span>
        <div className="tier-winner-buttons">
          {(['A', 'B'] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={result?.winner === side ? 'tier-winner-button selected' : 'tier-winner-button'}
              onClick={() => apply(onRecord({ winner: side }, correction))}
            >
              {team(side === 'A' ? match.teamAPlayerIds : match.teamBPlayerIds)}
            </button>
          ))}
        </div>
        {editing && (
          <span className="tier-result-actions">
            {result && correction && (
              <button type="button" className="secondary" onClick={() => window.confirm('Remove this result?') && apply(onClear(true))}>
                Remove Result
              </button>
            )}
            <button type="button" className="secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </span>
        )}
        {error && <p className="hint error">{error}</p>}
      </div>
    );
  }

  function handleSave(event: FormEvent) {
    event.preventDefault();
    const parse = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : Number.NaN);
    const input: ResultInput = { scoreA: parse(scoreA), scoreB: parse(scoreB) };
    apply(onRecord(input, correction));
  }

  return (
    // noValidate: the app's own checks (and messages) apply, instead of the
    // browser silently blocking Save with a tooltip.
    <form className="tier-result tier-result-editor" onSubmit={handleSave} noValidate>
      <div className="tier-score-grid">
        {(['A', 'B'] as const).map((side) => (
          <label key={side} className="tier-score-row">
            <span>{team(side === 'A' ? match.teamAPlayerIds : match.teamBPlayerIds)}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_GAME_SCORE}
              step={1}
              value={side === 'A' ? scoreA : scoreB}
              onChange={(e) => (side === 'A' ? setScoreA : setScoreB)(e.target.value)}
              aria-label={`Score for ${team(side === 'A' ? match.teamAPlayerIds : match.teamBPlayerIds)}`}
            />
          </label>
        ))}
      </div>
      <span className="tier-result-actions">
        <button type="submit" className="cta-button">
          Save Result
        </button>
        {editing && (
          <>
            {result && correction && (
              <button type="button" className="secondary" onClick={() => window.confirm('Remove this result?') && apply(onClear(true))}>
                Remove Result
              </button>
            )}
            <button type="button" className="secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        )}
      </span>
      {error && <p className="hint error">{error}</p>}
    </form>
  );
}
