// Mode-agnostic helpers for mid-session availability changes. Each mode
// keeps its own round-regeneration logic (see useTournament's
// regenerateFutureRounds, useDynamicPairingSocial's setAvailabilityStatus,
// useKingCourt's confirmMovementAndAdvance, ...) — this module only owns
// the pieces that must behave identically everywhere: which statuses count
// as "away", the user-facing messages, the session-adjustment event type,
// and the returning-player bye/rest normalisation. A leaf module with no
// imports beyond types, so every mode can use it without coupling to any
// other mode's logic file.

import type { Player, PlayerAvailabilityStatus, SessionAdjustmentType } from '../types';

export function statusOf(player: Player): PlayerAvailabilityStatus {
  return player.availabilityStatus ?? 'available';
}

// Late / Unavailable / Injured / Left Early — out until the organiser
// explicitly makes them available again (unlike 'resting-this-round',
// which auto-reverts, or 'new-joiner', which activates on its own).
export function isAwayStatus(status: PlayerAvailabilityStatus): boolean {
  return status === 'late' || status === 'unavailable' || status === 'injured' || status === 'left-early';
}

export function availabilityAdjustmentType(status: PlayerAvailabilityStatus): SessionAdjustmentType {
  return status === 'available' ? 'player-marked-available' : 'player-marked-unavailable';
}

// "Thai is now available. Future rounds have been updated." /
// "Thai has been marked unavailable. Future rounds have been updated."
// `outcome` lets a stricter mode (King Court, Pools & Knockout, Dynamic
// Team Qualifier) say what actually happened instead of claiming rounds
// were regenerated.
export function availabilityChangeMessage(
  name: string,
  status: PlayerAvailabilityStatus,
  statusLabel: string,
  outcome = 'Future rounds have been updated.',
): string {
  if (status === 'available') return `${name} is now available. ${outcome}`;
  if (status === 'resting-this-round') return `${name} is resting this round. ${outcome}`;
  return `${name} has been marked ${statusLabel.toLowerCase()}. ${outcome}`;
}

export function currentRoundHasResultMessage(name: string): string {
  return `Current round already has a result. ${name} will be removed from future rounds only.`;
}

// Late-player fairness. Byes/rests are always *derived* from rounds that
// actually happened, so a player who missed rounds while late/unavailable
// has fewer recorded byes than everyone else — and every fair-bye engine in
// this app sends the next bye to whoever has the fewest. Without this, a
// late arrival would be benched round after round until they "caught up".
//
// For every player who has just become 'available' (their status in
// `prev` was anything else, or they didn't exist in `prev` at all), raise
// their `byeCountAdjustment` so their effective count (recorded +
// adjustment) equals the current minimum effective count among the other
// available players. Never lowers an existing adjustment, and never
// touches recorded stats — Games/W/L/points stay exactly as played, only
// the bye-selection input is normalised. `recordedByes` should count
// byes/rests from rounds actually reached (not pre-generated upcoming
// ones).
export function normalizeReturningByeAdjustments(
  prev: Player[],
  next: Player[],
  recordedByes: (playerId: string) => number,
): Player[] {
  const prevStatusById = new Map(prev.map((p) => [p.id, statusOf(p)]));
  const returning = next.filter((p) => statusOf(p) === 'available' && prevStatusById.get(p.id) !== 'available');
  if (returning.length === 0) return next;

  const returningIds = new Set(returning.map((p) => p.id));
  const others = next.filter((p) => statusOf(p) === 'available' && !returningIds.has(p.id));
  if (others.length === 0) return next;
  const minEffective = Math.min(...others.map((p) => recordedByes(p.id) + (p.byeCountAdjustment ?? 0)));

  let changed = false;
  const result = next.map((p) => {
    if (!returningIds.has(p.id)) return p;
    const needed = Math.max(p.byeCountAdjustment ?? 0, minEffective - recordedByes(p.id));
    if (needed === (p.byeCountAdjustment ?? 0)) return p;
    changed = true;
    return { ...p, byeCountAdjustment: needed };
  });
  return changed ? result : next;
}

// Effective bye count for a fixed pair (a fixed team rests as one unit):
// the larger of its two members' adjustments, so normalising either member
// is enough to stop the team being over-rested.
export function teamByeAdjustment(memberIds: string[], playersById: Map<string, Player>): number {
  return Math.max(0, ...memberIds.map((id) => playersById.get(id)?.byeCountAdjustment ?? 0));
}
