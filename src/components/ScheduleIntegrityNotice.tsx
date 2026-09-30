import { useEffect } from 'react';
import type { ValidationResult } from '../utils/scheduleValidation';

interface ScheduleIntegrityNoticeProps {
  validation: ValidationResult;
  // Round number of the first saved upcoming round, when the current round
  // is missing and one exists to resume from.
  resumeRoundNumber?: number;
  onResume?: () => void;
}

// Shown above a Rounds tab only when the saved schedule fails
// validateCurrentRoundMatchesSchedule — renders nothing for a healthy
// schedule. Never changes anything itself: the saved schedule stays the
// source of truth, and the one recovery offered (resuming the first saved
// upcoming round) promotes a saved round rather than generating a new one.
export function ScheduleIntegrityNotice({ validation, resumeRoundNumber, onResume }: ScheduleIntegrityNoticeProps) {
  const issueKey = validation.issues.join('\n');

  useEffect(() => {
    if (issueKey) console.warn(`[PickleRounds] Saved schedule check failed:\n${issueKey}`);
  }, [issueKey]);

  if (validation.ok) return null;

  return (
    <div className="schedule-integrity-notice" role="alert">
      <strong>Saved schedule check</strong>
      <ul>
        {validation.issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      {onResume && resumeRoundNumber != null && (
        <button type="button" className="secondary" onClick={onResume}>
          Resume from saved Round {resumeRoundNumber}
        </button>
      )}
    </div>
  );
}
