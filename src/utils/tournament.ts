// Pure tournament logic: validation, stats, and the shared pairing
// primitives (bye rotation, matchup-avoidance) that utils/pairing.ts builds
// on for pairing-style-aware and mixed-doubles round generation.
// No React or localStorage here, so this can be reused/extended (and
// eventually replaced with smarter pairing rules) without touching the UI.
// See utils/pairing.ts for round generation itself (createRound,
// createFixedTeamRound, generateMixedDoublesRound, and the pairing-style
// dispatch) — it imports the primitives below rather than duplicating them.

import type {
  Match,
  MatchType,
  PairingStyle,
  Player,
  PlayerAvailabilityStatus,
  PlayerStats,
  Round,
  RoundStatus,
  SessionPlan,
  SessionTiming,
  SocialScoringMode,
  Team,
  TeamStats,
  TournamentSettings,
} from '../types';
// Only used for pairing styles other than the default 'balanced' — see
// createRound/createFixedTeamRound below. utils/pairing.ts imports plenty
// back from this file (MeetingCounts, buildMatchHistory,
// pairByFewestMeetings, ...); that's a deliberate two-way split rather than
// a layering mistake: this file owns the primitives + the original
// 'balanced' algorithm, pairing.ts owns everything style-aware and the
// mixed fixed-team/individual-player engine. Safe as a circular import
// since neither side calls the other at module load time, only from
// inside functions that run later.
import { pairFixedTeamsByStyle, pairPlayerUnitsByStyle, pairTeamUnitsByStyle } from './pairing';

const PLAYERS_PER_COURT: Record<MatchType, number> = {
  singles: 2,
  doubles: 4,
};

export const DEFAULT_SESSION_TIMING: SessionTiming = {
  sessionTimeMinutes: 120,
  gameTimeMinutes: 10,
  bufferTimeMinutes: 2,
};

export const MIN_GAME_TIME_MINUTES = 8;
export const MAX_GAME_TIME_MINUTES = 12;

// Divides the booked session time into game+buffer "round blocks" to
// estimate how many rounds fit. `estimatedRounds` is clamped to 0 (rather
// than going negative) so the Setup screen can show a live preview even
// while the timing fields are still invalid/mid-edit.
export function calculateSessionPlan(timing: SessionTiming): SessionPlan {
  const roundBlockMinutes = timing.gameTimeMinutes + timing.bufferTimeMinutes;
  if (roundBlockMinutes <= 0) {
    return { estimatedRounds: 0, remainingTimeMinutes: Math.max(0, timing.sessionTimeMinutes) };
  }

  const estimatedRounds = Math.max(0, Math.floor(timing.sessionTimeMinutes / roundBlockMinutes));
  const remainingTimeMinutes = Math.max(0, timing.sessionTimeMinutes - estimatedRounds * roundBlockMinutes);
  return { estimatedRounds, remainingTimeMinutes };
}

export function validateSessionTiming(timing: SessionTiming): { ok: true } | { ok: false; reason: string } {
  if (timing.sessionTimeMinutes <= 0) {
    return { ok: false, reason: 'Session time must be greater than 0 minutes.' };
  }
  if (timing.gameTimeMinutes < MIN_GAME_TIME_MINUTES || timing.gameTimeMinutes > MAX_GAME_TIME_MINUTES) {
    return {
      ok: false,
      reason: `Game time must be between ${MIN_GAME_TIME_MINUTES} and ${MAX_GAME_TIME_MINUTES} minutes.`,
    };
  }
  if (timing.bufferTimeMinutes < 0) {
    return { ok: false, reason: 'Buffer time must be 0 or greater.' };
  }
  if (calculateSessionPlan(timing).estimatedRounds < 1) {
    return {
      ok: false,
      reason: 'Session time is too short to fit even one round at this game + buffer time.',
    };
  }
  return { ok: true };
}

export function playersNeededPerMatch(matchType: MatchType): number {
  return PLAYERS_PER_COURT[matchType];
}

export function maxPlayersForRound(settings: TournamentSettings): number {
  return settings.courts * playersNeededPerMatch(settings.matchType);
}

