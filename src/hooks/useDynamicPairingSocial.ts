import { useEffect, useMemo } from 'react';
import type {
  AddPlayerMidSessionResult,
  DynamicPairingRound,
  DynamicPairingSettings,
  DynamicPairingTeam,
  MidSessionJoinTiming,
  Player,
  PlayerAvailabilityStatus,
  PlayerGender,
  ResultSubmission,
  SessionAdjustment,
  SessionAdjustmentType,
} from '../types';
import {
  availabilityAdjustmentType,
  availabilityChangeMessage,
  changeAffectsFutureRounds,
  currentRoundHasResultMessage,
  isAwayStatus,
  normalizeReturningByeAdjustments,
  statusOf,
} from '../utils/availability';
import { firstUpcomingRoundNumber } from '../utils/scheduleValidation';
import { DEFAULT_SCORE_RECORDING_MODE, normalizeScoreRecordingMode, scoreRecordingModeLabel } from '../utils/results';
import {
  calculateDynamicPairingStats,
  canGenerateDynamicPairingRound,
  canSwapPlayerInDynamicPairingRound,
  courtHasResult,
  dynamicPairingAvailabilityLabel,
  dynamicPairingTeamDisplayName,
  extendDynamicPairingLookahead,
  generateDynamicPairingRoundForEntrants,
  generateInitialGradingRoundsForEntrants,
  isAwaitingSkillReview,
  isGradingPhaseComplete,
  lockCompletedRound,
  playedDynamicPairingRounds,
  processDynamicPairingResult,
  regenerateCurrentDynamicPairingRound,
  regenerateUpcomingRoundsForEntrants,
  swapPlayerInDynamicPairingRound,
} from '../utils/dynamicPairingSocial';
// Pure array transforms with no round/state coupling, so importing them
// here doesn't pull Standard Social Play state into this mode — same
// reasoning DynamicPairingRestingPlayers already applies to
// canIncreaseCourts.
import { activateDueNewJoiners, revertRestingPlayers } from '../utils/tournament';
import { useLocalStorage } from './useLocalStorage';

const SETTINGS_KEY = 'pickleball-tourney:dp:settings';
const PLAYERS_KEY = 'pickleball-tourney:dp:players';
const TEAMS_KEY = 'pickleball-tourney:dp:teams';
const ROUNDS_KEY = 'pickleball-tourney:dp:rounds';
const SESSION_ADJUSTMENTS_KEY = 'pickleball-tourney:dp:sessionAdjustments';

