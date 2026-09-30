// Mode-agnostic helpers for the Score Recording setting (see
// ScoreRecordingMode in ../types.ts). A deliberately tiny leaf module with
// no imports beyond types, so every mode's own logic file can use it
// without coupling to any other mode — including the ones that are
// otherwise kept fully self-contained (utils/dynamicPairingSocial.ts,
// utils/dynamicTeamQualifier.ts).
//
// The one rule every mode follows: a result is either a full score (both
// scores present; the winner is derived from them) or a Win/Loss-only
// result (an explicit winner, no scores). Both are valid in the same
// session, so switching the setting mid-session never invalidates results
// already recorded.

import type { ScoreRecordingMode } from '../types';

export const DEFAULT_SCORE_RECORDING_MODE: ScoreRecordingMode = 'full-score';

export const SCORE_RECORDING_MODES: ScoreRecordingMode[] = ['full-score', 'win-loss-only'];

export function scoreRecordingModeLabel(mode: ScoreRecordingMode): string {
  return mode === 'win-loss-only' ? 'Win/Loss only' : 'Full score';
}

// Backfill for settings saved before this setting existed.
export function normalizeScoreRecordingMode(value: ScoreRecordingMode | undefined): ScoreRecordingMode {
  return value === 'win-loss-only' ? 'win-loss-only' : DEFAULT_SCORE_RECORDING_MODE;
}

export function hasFullScore(scoreA: number | undefined | null, scoreB: number | undefined | null): boolean {
  return scoreA != null && scoreB != null;
}

// The winner of a two-sided result, whichever way it was recorded. Scores
// take precedence when present (a tied score has no winner); otherwise the
// explicitly recorded winner, if any.
export function resolveWinner<S>(
  scoreA: number | undefined | null,
  scoreB: number | undefined | null,
  explicitWinner: S | undefined,
  sideA: S,
  sideB: S,
): S | undefined {
  if (scoreA != null && scoreB != null) {
    if (scoreA === scoreB) return undefined;
    return scoreA > scoreB ? sideA : sideB;
  }
  return explicitWinner;
}

// True if a result of either kind has been recorded.
export function hasAnyResult(scoreA: number | undefined | null, scoreB: number | undefined | null, explicitWinner: unknown): boolean {
  return hasFullScore(scoreA, scoreB) || explicitWinner != null;
}

// A result with a winner but no scores — never render it as "0-0".
export function isWinLossOnlyResult(
  scoreA: number | undefined | null,
  scoreB: number | undefined | null,
  explicitWinner: unknown,
): boolean {
  return !hasFullScore(scoreA, scoreB) && explicitWinner != null;
}

export const SCORE_NOT_RECORDED = 'Score not recorded';
export const WIN_LOSS_ENABLED_MESSAGE = 'Win/Loss only mode enabled. Scores will not be required.';
export const FULL_SCORE_ENABLED_MESSAGE = 'Full score mode enabled. Enter both scores for each result.';
export const POINT_STATS_UNAVAILABLE_NOTE =
  'Point stats are unavailable because this session is using win/loss only scoring.';
export const POINT_DIFFERENTIAL_UNAVAILABLE_NOTE = 'Point differential is not available in Win/Loss only mode.';
export const DTQ_WIN_LOSS_WARNING =
  'This format normally uses point differential. Win/loss only may reduce tiebreak accuracy.';

// One-line result summary for every All Rounds / history view:
// "Thai / Alex beat Ben / Sarah 11–7", "Thai / Alex beat Ben / Sarah ·
// Score not recorded" (never a fake "0–0"), or "... tied ... 5–5".
// Returns null when no result has been recorded.
export function describeResult(
  labelA: string,
  labelB: string,
  scoreA: number | undefined | null,
  scoreB: number | undefined | null,
  winner: 'A' | 'B' | undefined,
): string | null {
  const scored = hasFullScore(scoreA, scoreB);
  if (!scored && winner == null) return null;
  if (winner == null) return `${labelA} tied ${labelB} ${scoreA}–${scoreB}`;
  const [winnerLabel, loserLabel] = winner === 'A' ? [labelA, labelB] : [labelB, labelA];
  if (!scored) return `${winnerLabel} beat ${loserLabel} · ${SCORE_NOT_RECORDED}`;
  const [winnerScore, loserScore] = winner === 'A' ? [scoreA, scoreB] : [scoreB, scoreA];
  return `${winnerLabel} beat ${loserLabel} ${winnerScore}–${loserScore}`;
}

export function scoreModeChangedMessage(mode: ScoreRecordingMode): string {
  return mode === 'win-loss-only' ? WIN_LOSS_ENABLED_MESSAGE : FULL_SCORE_ENABLED_MESSAGE;
}