// The preset buttons shown by CourtSelector — 1 through 6, with "Other" for
// anything beyond that. A plain array rather than a constant so the Setup
// components never hardcode the preset range themselves.
export function generateCourtOptions(): number[] {
  return [1, 2, 3, 4, 5, 6];
}

export function validateCourtCount(value: number): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    return { ok: false, reason: 'Number of courts must be a whole number of at least 1.' };
  }
  return { ok: true };
}

export function isRoundComplete(round: Round): boolean {
  return round.matches.every((match) => match.scoreA != null && match.scoreB != null);
}

// --- Mid-session player availability (Standard Social Play + King Court) --
// Shared here (rather than duplicated per mode, unlike Dynamic Pairing
// Social/Dynamic Team Qualifier's deliberately-isolated logic files) because
// Standard Social Play and King Court both already read the *same*
// usePlayers roster directly, so they're not architecturally independent of
// each other the way those two are. Tournament Mode never calls either of
// these — see canGenerateRound/createRound, which take `players` as given
// and don't filter it — so a Tournament player's (always-absent)
// availabilityStatus can never affect anything.
export function isPlayerAvailableForScheduling(player: Player): boolean {
  return (player.availabilityStatus ?? 'available') === 'available';
}

export function availabilityStatusLabel(status: PlayerAvailabilityStatus): string {
  switch (status) {
    case 'available':
      return 'Available';
    case 'resting-this-round':
      return 'Resting This Round';
    case 'left-early':
      return 'Left Early';
    case 'injured':
      return 'Injured';
    case 'unavailable':
      return 'Unavailable';
  }
}

// --- Swapping an active player with a bye player, mid-round --------------
// A live edit to the current round's already-generated data (never a
// regeneration) — see README's "Mid-session player and court changes".
// Deliberately doesn't cover fixed-team sides (see isFixedTeamSide below):
// splitting a declared Team mid-round would break the "stays together"
// guarantee the rest of the app relies on (see useTeams/createFixedTeamRound)
// — only individual-player sides (Singles, rotating Doubles, or the
// individual-player half of a mixed Doubles roster) can be swapped.

export function isFixedTeamSide(playerIds: string[], teams: Team[]): boolean {
  if (playerIds.length !== 2) return false;
  const key = teamKey(playerIds);
  return teams.some((team) => teamKey(team.playerIds) === key);
}

export function canSwapPlayerInRound(
  round: Round,
  activePlayerId: string,
  byePlayerId: string,
  teams: Team[],
): { ok: true } | { ok: false; reason: string } {
  if (round.status !== 'current') {
    return { ok: false, reason: 'Swaps are only allowed in the current round.' };
  }
  if (activePlayerId === byePlayerId) {
    return { ok: false, reason: 'Choose two different players to swap.' };
  }
  if (!round.byePlayerIds.includes(byePlayerId)) {
    return { ok: false, reason: 'That player is not on a bye this round.' };
  }
  const match = round.matches.find(
    (m) => m.teamA.playerIds.includes(activePlayerId) || m.teamB.playerIds.includes(activePlayerId),
  );
  if (!match) {
    return { ok: false, reason: 'That player is not assigned to a match this round.' };
  }
  if (match.scoreA != null || match.scoreB != null) {
    return { ok: false, reason: 'That match already has a score — swaps are only allowed before a score is submitted.' };
  }
  const side = match.teamA.playerIds.includes(activePlayerId) ? match.teamA : match.teamB;
  if (isFixedTeamSide(side.playerIds, teams)) {
    return { ok: false, reason: "That player is on a fixed team, which can't be split by a swap." };
  }
  return { ok: true };
}

// Pure round edit: replaces `activePlayerId` with `byePlayerId` wherever the
// former appears in the round's matches, and swaps their bye-list
// membership. Callers must check canSwapPlayerInRound first — this
// function doesn't re-validate.
export function swapPlayerInRound(round: Round, activePlayerId: string, byePlayerId: string): Round {
  const replaceIn = (playerIds: string[]) => playerIds.map((id) => (id === activePlayerId ? byePlayerId : id));
  return {
    ...round,
    matches: round.matches.map((match) => ({
      ...match,
      teamA: { ...match.teamA, playerIds: replaceIn(match.teamA.playerIds) },
      teamB: { ...match.teamB, playerIds: replaceIn(match.teamB.playerIds) },
    })),
    byePlayerIds: round.byePlayerIds.map((id) => (id === byePlayerId ? activePlayerId : id)),
  };
}

