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

// 'resting-this-round' only ever covers the current round — it reverts to
// 'available' automatically the moment the round ends — so every *future*
// round is generated treating it as 'available'. That's what keeps a saved
// future round valid when it later becomes current: nothing has to be
// regenerated on advance just because a rest expired.
export function statusForFutureRounds(status: PlayerAvailabilityStatus): PlayerAvailabilityStatus {
  return status === 'resting-this-round' ? 'available' : status;
}

// The roster as future-round generation should see it — see
// statusForFutureRounds. Returns the same array when nobody is resting.
export function playersForFutureRounds<P extends Player>(players: P[]): P[] {
  if (!players.some((p) => p.availabilityStatus === 'resting-this-round')) return players;
  return players.map((p) =>
    p.availabilityStatus === 'resting-this-round' ? { ...p, availabilityStatus: 'available' as const } : p,
  );
}

// Whether a status change can alter any future round at all. Resting this
// round <-> available doesn't, so the saved future schedule is kept exactly
// as shown in All Rounds instead of being reshuffled for no reason.
export function changeAffectsFutureRounds(oldStatus: PlayerAvailabilityStatus, newStatus: PlayerAvailabilityStatus): boolean {
  return statusForFutureRounds(oldStatus) !== statusForFutureRounds(newStatus);
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
//
// `teammatesOf` (Dynamic Pairing Social's fixed teams) leaves out of that
// minimum anyone who couldn't actually have played: the returning player's
// own teammates, and any player whose fixed-team partner is still away. A
// fixed team only plays when complete, so those players' counts are just as
// stale — comparing against them let a team return under-rested and absorb
// the next several rests.
export interface NormalizeReturningOptions {
  teammatesOf?: (playerId: string) => string[];
  // The last round a returning player missed — recorded as
  // Player.lastAbsentRound (see lastByeRoundWithAbsence).
  absentThroughRound?: number;
}

export function normalizeReturningByeAdjustments(
  prev: Player[],
  next: Player[],
  recordedByes: (playerId: string) => number,
  { teammatesOf = () => [], absentThroughRound }: NormalizeReturningOptions = {},
): Player[] {
  const prevStatusById = new Map(prev.map((p) => [p.id, statusOf(p)]));
  const returning = next.filter((p) => statusOf(p) === 'available' && prevStatusById.get(p.id) !== 'available');
  if (returning.length === 0) return next;

  const returningIds = new Set(returning.map((p) => p.id));
  const availableIds = new Set(next.filter((p) => statusOf(p) === 'available').map((p) => p.id));
  const others = next.filter(
    (p) => availableIds.has(p.id) && !returningIds.has(p.id) && teammatesOf(p.id).every((id) => availableIds.has(id)),
  );
  const effective = (p: Player) => recordedByes(p.id) + (p.byeCountAdjustment ?? 0);

  let changed = false;
  const result = next.map((p) => {
    if (!returningIds.has(p.id)) return p;
    let updated = p;
    if (absentThroughRound != null && absentThroughRound > 0 && absentThroughRound > (p.lastAbsentRound ?? 0)) {
      updated = { ...updated, lastAbsentRound: absentThroughRound };
    }
    const teammates = new Set(teammatesOf(p.id));
    const comparable = others.filter((o) => !teammates.has(o.id));
    if (comparable.length > 0) {
      const minEffective = Math.min(...comparable.map(effective));
      const needed = Math.max(p.byeCountAdjustment ?? 0, minEffective - recordedByes(p.id));
      if (needed !== (p.byeCountAdjustment ?? 0)) updated = { ...updated, byeCountAdjustment: needed };
    }
    if (updated !== p) changed = true;
    return updated;
  });
  return changed ? result : next;
}

// A returning player's absence counts as their most recent "bye" for
// tie-breaking only (never for the count itself): of two players level on
// byes, the one who just arrived is the less due to sit out again.
export function lastByeRoundWithAbsence(lastByeRound: number | undefined, players: (Player | undefined)[]): number | undefined {
  const absent = Math.max(0, ...players.map((p) => p?.lastAbsentRound ?? 0));
  if (absent === 0) return lastByeRound;
  return Math.max(lastByeRound ?? 0, absent);
}

// Effective bye count for a fixed pair (a fixed team rests as one unit):
// the larger of its two members' adjustments, so normalising either member
// is enough to stop the team being over-rested.
export function teamByeAdjustment(memberIds: string[], playersById: Map<string, Player>): number {
  return Math.max(0, ...memberIds.map((id) => playersById.get(id)?.byeCountAdjustment ?? 0));
}