function makeAdjustmentId(): string {
  return `dp-adj-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function makeDynamicPairingTeamId(): string {
  return `dp-team-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export const DEFAULT_DYNAMIC_PAIRING_SETTINGS: DynamicPairingSettings = {
  sessionName: '',
  numberOfCourts: 6,
  gradingRounds: 3,
  gameFormat: 'first-to-score',
  winningScore: 11,
  gameDurationMinutes: 15,
  // Recommended default: unrestricted while grading is establishing
  // rankings, then Max 1 Court once real results are driving movement —
  // see generateDynamicPairingRound, which only applies this during the
  // 'ranking' phase in the first place.
  maxCourtMovement: 'max-1',
  scoreConfirmationRequired: false,
  rankingLagRounds: 1,
  scoreRecordingMode: DEFAULT_SCORE_RECORDING_MODE,
};

function makePlayerId(salt = 0): string {
  return `dp-player-${Date.now()}-${salt}-${Math.floor(Math.random() * 10000)}`;
}

// Dynamic Pairing Social's own player roster, settings, and round history —
// entirely separate from usePlayers/useTeams/useTournament (own
// localStorage keys, own shape) so this format can't affect, or be
// affected by, any other mode. See utils/dynamicPairingSocial.ts for the
// pairing/ranking/rest logic this hook drives.
export function useDynamicPairingSocial() {
  const [storedSettings, setSettings] = useLocalStorage<DynamicPairingSettings>(SETTINGS_KEY, DEFAULT_DYNAMIC_PAIRING_SETTINGS);
  // Backfill for settings saved before Score Recording existed.
  // Memoised so its identity only changes when the stored settings do (the
  // self-heal effect below depends on it).
  const settings: DynamicPairingSettings = useMemo(
    () => ({ ...storedSettings, scoreRecordingMode: normalizeScoreRecordingMode(storedSettings.scoreRecordingMode) }),
    [storedSettings],
  );
  const [players, setPlayers] = useLocalStorage<Player[]>(PLAYERS_KEY, []);
  // Fixed teams — see DynamicPairingTeam. References ids already in
  // `players` above rather than owning a separate roster (unlike
  // useTeams/Team), since almost everything in utils/dynamicPairingSocial.ts
  // is keyed by physical player id and needs every player — team members
  // included — to stay present in the one `players` array. See
  // buildDynamicPairingEntrants for how the two views (physical roster vs.
  // entrant list) are derived from `players` + `teams` together.
  const [teams, setTeams] = useLocalStorage<DynamicPairingTeam[]>(TEAMS_KEY, []);
  const [rounds, setRounds] = useLocalStorage<DynamicPairingRound[]>(ROUNDS_KEY, []);
  const [sessionAdjustments, setSessionAdjustments] = useLocalStorage<SessionAdjustment[]>(SESSION_ADJUSTMENTS_KEY, []);

  // Functional update, so several events logged in one handler (e.g. a
  // court-count change that also regenerates future rounds) all survive
  // rather than each overwriting the last from the same stale snapshot.
  function logAdjustment(type: SessionAdjustmentType, fields: Partial<SessionAdjustment> = {}) {
    const entry: SessionAdjustment = { id: makeAdjustmentId(), type, playerIds: [], timestamp: Date.now(), ...fields };
    setSessionAdjustments((prev) => [...prev, entry]);
  }

  const started = rounds.length > 0;
  const currentRound = rounds.find((r) => r.status === 'current');
  // Gates the "Set Skill Levels" UI on the Setup tab — see
  // isGradingPhaseComplete and Player.skillLevel. Purely a ranking
  // tiebreaker input, independent of the auto-advance self-heal below —
  // it stays available on Setup whether or not a skill review checkpoint
  // ever existed for this session.
  const gradingPhaseComplete = isGradingPhaseComplete(rounds, settings);
  // Only ever true for a session whose `rounds` were saved by an older
  // version of this app, genuinely stuck at the old Admin Skill Review
  // checkpoint — see isAwaitingSkillReview and the self-heal effect below,
  // which advances past it automatically. A session started under the
  // current version can never observe this as true, since
  // generateNextRound now generates/activates Round `gradingRounds + 1`
  // itself the moment grading finishes.
  const awaitingSkillReview = isAwaitingSkillReview(rounds, settings);

  // Self-heal for exactly that stale case: reaching this checkpoint used
  // to require an explicit organiser click (confirmSkillReviewAndStartRankingRounds)
  // to unblock the session; that requirement is removed, so a session
  // loaded from localStorage in that state advances past it automatically
  // instead of leaving the organiser with no current round and no visible
  // way to continue.
  useEffect(() => {
    if (!awaitingSkillReview) return;
    const check = canGenerateDynamicPairingRound(players, settings, undefined);
    if (!check.ok) return;
    const firstDynamicRound = generateDynamicPairingRoundForEntrants(players, teams, settings, rounds);
    setRounds(extendDynamicPairingLookahead(players, teams, settings, [...rounds, firstDynamicRound]));
  }, [awaitingSkillReview, players, teams, settings, rounds, setRounds]);

  function updateSettings(next: DynamicPairingSettings) {
    setSettings(next);
    if (next.scoreRecordingMode !== settings.scoreRecordingMode && started) {
      logAdjustment('score-mode-changed', {
        oldValue: settings.scoreRecordingMode,
        newValue: next.scoreRecordingMode,
        note: `Score recording changed to ${scoreRecordingModeLabel(next.scoreRecordingMode)}.`,
      });
    }
  }

  // Recorded rests per player over rounds actually reached — the input
  // normalizeReturningByeAdjustments levels a returning player against.
  function recordedRestsLookup(): (playerId: string) => number {
    const restsById = new Map(
      calculateDynamicPairingStats(players, playedDynamicPairingRounds(rounds)).map((st) => [st.playerId, st.totalRests]),
    );
    return (playerId) => restsById.get(playerId) ?? 0;
  }

  // A fixed-team member's partner(s) — left out of the minimum a returning
  // player's rest count is levelled to (see normalizeReturningByeAdjustments).
  function teammatesOf(playerId: string): string[] {
    return teams.find((t) => t.playerIds.includes(playerId))?.playerIds.filter((id) => id !== playerId) ?? [];
  }

  // Quickly generates `count` blank player slots so the organiser can fill
  // in names/ratings/genders afterward instead of adding one by one —
  // mirrors usePlayers' addPlayersBulk, adapted for this roster's own shape
  // (availabilityStatus defaults to 'available', gender defaults to 'M' —
  // see PlayerGender in ../types.ts for why) — also how a single "+ Add
  // Player" click adds one slot (count=1). Name starts empty (not
  // "Player N") so typing a real name doesn't require clearing a
  // placeholder first — the row's `placeholder` attribute still shows
  // "Player N" as greyed-out ghost text until then.
  function addPlayersBulk(count: number) {
    const newPlayers: Player[] = Array.from({ length: count }, (_, i) => ({
      id: makePlayerId(i),
      name: '',
      availabilityStatus: 'available',
      gender: 'M',
    }));
    setPlayers([...players, ...newPlayers]);
  }

  function updatePlayer(
    id: string,
    name: string,
    rating?: number,
    startingSeed?: number,
    availabilityStatus?: PlayerAvailabilityStatus,
    gender?: PlayerGender,
  ) {
    setPlayers(
      players.map((p) => (p.id === id ? { ...p, name, rating, startingSeed, availabilityStatus, gender } : p)),
    );
  }

  // Skill level is deliberately its own setter, separate from updatePlayer:
  // it's only meaningful (and only editable in the UI) once
  // gradingPhaseComplete is true, unlike name/rating/startingSeed/
  // availabilityStatus which have their own timing rules.
  function updatePlayerSkillLevel(id: string, skillLevel?: number) {
    setPlayers(players.map((p) => (p.id === id ? { ...p, skillLevel } : p)));
  }

  // Mid-session availability change — its own setter (not updatePlayer,
  // which replaces name/rating/startingSeed wholesale and would wipe them)
  // so it only ever touches this one field. See README's "Mid-session
  // player and court changes". Levels a returning player's rest count
  // (see normalizeReturningByeAdjustments), regenerates every still-
  // 'upcoming'/'pending-results' round against the updated roster (game
  // lag, fixed teams, gender-aware pairing and bye fairness all re-apply,
  // since it's the normal generator re-run), logs the change, and — only if
  // the organiser confirms and the current round has no result anywhere —
  // rebuilds the current round too. Locked/completed rounds are never
  // touched. Returns the user-facing messages describing what happened.
  function setAvailabilityStatus(id: string, status: PlayerAvailabilityStatus): string[] {
    const player = players.find((p) => p.id === id);
    if (!player) return [];
    const oldStatus = statusOf(player);
    if (oldStatus === status) return [];

    const changed = players.map((p) => (p.id === id ? { ...p, availabilityStatus: status } : p));
    const updatedPlayers = normalizeReturningByeAdjustments(players, changed, recordedRestsLookup(), {
      teammatesOf,
      absentThroughRound: currentRound ? currentRound.roundNumber - 1 : undefined,
    });
    setPlayers(updatedPlayers);
    // Resting this round <-> available can't change a future round (see
    // changeAffectsFutureRounds) — keep the saved schedule exactly as All
    // Rounds shows it instead of reshuffling it.
    const affectsFuture = changeAffectsFutureRounds(oldStatus, status);
    let nextRounds = affectsFuture ? regenerateUpcomingRoundsForEntrants(updatedPlayers, teams, settings, rounds) : rounds;
    if (nextRounds !== rounds) {
      logAdjustment('future-rounds-regenerated', { note: 'Future rounds were regenerated due to player/court changes.' });
    }

    const message = availabilityChangeMessage(
      player.name,
      status,
      dynamicPairingAvailabilityLabel(status),
      affectsFuture ? undefined : 'Future rounds are unchanged.',
    );
    const messages = [message];
    const team = teams.find((t) => t.playerIds.includes(id));
    if (team && isAwayStatus(status)) {
      messages.push(`${player.name} is part of a fixed team. This team will be unavailable for future rounds unless updated.`);
    }

    if (currentRound && status !== 'resting-this-round') {
      const court = currentRound.courts.find((c) => c.playerIds.includes(id));
      const roundHasResult = currentRound.courts.some(courtHasResult);
      if (isAwayStatus(status) && court) {
        if (courtHasResult(court)) {
          messages.push(currentRoundHasResultMessage(player.name));
        } else if (roundHasResult) {
          messages.push(`The current round already has results, so it wasn't changed. Swap ${player.name} out from Current Round if needed.`);
        } else if (
          window.confirm(`${player.name} is playing in the current round. Regenerate the current round without them? Existing court assignments for this round will change.`)
        ) {
          nextRounds = regenerateCurrentDynamicPairingRound(updatedPlayers, teams, settings, rounds) ?? nextRounds;
          messages.push('The current round was regenerated.');
        } else {
          messages.push(`The current round was left as is — swap ${player.name} out from Current Round if needed.`);
        }
      } else if (status === 'available' && oldStatus !== 'available' && !roundHasResult) {
        if (window.confirm(`${player.name} is available again. Also add them to the current round now? The current round has no results yet, so it can be safely regenerated.`)) {
          nextRounds = regenerateCurrentDynamicPairingRound(updatedPlayers, teams, settings, rounds) ?? nextRounds;
          messages.push(`The current round was regenerated to include ${player.name}.`);
        }
      }
    }

    if (nextRounds !== rounds) setRounds(nextRounds);
    logAdjustment(availabilityAdjustmentType(status), {
      playerIds: [id],
      roundNumber: currentRound?.roundNumber,
      oldValue: oldStatus,
      newValue: status,
      note: message,
    });
    return messages;
  }

  // "Change Courts": updates numberOfCourts, then regenerates whichever
  // 'upcoming' rounds currently exist (pre-generated grading batch, and/or
  // the ranking-phase look-ahead window) against the new court count —
  // generated against `nextSettings` explicitly since setSettings above
  // hasn't taken effect in this render yet.
  function changeCourtCount(newCourts: number) {
    if (newCourts === settings.numberOfCourts) return;
    const nextSettings = { ...settings, numberOfCourts: newCourts };
    setSettings(nextSettings);
    logAdjustment('court-count-changed', { oldValue: String(settings.numberOfCourts), newValue: String(newCourts) });

    const regenerated = regenerateUpcomingRoundsForEntrants(players, teams, nextSettings, rounds);
    if (regenerated !== rounds) {
      setRounds(regenerated);
      logAdjustment('future-rounds-regenerated', { note: 'Future rounds were regenerated due to player/court changes.' });
    }
  }

  // Live edit to the current round only — see
  // canSwapPlayerInDynamicPairingRound for the full rule set.
  function swapPlayerInCurrentRound(activePlayerId: string, restingPlayerId: string) {
    if (!currentRound) return { ok: false as const, reason: 'No current round.' };
    const check = canSwapPlayerInDynamicPairingRound(currentRound, activePlayerId, restingPlayerId, teams);
    if (!check.ok) return check;

    setRounds(
      rounds.map((round) =>
        round.id === currentRound.id ? swapPlayerInDynamicPairingRound(round, activePlayerId, restingPlayerId) : round,
      ),
    );
    logAdjustment('player-swapped', { roundNumber: currentRound.roundNumber, playerIds: [activePlayerId, restingPlayerId] });
    return { ok: true as const };
  }

  // "Add Player Mid-Session" — see AddPlayerMidSessionModal and README's
  // "Mid-session player additions". Always an individual entrant to start
  // (never auto-assigned into a fixed team — see the design brief's "only
  // if it does not break completed history", which the organiser decides
  // explicitly via Setup's existing Make Team flow, not this one). Neutral
  // stats need no special handling here — see usePlayers.addPlayerMidSession's
  // comment on why every stats helper already derives all-zero stats for a
  // player with no rounds in their history.
  function addPlayerMidSession(
    fields: { name: string; rating?: number; startingSeed?: number; note?: string; gender?: PlayerGender },
    joinTiming: MidSessionJoinTiming,
  ): AddPlayerMidSessionResult {
    if (fields.name.trim() === '') return { ok: false, reason: 'Enter a name before adding this player.' };
    const currentRoundNumber = currentRound?.roundNumber;
    const base = {
      id: makePlayerId(),
      name: fields.name,
      rating: fields.rating,
      startingSeed: fields.startingSeed,
      note: fields.note,
      gender: fields.gender ?? 'M',
      addedAtRound: currentRoundNumber,
      addedMidSession: true,
    };

    if (joinTiming === 'unavailable') {
      const player: Player = { ...base, availabilityStatus: 'unavailable' };
      setPlayers([...players, player]);
      logAdjustment('player-added-mid-session', {
        playerIds: [player.id],
        roundNumber: currentRoundNumber,
        note: `${player.name} added mid-session as unavailable.`,
      });
      return { ok: true };
    }

    // "Join current round if possible" — only attempted while a current
    // round actually exists; falls through to the "next round" path below
    // when regenerateCurrentDynamicPairingRound refuses (already scored).
    if (joinTiming === 'current' && currentRound) {
      const draftPlayer: Player = { ...base, availabilityStatus: 'available' };
      const draftPlayers = [...players, draftPlayer];
      const regenerated = regenerateCurrentDynamicPairingRound(draftPlayers, teams, settings, rounds);
      if (regenerated) {
        setPlayers(draftPlayers);
        setRounds(regenerated);
        const newCurrent = regenerated.find((r) => r.status === 'current');
        const resting = newCurrent?.restingPlayerIds.includes(draftPlayer.id) ?? false;
        logAdjustment('player-added-mid-session', {
          playerIds: [draftPlayer.id],
          roundNumber: currentRoundNumber,
          note: `${draftPlayer.name} added to the current round${resting ? "'s bye list" : ''}.`,
        });
        return { ok: true, joinedCurrentRound: true, restingInCurrentRound: resting };
      }
    }

    const effectiveFromRound = (currentRoundNumber ?? 0) + 1;
    const player: Player = { ...base, availabilityStatus: 'new-joiner', effectiveFromRound };
    const updatedPlayers = [...players, player];
    setPlayers(updatedPlayers);
    setRounds(regenerateUpcomingRoundsForEntrants(updatedPlayers, teams, settings, rounds));
    logAdjustment('player-added-mid-session', {
      playerIds: [player.id],
      roundNumber: currentRoundNumber,
      effectiveFromRound,
      note: `${player.name} added mid-session. Effective from Round ${effectiveFromRound}.`,
    });
    return {
      ok: true,
      effectiveFromRound,
      reason:
        joinTiming === 'current' ? 'Current round cannot be safely changed. Player will join from the next round.' : undefined,
    };
  }

  // Removing a player who's on a fixed team also dissolves that team (its
  // other member reverts to an individual entrant) — a team can never
  // reference a player id that no longer exists.
  function removePlayer(id: string) {
    setPlayers(players.filter((p) => p.id !== id));
    if (teams.some((t) => t.playerIds.includes(id))) {
      setTeams(teams.filter((t) => !t.playerIds.includes(id)));
    }
  }

  function removeAllPlayers() {
    setPlayers([]);
    setTeams([]);
  }

  // "Make Team": promotes two already-added individual players into a
  // fixed team (see the Setup screen's select-2 checkbox flow, mirroring
  // Standard Social Play's Participants pattern). Disabled by the UI once
  // `started` is true — see makeTeam's caller.
  function makeTeam(player1Id: string, player2Id: string) {
    if (player1Id === player2Id) return;
    if (teams.some((t) => t.playerIds.includes(player1Id) || t.playerIds.includes(player2Id))) return;
    const player1 = players.find((p) => p.id === player1Id);
    const player2 = players.find((p) => p.id === player2Id);
    if (!player1 || !player2) return;
    const rating = player1.rating != null && player2.rating != null ? (player1.rating + player2.rating) / 2 : undefined;
    const team: DynamicPairingTeam = { id: makeDynamicPairingTeamId(), playerIds: [player1Id, player2Id], rating };
    setTeams([...teams, team]);
  }

  // "Split Team": reverts a fixed team back into two individual entrants.
  // Always allowed pre-session-start; once `started`, this is the
  // "admin confirmation" escape hatch the fixed-team design brief calls
  // for — the two players' already-completed results stay exactly as
  // recorded (see the "Fixed teams & entrants" comment in
  // utils/dynamicPairingSocial.ts: stats are keyed by physical player id,
  // never by team id, so splitting can't lose or corrupt any history), only
  // *future* rounds start pairing them independently again.
  function unmakeTeam(teamId: string) {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    if (started) {
      const name = dynamicPairingTeamDisplayName(team, players);
      const confirmed = window.confirm(
        `This session has already started. Splitting ${name} won't change any completed round, but future rounds will pair its two players independently. Continue?`,
      );
      if (!confirmed) return;
      logAdjustment('team-split', { playerIds: [...team.playerIds] });
    }
    setTeams(teams.filter((t) => t.id !== teamId));
  }

  function updateTeamSeedAndRating(teamId: string, seed?: number, rating?: number) {
    setTeams(teams.map((t) => (t.id === teamId ? { ...t, seed, rating } : t)));
  }

  // Entrant-aware skill-level setter for the Setup tab's participant list
  // (see DynamicPairingSetup, skillLevelEditable) — writes to the
  // matching team's own skillLevel when `entrantId` is a team id, otherwise
  // falls through to the regular per-player setter.
  function updateEntrantSkillLevel(entrantId: string, skillLevel?: number) {
    if (teams.some((t) => t.id === entrantId)) {
      setTeams(teams.map((t) => (t.id === entrantId ? { ...t, skillLevel } : t)));
    } else {
      updatePlayerSkillLevel(entrantId, skillLevel);
    }
  }

  // "Start Matches" for Dynamic Pairing Social: pre-generates the entire
  // grading batch (Round 1 through settings.gradingRounds) up front, so
  // All Rounds shows the whole planned schedule immediately — see
  // generateInitialGradingRounds. Only Round 1 is playable to start; the
  // rest are 'upcoming' until generateNextRound activates them in order.
  // The extendDynamicPairingLookahead pass appends the first dynamic
  // round beyond the grading batch — generated for real immediately if
  // its (lagged or baseline) ranking basis is already available (only
  // possible with a large enough game lag or gradingRounds of 0), or a
  // 'pending-results' placeholder otherwise — so All Rounds shows what's
  // coming even before grading finishes.
  function startSession() {
    const initial = generateInitialGradingRoundsForEntrants(players, teams, settings);
    setRounds(extendDynamicPairingLookahead(players, teams, settings, initial));
  }

  // Advances past the current round once every court is scored, locks it,
  // then extends the dynamic-pairing look-ahead against the result that
  // just came in (see extendDynamicPairingLookahead) before activating
  // whatever is now 'upcoming' at the next round number — either a
  // still-pre-generated grading round, a dynamic round that was already
  // real ahead of time, or one that extendDynamicPairingLookahead just
  // upgraded from a 'pending-results' placeholder now that this round's
  // result unblocked it. A round that was already saved (and so already
  // visible in All Rounds) is activated exactly as saved — never rebuilt —
  // so Current Round always matches what All Rounds showed. This is what removes the old Admin Skill
  // Review checkpoint: completing the last grading round no longer leaves
  // the session waiting on an organiser confirmation — Round
  // `gradingRounds + 1` is generated and activated the same way any other
  // round is (see extendDynamicPairingLookahead's doc comment for why the
  // next round is always ready by this point).
  function generateNextRound() {
    if (!currentRound) return;
    // "This round" is ending — resting-this-round players are available
    // again starting now, same as Standard Social Play's nextRound. Every
    // other non-'available' status (late/unavailable/injured/left-early)
    // is untouched. A mid-session-added 'new-joiner' whose effectiveFromRound
    // has now arrived becomes 'available' at the same moment — see
    // activateDueNewJoiners.
    const upcomingRoundNumber = currentRound.roundNumber + 1;
    // Anyone becoming available right now starts level on rests — see
    // normalizeReturningByeAdjustments.
    const updatedPlayers = normalizeReturningByeAdjustments(
      players,
      activateDueNewJoiners(revertRestingPlayers(players), upcomingRoundNumber),
      recordedRestsLookup(),
      { teammatesOf, absentThroughRound: currentRound.roundNumber },
    );
    if (updatedPlayers !== players) setPlayers(updatedPlayers);

    const check = canGenerateDynamicPairingRound(updatedPlayers, settings, currentRound);
    if (!check.ok) return;

    const locked = rounds.map((r) => (r.id === currentRound.id ? lockCompletedRound(r) : r));
    const withLookahead = extendDynamicPairingLookahead(updatedPlayers, teams, settings, locked);
    const upcoming = withLookahead.find((r) => r.roundNumber === upcomingRoundNumber && r.status === 'upcoming');

    // The fallback (generate fresh, right now) guards against an
    // otherwise-unreachable state — see extendDynamicPairingLookahead's
    // doc comment — rather than leaving the organiser stuck with no
    // current round.
    const activated: DynamicPairingRound[] = upcoming
      ? withLookahead.map((r) => (r.id === upcoming.id ? { ...r, status: 'current' } : r))
      : [...withLookahead, generateDynamicPairingRoundForEntrants(updatedPlayers, teams, settings, withLookahead)];

    setRounds(activated);
    if (activated.some((r) => r.status === 'upcoming' || r.status === 'pending-results')) {
      logAdjustment('future-rounds-regenerated', {
        note: 'Future Dynamic Pairing rounds were updated using game-lag rankings.',
      });
    }
  }

  // Recovery for a saved schedule that has lost its current round —
  // promotes the first saved upcoming round as-is rather than generating a
  // different one (see useTournament's resumeSavedCurrentRound).
  function resumeSavedCurrentRound() {
    if (currentRound) return;
    const roundNumber = firstUpcomingRoundNumber(rounds);
    if (roundNumber == null) return;
    setRounds(rounds.map((r) => (r.roundNumber === roundNumber ? { ...r, status: 'current' as const } : r)));
  }

  function setCourtResult(roundId: string, courtNumber: number, result: ResultSubmission) {
    const round = rounds.find((r) => r.id === roundId);
    setRounds(rounds.map((r) => (r.id === roundId ? processDynamicPairingResult(r, courtNumber, result) : r)));
    logAdjustment('result-entered', {
      roundNumber: round?.roundNumber,
      note:
        result.kind === 'score'
          ? `Court ${courtNumber}: score ${result.scoreA}–${result.scoreB} recorded.`
          : `Court ${courtNumber}: winner recorded (score not recorded).`,
    });
  }

  // Full session wipe for "Reset Dynamic Pairing Social" — clears the
  // roster, settings, and every round/score/stat (stats/rankings are
  // derived from rounds, so clearing rounds clears them too).
  function resetDynamicPairing() {
    setSettings(DEFAULT_DYNAMIC_PAIRING_SETTINGS);
    setPlayers([]);
    setTeams([]);
    setRounds([]);
    setSessionAdjustments([]);
  }

  return {
    settings,
    updateSettings,
    players,
    addPlayersBulk,
    addPlayerMidSession,
    updatePlayer,
    updatePlayerSkillLevel,
    setAvailabilityStatus,
    removePlayer,
    removeAllPlayers,
    teams,
    makeTeam,
    unmakeTeam,
    updateTeamSeedAndRating,
    updateEntrantSkillLevel,
    rounds,
    currentRound,
    started,
    gradingPhaseComplete,
    startSession,
    generateNextRound,
    resumeSavedCurrentRound,
    setCourtResult,
    changeCourtCount,
    swapPlayerInCurrentRound,
    sessionAdjustments,
    resetDynamicPairing,
  };
}