// True for Doubles + Fixed Teams — the one combination where the roster is
// a list of pre-declared Teams (see useTeams) rather than a list of
// Players re-paired every round.
export function isFixedTeamsMode(settings: TournamentSettings): boolean {
  return settings.matchType === 'doubles' && settings.doublesPairingMode === 'fixed-teams';
}

// `players` should be every human who can actually take the court this
// round — for Doubles in Leaderboard/Social Play that's the union of the
// individual player roster and every fixed team's embedded players (see
// App.tsx's `effectivePlayers`), since a fixed team always contributes
// exactly 2 entries here; that makes the slot-count check below correct
// uniformly whether the roster is rotating players only, fixed teams only,
// or a mix of both (a fixed team = 2 slots, 2 individual players = 1
// temporary team = 2 slots — either way each contributes 2 entries to
// `players`). Pools & Knockout doesn't use this function (see
// validatePoolsKnockoutSetup instead), so `teams` here is only ever fixed
// teams for Leaderboard/Social Play, passed through for Doubles + Fixed
// Teams-only name validation.
export function canGenerateRound(
  players: Player[],
  settings: TournamentSettings,
  currentRound?: Round,
  teams: Team[] = [],
): { ok: true } | { ok: false; reason: string } {
  if (settings.courts < 1) {
    return { ok: false, reason: 'Number of courts must be at least 1.' };
  }

  const needed = playersNeededPerMatch(settings.matchType);
  if (players.length < needed) {
    return {
      ok: false,
      reason:
        settings.matchType === 'singles'
          ? 'Singles requires at least 2 players.'
          : 'Doubles requires at least 4 players total — a fixed team counts as 2, and 2 individual players can combine into a temporary team.',
    };
  }

  if (players.some((player) => player.name.trim() === '')) {
    return {
      ok: false,
      reason:
        teams.length > 0
          ? 'Every player needs a name before starting matches (including both players on every team).'
          : 'Every player needs a name before starting matches.',
    };
  }

  if (settings.playMode === 'social') {
    const timingCheck = validateSessionTiming(settings.sessionTiming);
    if (!timingCheck.ok) return timingCheck;
  }

  // Only Tournament Mode requires the current round to be fully scored
  // before moving on — Social Play is casual, so you can advance rounds
  // even if some scores (or all of them, in "No scoring") weren't entered.
  if (settings.playMode === 'tournament' && currentRound && !isRoundComplete(currentRound)) {
    return {
      ok: false,
      reason: 'Enter scores for every match in the current round before generating the next one.',
    };
  }

  return { ok: true };
}

// Whether match cards should collect scores at all.
export function isScoringEnabled(settings: TournamentSettings): boolean {
  return settings.playMode === 'tournament' || settings.socialScoringMode !== 'none';
}

// Whether wins/losses should be tracked and shown.
export function isWinLossTracked(settings: TournamentSettings): boolean {
  return settings.playMode === 'tournament' || settings.socialScoringMode === 'scoresAndWins';
}

export function socialScoringModeLabel(mode: SocialScoringMode): string {
  switch (mode) {
    case 'none':
      return 'No Scoring';
    case 'scoresOnly':
      return 'Track Scores Only';
    case 'scoresAndWins':
      return 'Track Scores and Wins';
  }
}

// Exported for utils/pairing.ts, which mints match/round ids the same way.
export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// --- Match history -------------------------------------------------------
// Derived from prior rounds rather than stored separately, so there's a
// single source of truth and no risk of it drifting out of sync. "Opponent"
// counts track how many times two players have played against each other
// (singles or doubles); "teammate" counts track how many times two players
// have been paired together on the same doubles team.

