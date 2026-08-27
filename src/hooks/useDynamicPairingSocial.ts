import type {
  DynamicPairingRound,
  DynamicPairingSettings,
  DynamicPairingTeam,
  Player,
  PlayerAvailabilityStatus,
  SessionAdjustment,
  SessionAdjustmentType,
} from '../types';
import {
  canGenerateDynamicPairingRound,
  canSwapPlayerInDynamicPairingRound,
  dynamicPairingTeamDisplayName,
  generateDynamicPairingRoundForEntrants,
  generateInitialGradingRoundsForEntrants,
  isAwaitingSkillReview,
  isGradingPhaseComplete,
  lockCompletedRound,
  processDynamicPairingScore,
  regenerateUpcomingRankingRoundsForEntrants,
  regenerateUpcomingRoundsForEntrants,
  swapPlayerInDynamicPairingRound,
} from '../utils/dynamicPairingSocial';
// Pure array transform with no round/state coupling, so importing it here
// doesn't pull Standard Social Play state into this mode — same reasoning
// DynamicPairingRestingPlayers already applies to canIncreaseCourts.
import { revertRestingPlayers } from '../utils/tournament';
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
  const [settings, setSettings] = useLocalStorage<DynamicPairingSettings>(SETTINGS_KEY, DEFAULT_DYNAMIC_PAIRING_SETTINGS);
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

  function logAdjustment(type: SessionAdjustmentType, fields: Partial<SessionAdjustment> = {}) {
    setSessionAdjustments([
      ...sessionAdjustments,
      { id: makeAdjustmentId(), type, playerIds: [], timestamp: Date.now(), ...fields },
    ]);
  }

  const started = rounds.length > 0;
  const currentRound = rounds.find((r) => r.status === 'current');
  // Gates the "Set Skill Levels" UI on the Setup tab — see
  // isGradingPhaseComplete and Player.skillLevel.
  const gradingPhaseComplete = isGradingPhaseComplete(rounds, settings);
  // True once the pre-generated grading batch is fully played and Round 4+
  // hasn't been generated yet — see isAwaitingSkillReview. Gates showing
  // DynamicPairingAdminSkillReview in place of Current Round.
  const awaitingSkillReview = isAwaitingSkillReview(rounds, settings);

  function updateSettings(next: DynamicPairingSettings) {
    setSettings(next);
  }

  // Quickly generates `count` blank player slots so the organiser can fill
  // in names/ratings/seeds afterward instead of adding one by one — mirrors
  // usePlayers' addPlayersBulk, adapted for this roster's own shape
  // (availabilityStatus defaults to 'available') — also how a single
  // "+ Add Player" click adds one slot (count=1). Name starts empty (not
  // "Player N") so typing a real name doesn't require clearing a
  // placeholder first — the row's `placeholder` attribute still shows
  // "Player N" as greyed-out ghost text until then.
  function addPlayersBulk(count: number) {
    const newPlayers: Player[] = Array.from({ length: count }, (_, i) => ({
      id: makePlayerId(i),
      name: '',
      availabilityStatus: 'available',
    }));
    setPlayers([...players, ...newPlayers]);
  }

  function updatePlayer(
    id: string,
    name: string,
    rating?: number,
    startingSeed?: number,
    availabilityStatus?: PlayerAvailabilityStatus,
  ) {
    setPlayers(
      players.map((p) => (p.id === id ? { ...p, name, rating, startingSeed, availabilityStatus } : p)),
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
  // player and court changes". Regenerates the still-'upcoming' pre-
  // generated grading rounds against the updated roster immediately —
  // Round 4+ needs no such regeneration, since generateDynamicPairingRound
  // already filters by isPlayerAvailable on every call (this format has
  // always excluded unavailable players from scheduling, from the very
  // first version — see that function).
  function setAvailabilityStatus(id: string, status: PlayerAvailabilityStatus) {
    const updatedPlayers = players.map((p) => (p.id === id ? { ...p, availabilityStatus: status } : p));
    setPlayers(updatedPlayers);
    const regenerated = regenerateUpcomingRoundsForEntrants(updatedPlayers, teams, settings, rounds);
    if (regenerated !== rounds) {
      setRounds(regenerated);
      logAdjustment('future-rounds-regenerated', { note: 'Future rounds were regenerated due to player/court changes.' });
    }
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

  // Entrant-aware skill-level setter for Admin Skill Review — writes to the
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
  // The extra regenerateUpcomingRankingRoundsForEntrants pass is a no-op
  // in the normal case (grading rounds exist, so there's no ranking round
  // to look ahead from yet) — it only does something when gradingRounds is
  // 0, where the very first generated round is already a ranking round.
  function startSession() {
    const initial = generateInitialGradingRoundsForEntrants(players, teams, settings);
    setRounds(regenerateUpcomingRankingRoundsForEntrants(players, teams, settings, initial));
  }

  // Advances past the current round once every court is scored.
  // Grading phase: a pre-generated round (Round 2 or 3) is just activated
  // in order, or — on the last grading round — locked with nothing made
  // 'current' after it, which is exactly what makes isAwaitingSkillReview
  // true; DynamicPairingAdminSkillReview takes it from here via
  // confirmSkillReviewAndStartRankingRounds. Ranking phase: the look-ahead
  // window (see regenerateUpcomingRankingRoundsForEntrants) normally
  // already has the next round pre-generated — activate it — then rebuild
  // the remaining look-ahead window against the results that just came in,
  // per the "Predetermined round generation" rule (recalculate rankings,
  // regenerate only future unlocked rounds, never touch what's
  // locked/completed/current).
  function generateNextRound() {
    if (!currentRound) return;
    // "This round" is ending — resting-this-round players are available
    // again starting now, same as Standard Social Play's nextRound. Every
    // other non-'available' status (late/unavailable/injured/left-early)
    // is untouched.
    const revertedPlayers = revertRestingPlayers(players);
    if (revertedPlayers !== players) setPlayers(revertedPlayers);

    const check = canGenerateDynamicPairingRound(revertedPlayers, settings, currentRound);
    if (!check.ok) return;

    const locked = rounds.map((r) => (r.id === currentRound.id ? lockCompletedRound(r) : r));
    const upcoming = locked.find((r) => r.roundNumber === currentRound.roundNumber + 1 && r.status === 'upcoming');

    if (currentRound.phase === 'grading') {
      if (upcoming) {
        setRounds(locked.map((r) => (r.id === upcoming.id ? { ...r, status: 'current' } : r)));
        return;
      }
      setRounds(locked); // last grading round — hands off to Admin Skill Review
      return;
    }

    // Ranking phase. Only generates fresh here (instead of activating an
    // already-pre-generated round) when rankingLagRounds is 0, i.e. no
    // look-ahead window exists at all.
    const activated: DynamicPairingRound[] = upcoming
      ? locked.map((r) => (r.id === upcoming.id ? { ...r, status: 'current' } : r))
      : [...locked, generateDynamicPairingRoundForEntrants(revertedPlayers, teams, settings, locked)];

    const regenerated = regenerateUpcomingRankingRoundsForEntrants(revertedPlayers, teams, settings, activated);
    setRounds(regenerated);
    if (regenerated.some((r) => r.status === 'upcoming')) {
      logAdjustment('future-rounds-regenerated', {
        note: 'Future rounds were updated using latest available lagged rankings.',
      });
    }
  }

  // Confirms Admin Skill Review and generates Round `gradingRounds + 1` —
  // the first round to use real ranking-based pairing (see
  // generateDynamicPairingRound's 'ranking' phase) — then immediately
  // extends the ranking look-ahead window as far as rankingLagRounds
  // allows (see regenerateUpcomingRankingRoundsForEntrants), so e.g. with
  // the default lag of 1 and 3 grading rounds, Round 5 is already visible
  // in All Rounds the moment Round 4 becomes current. Setting skill levels
  // beforehand is optional (see updatePlayerSkillLevel); only reaching and
  // clicking Confirm is required to unblock Round 4.
  function confirmSkillReviewAndStartRankingRounds() {
    if (!awaitingSkillReview) return;
    const check = canGenerateDynamicPairingRound(players, settings, undefined);
    if (!check.ok) return;
    const firstRankingRound = generateDynamicPairingRoundForEntrants(players, teams, settings, rounds);
    const withLookahead = regenerateUpcomingRankingRoundsForEntrants(players, teams, settings, [...rounds, firstRankingRound]);
    setRounds(withLookahead);
  }

  function setCourtScore(roundId: string, courtNumber: number, score1: number, score2: number) {
    setRounds(
      rounds.map((round) => (round.id === roundId ? processDynamicPairingScore(round, courtNumber, score1, score2) : round)),
    );
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
    awaitingSkillReview,
    startSession,
    generateNextRound,
    confirmSkillReviewAndStartRankingRounds,
    setCourtScore,
    changeCourtCount,
    swapPlayerInCurrentRound,
    sessionAdjustments,
    resetDynamicPairing,
  };
}
