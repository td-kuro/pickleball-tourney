// Integrity checks for a saved round schedule — the one source of truth
// both Current Round and All Rounds render from (see README's "One saved
// schedule"). Neither view generates pairings; the saved `rounds` array is
// only ever written by generation (session start, advancing, or an
// explicit regeneration of future unlocked rounds). This module never
// fixes anything itself: if the saved schedule looks wrong it reports it,
// and the saved schedule stays authoritative — completed data is never
// silently overwritten to "repair" a mismatch.
//
// Mode-agnostic: each mode adapts its own round shape into a
// ScheduleRoundView (see standardScheduleView / dynamicPairingScheduleView),
// so one validator covers Standard Social Play, Tournament Leaderboard and
// Dynamic Pairing Social alike.

import type { DynamicPairingRound, Player, Round } from '../types';
import { auditByeFairness } from './byeSelection';

export interface ScheduleMatchView {
  matchId: string;
  sides: [string[], string[]];
}

export interface ScheduleRoundView {
  roundId: string;
  roundNumber: number;
  status: string;
  matches: ScheduleMatchView[];
  restingPlayerIds: string[];
  // Fixed teams deliberately split for this round only (Standard Social
  // Play's createFixedTeamRound) — exempt from the "fixed team split" check.
  splitTeamIds?: string[];
  // Entrant-level view for the bye-fairness audit: a fixed team is one
  // entrant (its id), everyone else is their own player id.
  restingEntrantIds: string[];
  activeEntrantIds: string[];
  // Set when the round records an unavoidable compromise — see
  // CONSECUTIVE_BYE_NOTE in utils/byeSelection.ts.
  byeNote?: string;
}