// Exported for utils/pairing.ts — the pairing-style engine reuses this
// exact shape (and buildMatchHistory below) so "how many times has X met
// Y" stays a single source of truth regardless of which pairing style or
// round shape (singles, rotating doubles, fixed teams, mixed doubles) is
// asking.
export type MeetingCounts = Map<string, Map<string, number>>;

export function bumpMeeting(counts: MeetingCounts, aId: string, bId: string) {
  if (!counts.has(aId)) counts.set(aId, new Map());
  const inner = counts.get(aId)!;
  inner.set(bId, (inner.get(bId) ?? 0) + 1);
}

export function meetingCount(counts: MeetingCounts, aId: string, bId: string): number {
  return counts.get(aId)?.get(bId) ?? 0;
}

export function buildMatchHistory(rounds: Round[]): { opponents: MeetingCounts; teammates: MeetingCounts } {
  const opponents: MeetingCounts = new Map();
  const teammates: MeetingCounts = new Map();

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const a of match.teamA.playerIds) {
        for (const b of match.teamB.playerIds) {
          bumpMeeting(opponents, a, b);
          bumpMeeting(opponents, b, a);
        }
      }
      for (const team of [match.teamA, match.teamB]) {
        if (team.playerIds.length === 2) {
          const [a, b] = team.playerIds;
          bumpMeeting(teammates, a, b);
          bumpMeeting(teammates, b, a);
        }
      }
    }
  }

  return { opponents, teammates };
}

export const PAIRING_TRIALS = 40;

export function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Greedy nearest-neighbour pairing for one processing order: repeatedly
// takes the next unpaired item and partners it with whoever it's met the
// fewest times before.
export function greedyPairInOrder<T extends { id: string }>(order: T[], counts: MeetingCounts): [T, T][] {
  const remaining = [...order];
  const pairs: [T, T][] = [];

  while (remaining.length >= 2) {
    const item = remaining.shift()!;
    let bestIndex = 0;
    let bestCount = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const count = meetingCount(counts, item.id, remaining[i].id);
      if (count < bestCount) {
        bestCount = count;
        bestIndex = i;
      }
    }
    const [partner] = remaining.splice(bestIndex, 1);
    pairs.push([item, partner]);
  }

  return pairs;
}

export function totalPairCost<T extends { id: string }>(pairs: [T, T][], counts: MeetingCounts): number {
  return pairs.reduce((sum, [a, b]) => sum + meetingCount(counts, a.id, b.id), 0);
}

// A single greedy pass processes players in a fixed order, which can "box
// in" the last couple of players and force a repeat pairing on them even
// when a repeat-free pairing exists elsewhere (this shows up quickly with
// e.g. 6 players over a few rounds). To avoid that, try the plain order
// first (so Round 1, with no history, still pairs in simple list order),
// then try several random orders and keep whichever pairing has the lowest
// total repeat-meeting count — stopping early once a repeat-free one is
// found. This is a simple heuristic, not a true minimum-weight matching,
// but it reliably finds a repeat-free pairing when one exists for the
// player counts this app is meant for.
export function pairByFewestMeetings<T extends { id: string }>(items: T[], counts: MeetingCounts): [T, T][] {
  let best = greedyPairInOrder(items, counts);
  let bestCost = totalPairCost(best, counts);

  for (let attempt = 0; attempt < PAIRING_TRIALS && bestCost > 0; attempt++) {
    const candidate = greedyPairInOrder(shuffled(items), counts);
    const cost = totalPairCost(candidate, counts);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }

  return best;
}

export function teamGroupScore(a: Player[], b: Player[], opponents: MeetingCounts): number {
  let score = 0;
  for (const x of a) {
    for (const y of b) {
      score += meetingCount(opponents, x.id, y.id);
    }
  }
  return score;
}

// Same greedy-pass idea, but for pairing up already-formed doubles teams
// against each other: minimises the total number of prior opponent
// meetings between the two teams' players (so it favours facing new
// opponents over repeats). Also uses random restarts for the same reason
// as pairByFewestMeetings above.
export function greedyPairTeamsInOrder(
  order: [Player, Player][],
  opponents: MeetingCounts,
): [[Player, Player], [Player, Player]][] {
  const remaining = [...order];
  const matchups: [[Player, Player], [Player, Player]][] = [];

  while (remaining.length >= 2) {
    const team = remaining.shift()!;
    let bestIndex = 0;
    let bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const score = teamGroupScore(team, remaining[i], opponents);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const [opponentTeam] = remaining.splice(bestIndex, 1);
    matchups.push([team, opponentTeam]);
  }

  return matchups;
}

export function totalTeamMatchupCost(
  matchups: [[Player, Player], [Player, Player]][],
  opponents: MeetingCounts,
): number {
  return matchups.reduce((sum, [a, b]) => sum + teamGroupScore(a, b, opponents), 0);
}

export function pairTeamsByFewestOpponentMeetings(
  teams: [Player, Player][],
  opponents: MeetingCounts,
): [[Player, Player], [Player, Player]][] {
  let best = greedyPairTeamsInOrder(teams, opponents);
  let bestCost = totalTeamMatchupCost(best, opponents);

  for (let attempt = 0; attempt < PAIRING_TRIALS && bestCost > 0; attempt++) {
    const candidate = greedyPairTeamsInOrder(shuffled(teams), opponents);
    const cost = totalTeamMatchupCost(candidate, opponents);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }

  return best;
}

// Simple ordered pairing, with a fair bye rotation and matchup-avoidance
// pairing on top:
//
// - Bye rotation: whenever there are more players than court capacity (or a
//   leftover that can't fill a full court), the extra players sit out as
//   "byes" for the round. Byes go to whoever has had the fewest byes so
//   far, so no one sits out twice before everyone else has had a turn.
// - Matchup avoidance: players who are playing get paired with whoever
//   they've faced the fewest times so far (see pairByFewestMeetings /
//   pairTeamsByFewestOpponentMeetings above). With no history yet this
//   comes out the same as simple in-order pairing.
// `pairingStyle` only ever varies from the default in Tournament Mode +
// Leaderboard format (see TournamentSetup's Pairing Style selector) — Social
// Play, and Leaderboard format before that selector existed, always use
// 'balanced', which reproduces this function's original behaviour exactly
// (same pairByFewestMeetings/pairTeamsByFewestOpponentMeetings calls as
// before). 'leaderboard-based' and 'random' delegate the pairing step (not
// the bye rotation above, which stays style-independent — see the spec
// this was built from) to utils/pairing.ts.
export function createRound(
  players: Player[],
  settings: TournamentSettings,
  roundNumber: number,
  priorRounds: Round[] = [],
  status: RoundStatus = 'current',
  pairingStyle: PairingStyle = 'balanced',
): Round {
  const perCourt = playersNeededPerMatch(settings.matchType);

  const usableCourts = Math.min(settings.courts, Math.floor(players.length / perCourt));
  const playingCount = usableCourts * perCourt;
  const byeCount = players.length - playingCount;

  const statsByPlayer = new Map(computePlayerStats(players, priorRounds).map((s) => [s.playerId, s]));
  const byePriority = players
    .map((player, index) => ({ player, index, byes: statsByPlayer.get(player.id)?.byes ?? 0 }))
    .sort((a, b) => a.byes - b.byes || a.index - b.index);

  const byePlayerIds = byePriority.slice(0, byeCount).map((entry) => entry.player.id);
  const byeIdSet = new Set(byePlayerIds);
  const playing = players.filter((p) => !byeIdSet.has(p.id));

  const { opponents, teammates } = buildMatchHistory(priorRounds);
  const matches: Match[] = [];

  if (settings.matchType === 'singles') {
    const pairs =
      pairingStyle === 'balanced'
        ? pairByFewestMeetings(playing, opponents)
        : pairPlayerUnitsByStyle(playing, opponents, pairingStyle, priorRounds);
    for (const [a, b] of pairs) {
      matches.push({
        id: makeId('match'),
        court: matches.length + 1,
        teamA: { playerIds: [a.id] },
        teamB: { playerIds: [b.id] },
      });
    }
  } else if (pairingStyle === 'balanced') {
    const teams = pairByFewestMeetings(playing, teammates);
    const matchups = pairTeamsByFewestOpponentMeetings(teams, opponents);
    for (const [teamA, teamB] of matchups) {
      matches.push({
        id: makeId('match'),
        court: matches.length + 1,
        teamA: { playerIds: teamA.map((p) => p.id) },
        teamB: { playerIds: teamB.map((p) => p.id) },
      });
    }
  } else {
    const matchups = pairTeamUnitsByStyle(playing, opponents, teammates, pairingStyle, priorRounds);
    for (const [teamA, teamB] of matchups) {
      matches.push({
        id: makeId('match'),
        court: matches.length + 1,
        teamA: { playerIds: teamA },
        teamB: { playerIds: teamB },
      });
    }
  }

  return {
    id: makeId('round'),
    roundNumber,
    matches,
    byePlayerIds,
    status,
  };
}