export interface ScheduleValidationInput {
  rounds: ScheduleRoundView[];
  // Every player id the session knows about — ids outside it are flagged.
  knownPlayerIds: Set<string>;
  // Fixed teams whose members must always share a side (or rest together).
  fixedTeams?: { id: string; playerIds: string[] }[];
  // Per-entrant late-return normalisation (Player.byeCountAdjustment; a
  // fixed team takes its members' larger one) and display names, for the
  // bye-fairness audit.
  byeAdjustments?: Map<string, number>;
  nameOf?: (entrantId: string) => string;
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

// Only rounds that haven't been played yet can drift from the roster
// (removed players, split teams); completed history is left alone.
function isUnplayed(status: string): boolean {
  return status === 'current' || status === 'upcoming';
}

export function validateCurrentRoundMatchesSchedule(input: ScheduleValidationInput): ValidationResult {
  const { rounds, knownPlayerIds, fixedTeams = [] } = input;
  const issues: string[] = [];
  if (rounds.length === 0) return { ok: true, issues };

  const current = rounds.filter((r) => r.status === 'current');
  const hasUnplayed = rounds.some((r) => r.status === 'upcoming' || r.status === 'pending-results');
  if (current.length === 0 && hasUnplayed) {
    issues.push('Current round is missing from the saved schedule.');
  }
  if (current.length > 1) {
    issues.push(`More than one round is marked current (Rounds ${current.map((r) => r.roundNumber).join(', ')}).`);
  }

  const roundIds = new Set<string>();
  const roundNumbers = new Set<number>();
  const matchIds = new Set<string>();
  for (const round of rounds) {
    if (roundIds.has(round.roundId)) issues.push(`Round ${round.roundNumber} reuses another round's ID.`);
    roundIds.add(round.roundId);
    if (roundNumbers.has(round.roundNumber)) issues.push(`Round ${round.roundNumber} appears more than once in the schedule.`);
    roundNumbers.add(round.roundNumber);

    const seen = new Set<string>();
    for (const match of round.matches) {
      if (matchIds.has(match.matchId)) issues.push(`Round ${round.roundNumber}: match ID ${match.matchId} is not unique.`);
      matchIds.add(match.matchId);
      for (const id of [...match.sides[0], ...match.sides[1]]) {
        if (seen.has(id)) issues.push(`Round ${round.roundNumber}: a player appears in more than one match.`);
        seen.add(id);
      }
    }
    if (round.restingPlayerIds.some((id) => seen.has(id))) {
      issues.push(`Round ${round.roundNumber}: a resting player is also scheduled to play.`);
    }

    if (!isUnplayed(round.status)) continue;

    const scheduled = [...seen, ...round.restingPlayerIds];
    if (scheduled.some((id) => !knownPlayerIds.has(id))) {
      issues.push(`Round ${round.roundNumber}: references a player who is no longer on the roster.`);
    }
    const splitThisRound = new Set(round.splitTeamIds ?? []);
    for (const team of fixedTeams) {
      if (splitThisRound.has(team.id)) continue;
      const placements = team.playerIds.map((id) => {
        if (round.restingPlayerIds.includes(id)) return 'rest';
        const match = round.matches.find((m) => m.sides[0].includes(id) || m.sides[1].includes(id));
        if (!match) return 'absent';
        return `${match.matchId}:${match.sides[0].includes(id) ? 'A' : 'B'}`;
      });
      if (new Set(placements).size > 1) {
        issues.push(`Round ${round.roundNumber}: a fixed team's players are split up.`);
      }
    }
  }

  // Bye fairness (see auditByeFairness): audited across the whole played
  // history so counts are right, but only reported for rounds not yet
  // played — history is what it is, and flagging it would just nag.
  const unplayedNumbers = new Set(rounds.filter((r) => isUnplayed(r.status)).map((r) => r.roundNumber));
  const scheduled = rounds
    .filter((r) => r.status !== 'pending-results')
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((r) => ({
      roundNumber: r.roundNumber,
      restingIds: r.restingEntrantIds,
      eligibleIds: [...r.restingEntrantIds, ...r.activeEntrantIds],
      byeNote: r.byeNote,
    }));
  for (const issue of auditByeFairness(scheduled, input.byeAdjustments, input.nameOf)) {
    if (unplayedNumbers.has(issue.roundNumber)) issues.push(issue.message);
  }

  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}

// Bye-audit inputs for a roster: each entrant's late-return adjustment (a
// fixed team takes its members' larger one, as bye selection does) and its
// display name.
export function entrantByeContext<T extends { id: string; playerIds: string[] }>(
  players: Player[],
  fixedTeams: T[],
  teamName: (team: T) => string,
): { byeAdjustments: Map<string, number>; nameOf: (entrantId: string) => string } {
  const playersById = new Map(players.map((p) => [p.id, p]));
  const byeAdjustments = new Map<string, number>();
  for (const p of players) if (p.byeCountAdjustment) byeAdjustments.set(p.id, p.byeCountAdjustment);
  for (const team of fixedTeams) {
    const adjustment = Math.max(0, ...team.playerIds.map((id) => playersById.get(id)?.byeCountAdjustment ?? 0));
    if (adjustment > 0) byeAdjustments.set(team.id, adjustment);
  }
  const teamsById = new Map(fixedTeams.map((t) => [t.id, t]));
  const nameOf = (id: string) => {
    const team = teamsById.get(id);
    return team ? teamName(team) : (playersById.get(id)?.name ?? 'A player');
  };
  return { byeAdjustments, nameOf };
}

// Entrant id for each player: their fixed team's id if they're on one.
function entrantIdResolver(fixedTeams: { id: string; playerIds: string[] }[]): (playerId: string) => string {
  const teamIdByPlayerId = new Map(fixedTeams.flatMap((t) => t.playerIds.map((id) => [id, t.id] as const)));
  return (playerId) => teamIdByPlayerId.get(playerId) ?? playerId;
}

export function standardScheduleView(round: Round, fixedTeams: { id: string; playerIds: string[] }[] = []): ScheduleRoundView {
  const entrantOf = entrantIdResolver(fixedTeams);
  const splitIds = new Set(round.splitTeamIds ?? []);
  // A split team's playing half isn't the team entrant this round.
  const activeOf = (id: string) => (splitIds.has(entrantOf(id)) ? id : entrantOf(id));
  return {
    roundId: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    matches: round.matches.map((match) => ({ matchId: match.id, sides: [match.teamA.playerIds, match.teamB.playerIds] })),
    restingPlayerIds: round.byePlayerIds,
    splitTeamIds: round.splitTeamIds,
    restingEntrantIds: [...new Set(round.byePlayerIds.map(entrantOf))],
    activeEntrantIds: [...new Set(round.matches.flatMap((m) => [...m.teamA.playerIds, ...m.teamB.playerIds]).map(activeOf))],
    byeNote: round.byeNote,
  };
}

// Dynamic Pairing courts have no id of their own — a court is identified by
// its round's id plus its court number, both of which are fixed once the
// round is saved.
export function dynamicPairingScheduleView(round: DynamicPairingRound): ScheduleRoundView {
  return {
    roundId: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    matches: round.courts.map((court) => ({
      matchId: `${round.id}-court-${court.courtNumber}`,
      sides: [court.team1PlayerIds, court.team2PlayerIds],
    })),
    restingPlayerIds: round.restingPlayerIds,
    restingEntrantIds: round.restingEntrantIds ?? round.restingPlayerIds,
    activeEntrantIds: [
      ...new Set(round.courts.flatMap((court) => [...(court.team1EntrantIds ?? court.team1PlayerIds), ...(court.team2EntrantIds ?? court.team2PlayerIds)])),
    ],
    byeNote: round.byeFairnessNote,
  };
}

// The first not-yet-played saved round — what "resume from the saved
// schedule" promotes to current when the current round has gone missing,
// instead of generating a different one.
export function firstUpcomingRoundNumber(rounds: { roundNumber: number; status: string }[]): number | undefined {
  const upcoming = rounds.filter((r) => r.status === 'upcoming').map((r) => r.roundNumber);
  return upcoming.length > 0 ? Math.min(...upcoming) : undefined;
}