// A canonical, order-independent key for a team's 2 players, used to map a
// Match's MatchSide (which only stores playerIds) back to the fixed Team
// it came from. Exported so match-display components (CurrentRoundView,
// AllRoundsView) can look up "is this side a known fixed team?" the same
// way, without duplicating the key format.
export function teamKey(playerIds: string[]): string {
  return [...playerIds].sort().join('|');
}

export function buildTeamMatchHistory(rounds: Round[], teams: Team[]): MeetingCounts {
  const teamIdByKey = new Map(teams.map((team) => [teamKey(team.playerIds), team.id]));
  const opponents: MeetingCounts = new Map();

  for (const round of rounds) {
    for (const match of round.matches) {
      const aId = teamIdByKey.get(teamKey(match.teamA.playerIds));
      const bId = teamIdByKey.get(teamKey(match.teamB.playerIds));
      if (!aId || !bId) continue;
      bumpMeeting(opponents, aId, bId);
      bumpMeeting(opponents, bId, aId);
    }
  }

  return opponents;
}

// Doubles + Fixed Teams round generation. Structurally this is the same
// problem as Singles (rotate WHICH two competitors play each other,
// favouring opponents faced the fewest times, with a fair bye rotation) —
// the only difference is the competitor is a pre-formed 2-player Team
// instead of a lone Player, so this reuses pairByFewestMeetings directly
// on Team[] rather than re-forming partnerships every round like the
// Doubles branch of createRound above.
export function createFixedTeamRound(
  teams: Team[],
  settings: TournamentSettings,
  roundNumber: number,
  priorRounds: Round[] = [],
  status: RoundStatus = 'current',
  pairingStyle: PairingStyle = 'balanced',
): Round {
  // A doubles court seats exactly 2 teams (4 players).
  const usableCourts = Math.min(settings.courts, Math.floor(teams.length / 2));
  const playingTeamsCount = usableCourts * 2;

  // --- Bye assignment -------------------------------------------------
  // Byes are given to whole teams first (both players sit out together),
  // chosen by fewest team byes so far — the direct team-level equivalent
  // of createRound's player bye rotation above. `byeSlotsNeeded` is the
  // number of individual players who need to sit out this round.
  //
  // Because every fixed team has exactly 2 players (useTeams only ever
  // creates complete pairs) and a court always seats exactly 2 whole
  // teams, `teams.length * 2` and `usableCourts * 4` are both even, so
  // their difference is too — meaning `byeSlotsNeeded` is always even in
  // practice, and the whole-team-bye path below is the only one that
  // actually runs. The "split" path (Round.splitTeamIds) is still
  // implemented for the single-bye-remaining case the design calls for,
  // so the data model and behaviour are correct if that assumption is
  // ever relaxed (e.g. teams with an odd player count) — it just isn't
  // reachable today given the app's own validation rules. In this first
  // version a split team's other player also sits out rather than being
  // paired ad hoc with a leftover player from a different team, since a
  // Fixed Teams doubles match needs 2 complete teams; splitTeamIds still
  // records the distinction from an ordinary whole-team bye.
  const byeSlotsNeeded = teams.length * 2 - playingTeamsCount * 2;
  const wholeTeamByeCount = Math.floor(byeSlotsNeeded / 2);
  const hasOddSplitSlot = byeSlotsNeeded % 2 === 1;

  const teamStatsById = new Map(computeTeamStats(teams, priorRounds).map((s) => [s.teamId, s]));
  const byePriority = teams
    .map((team, index) => ({ team, index, byes: teamStatsById.get(team.id)?.byes ?? 0 }))
    .sort((a, b) => a.byes - b.byes || a.index - b.index);

  const byeTeamIds = byePriority.slice(0, wholeTeamByeCount).map((entry) => entry.team.id);
  const splitTeamIds: string[] = [];
  const byePlayerIds = byeTeamIds.flatMap((id) => teams.find((team) => team.id === id)!.playerIds);

  if (hasOddSplitSlot) {
    const splitCandidate = byePriority[wholeTeamByeCount];
    if (splitCandidate) {
      splitTeamIds.push(splitCandidate.team.id);
      byePlayerIds.push(...splitCandidate.team.playerIds);
    }
  }

  const sittingOutTeamIds = new Set([...byeTeamIds, ...splitTeamIds]);
  const playingTeams = teams.filter((team) => !sittingOutTeamIds.has(team.id));

  // --- Opponent pairing -------------------------------------------------
  // 'balanced' (the default) keeps using team-id-based history (how many
  // times has *this declared team* faced that one before) via
  // buildTeamMatchHistory — unchanged from the original behaviour.
  // 'leaderboard-based'/'random' use utils/pairing.ts instead, which scores
  // matchups off player-level history (see scorePotentialMatchup) since
  // that's the same basis the mixed fixed-team/individual-player engine
  // uses — keeping both fixed-teams-only and mixed doubles consistent for
  // the two newer styles.
  const matches: Match[] =
    pairingStyle === 'balanced'
      ? pairByFewestMeetings(playingTeams, buildTeamMatchHistory(priorRounds, teams)).map(([teamA, teamB], index) => ({
          id: makeId('match'),
          court: index + 1,
          teamA: { playerIds: teamA.playerIds },
          teamB: { playerIds: teamB.playerIds },
        }))
      : pairFixedTeamsByStyle(playingTeams, pairingStyle, priorRounds).map(([teamA, teamB], index) => ({
          id: makeId('match'),
          court: index + 1,
          teamA: { playerIds: teamA },
          teamB: { playerIds: teamB },
        }));

  return {
    id: makeId('round'),
    roundNumber,
    matches,
    byePlayerIds,
    byeTeamIds,
    splitTeamIds,
    status,
  };
}

export function getMatchWinner(match: Match): 'A' | 'B' | undefined {
  if (match.scoreA == null || match.scoreB == null || match.scoreA === match.scoreB) {
    return undefined;
  }
  return match.scoreA > match.scoreB ? 'A' : 'B';
}

// Points are the score achieved, not just win/loss: every player on a team
// gets that team's full score added to their total, every round. Byes don't
// add points, matches played, wins, or losses — only the bye count.
//
// "Games played", partners, and opponents are tracked from participation
// alone (not from whether a score was entered) so Social Play's "No
// scoring" mode still has meaningful stats to show.
export function computePlayerStats(players: Player[], rounds: Round[]): PlayerStats[] {
  const statsByPlayer = new Map<string, PlayerStats>(
    players.map((player) => [
      player.id,
      {
        playerId: player.id,
        totalPoints: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifferential: 0,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        byes: 0,
        partnerIds: [],
        opponentIds: [],
      },
    ]),
  );
  const partnerSets = new Map<string, Set<string>>(players.map((p) => [p.id, new Set<string>()]));
  const opponentSets = new Map<string, Set<string>>(players.map((p) => [p.id, new Set<string>()]));

  // `ownScore` becomes totalPoints/pointsFor (identical — every player on a
  // side gets that side's full score, same as before); `opponentScore` is
  // new, feeding pointsAgainst/pointDifferential for the Leaderboard's
  // PF/PA/+/- columns.
  function applyPoints(playerIds: string[], ownScore: number, opponentScore: number, won: boolean, lost: boolean) {
    for (const id of playerIds) {
      const stats = statsByPlayer.get(id);
      if (!stats) continue;
      stats.totalPoints += ownScore;
      stats.pointsFor += ownScore;
      stats.pointsAgainst += opponentScore;
      if (won) stats.wins += 1;
      if (lost) stats.losses += 1;
    }
  }

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const id of [...match.teamA.playerIds, ...match.teamB.playerIds]) {
        const stats = statsByPlayer.get(id);
        if (stats) stats.matchesPlayed += 1;
      }

      for (const team of [match.teamA, match.teamB]) {
        if (team.playerIds.length === 2) {
          const [a, b] = team.playerIds;
          partnerSets.get(a)?.add(b);
          partnerSets.get(b)?.add(a);
        }
      }
      for (const a of match.teamA.playerIds) {
        for (const b of match.teamB.playerIds) {
          opponentSets.get(a)?.add(b);
          opponentSets.get(b)?.add(a);
        }
      }

      if (match.scoreA == null || match.scoreB == null) continue;
      const winner = getMatchWinner(match);
      applyPoints(match.teamA.playerIds, match.scoreA, match.scoreB, winner === 'A', winner === 'B');
      applyPoints(match.teamB.playerIds, match.scoreB, match.scoreA, winner === 'B', winner === 'A');
    }

    for (const id of round.byePlayerIds) {
      const stats = statsByPlayer.get(id);
      if (stats) stats.byes += 1;
    }
  }

  for (const stats of statsByPlayer.values()) {
    stats.pointDifferential = stats.pointsFor - stats.pointsAgainst;
    stats.partnerIds = Array.from(partnerSets.get(stats.playerId) ?? []);
    stats.opponentIds = Array.from(opponentSets.get(stats.playerId) ?? []);
  }

  return Array.from(statsByPlayer.values());
}

// The Doubles + Fixed Teams equivalent of computePlayerStats: aggregates
// each fixed team's record (not each player's) across rounds, tracked
// both ways (PF/PA/+/-), matching Pools & Knockout's PoolStanding shape —
// a fixed team's results read naturally as a team record, not a points
// total. Byes count both whole-team byes and (see createFixedTeamRound)
// the rare single-player "split" case, since either way the team missed a
// round together.
export function computeTeamStats(teams: Team[], rounds: Round[]): TeamStats[] {
  const teamIdByKey = new Map(teams.map((team) => [teamKey(team.playerIds), team.id]));
  const statsByTeam = new Map<string, TeamStats>(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        gamesPlayed: 0,
        byes: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifference: 0,
        opponentIds: [],
      },
    ]),
  );
  const opponentSets = new Map<string, Set<string>>(teams.map((team) => [team.id, new Set<string>()]));

  for (const round of rounds) {
    for (const match of round.matches) {
      const aId = teamIdByKey.get(teamKey(match.teamA.playerIds));
      const bId = teamIdByKey.get(teamKey(match.teamB.playerIds));
      const statsA = aId ? statsByTeam.get(aId) : undefined;
      const statsB = bId ? statsByTeam.get(bId) : undefined;
      if (!aId || !bId || !statsA || !statsB) continue;

      statsA.gamesPlayed += 1;
      statsB.gamesPlayed += 1;
      opponentSets.get(aId)?.add(bId);
      opponentSets.get(bId)?.add(aId);

      if (match.scoreA == null || match.scoreB == null) continue;
      statsA.pointsFor += match.scoreA;
      statsA.pointsAgainst += match.scoreB;
      statsB.pointsFor += match.scoreB;
      statsB.pointsAgainst += match.scoreA;

      const winner = getMatchWinner(match);
      if (winner === 'A') {
        statsA.wins += 1;
        statsB.losses += 1;
      } else if (winner === 'B') {
        statsB.wins += 1;
        statsA.losses += 1;
      }
    }

    for (const teamId of [...(round.byeTeamIds ?? []), ...(round.splitTeamIds ?? [])]) {
      const stats = statsByTeam.get(teamId);
      if (stats) stats.byes += 1;
    }
  }

  for (const stats of statsByTeam.values()) {
    stats.pointDifference = stats.pointsFor - stats.pointsAgainst;
    stats.opponentIds = Array.from(opponentSets.get(stats.teamId) ?? []);
  }

  return Array.from(statsByTeam.values());
}
