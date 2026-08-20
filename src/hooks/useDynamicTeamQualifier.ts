import { useState } from 'react';
import type {
  AuditEvent,
  DynamicTeam,
  DynamicTeamQualifierSettings,
  DynamicTeamQualifierStage,
  MedalBracket,
  MedalBracketMatchLabel,
  QualifyingRound,
  RestAssignment,
} from '../types';
import {
  DEFAULT_DYNAMIC_TEAM_QUALIFIER_SETTINGS,
  calculateFinalStandings,
  closeQualifyingRound,
  generateMedalBracket,
  generateNextQualifyingRound,
  generateTeamCodes,
  getPlayedTeamIds,
  isMedalBracketComplete,
  isQualifyingComplete,
  isQualifyingRoundComplete,
  lockQualifyingRound,
  lockRosterAndStartQualifying,
  makeRandomSeed,
  processBracketResult,
  processQualifyingResult,
} from '../utils/dynamicTeamQualifier';
import { useLocalStorage } from './useLocalStorage';

const SETTINGS_KEY = 'pickleball-tourney:dtq:settings';
const TEAMS_KEY = 'pickleball-tourney:dtq:teams';
const REST_KEY = 'pickleball-tourney:dtq:restAssignments';
const ROUNDS_KEY = 'pickleball-tourney:dtq:rounds';
const BRACKET_KEY = 'pickleball-tourney:dtq:medalBracket';
const STAGE_KEY = 'pickleball-tourney:dtq:stage';
const AUDIT_KEY = 'pickleball-tourney:dtq:auditEvents';

function makeTeamId(): string {
  return `dtq-team-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function makeAuditId(): string {
  return `dtq-audit-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function teamDisplayName(teamName: string, playerAName: string, playerBName: string): string {
  const trimmed = teamName.trim();
  return trimmed !== '' ? trimmed : `${playerAName} / ${playerBName}`;
}

// Dynamic Team Qualifier's own team roster, settings, rest schedule, rounds,
// and medal bracket — entirely separate from usePlayers/useTeams/
// useTournament/usePoolsKnockout (own localStorage keys, own shape) so this
// format can't affect, or be affected by, any other mode. See
// utils/dynamicTeamQualifier.ts for the pairing/standings/rest/bracket logic
// this hook drives, and README.md's "Dynamic Team Qualifier" section for the
// full stage-by-stage write-up.
export function useDynamicTeamQualifier() {
  const [settings, setSettings] = useLocalStorage<DynamicTeamQualifierSettings>(SETTINGS_KEY, DEFAULT_DYNAMIC_TEAM_QUALIFIER_SETTINGS);
  const [teams, setTeams] = useLocalStorage<DynamicTeam[]>(TEAMS_KEY, []);
  const [restAssignments, setRestAssignments] = useLocalStorage<RestAssignment[]>(REST_KEY, []);
  const [rounds, setRounds] = useLocalStorage<QualifyingRound[]>(ROUNDS_KEY, []);
  const [medalBracket, setMedalBracket] = useLocalStorage<MedalBracket | null>(BRACKET_KEY, null);
  const [stage, setStage] = useLocalStorage<DynamicTeamQualifierStage>(STAGE_KEY, 'setup');
  const [auditEvents, setAuditEvents] = useLocalStorage<AuditEvent[]>(AUDIT_KEY, []);
  // Ephemeral only (not persisted) — the reason the last startQualifying()
  // attempt failed, if any, so the Setup screen can show it next to a
  // "Regenerate Rest Schedule" retry button. Cleared on the next attempt.
  const [startError, setStartError] = useState<string | null>(null);

  const started = stage !== 'setup';
  // Partner-change locking (see DynamicTeam.partnerLocked) is derived live
  // from match history rather than stored/mutated on the team record
  // itself — same "single source of truth" reasoning as everywhere else in
  // this hook.
  const playedTeamIds = getPlayedTeamIds(rounds);
  const teamsWithLockState: DynamicTeam[] = teams.map((t) => ({ ...t, partnerLocked: playedTeamIds.has(t.id) }));

  const currentRound = rounds.find((r) => r.status === 'current');
  const closedRound = rounds.find((r) => r.status === 'completed');
  const allMatches = rounds.flatMap((r) => r.matches);

  // Quickly generates `count` empty team slots (named "T01 Player 1"/
  // "T01 Player 2" using each slot's own team code, mirroring
  // useDynamicPairingSocial.addPlayersBulk's "Player N") so the organiser
  // can fill in real names/ratings/seeds afterward instead of adding one
  // team at a time — also how a single "+ Add Team" click adds one slot
  // (count=1).
  function addTeamsBulk(count: number) {
    const codes = generateTeamCodes(teams.length + count).slice(teams.length);
    const newTeams: DynamicTeam[] = codes.map((teamCode, i) => {
      const playerAName = `${teamCode} Player 1`;
      const playerBName = `${teamCode} Player 2`;
      return {
        id: `${makeTeamId()}-${i}`,
        teamCode,
        displayName: teamDisplayName('', playerAName, playerBName),
        playerAName,
        playerBName,
        checkedIn: false,
        withdrawn: false,
        partnerLocked: false,
      };
    });
    setTeams([...teams, ...newTeams]);
  }

  function updateTeam(id: string, playerAName: string, playerBName: string, teamName: string, rating?: number, seed?: number) {
    setTeams(
      teams.map((t) =>
        t.id === id ? { ...t, playerAName, playerBName, displayName: teamDisplayName(teamName, playerAName, playerBName), rating, seed } : t,
      ),
    );
  }

  function setCheckedIn(id: string, checkedIn: boolean) {
    setTeams(teams.map((t) => (t.id === id ? { ...t, checkedIn } : t)));
  }

  // Checks in every non-withdrawn team at once (a single setTeams call, not
  // a loop of individual setCheckedIn calls — those would each read the
  // same stale `teams` closure and only the last one would stick). Mirrors
  // each row's own checkbox, which is likewise disabled for withdrawn
  // teams — see DynamicTeamRow.
  function checkInAllTeams() {
    setTeams(teams.map((t) => (t.withdrawn ? t : { ...t, checkedIn: true })));
  }

  // Functional pre-tournament (see DynamicTeam.withdrawn) — mid-tournament
  // withdrawal/injury retirement stays a disabled "Coming later" control in
  // the UI once qualifying has started (see DynamicTeamRoster).
  function setWithdrawn(id: string, withdrawn: boolean) {
    setTeams(teams.map((t) => (t.id === id ? { ...t, withdrawn, checkedIn: withdrawn ? false : t.checkedIn } : t)));
    setAuditEvents([
      ...auditEvents,
      { id: makeAuditId(), timestamp: Date.now(), eventType: withdrawn ? 'team-withdrawn' : 'team-reinstated', newValue: id },
    ]);
  }

  function removeTeam(id: string) {
    setTeams(teams.filter((t) => t.id !== id));
  }

  function removeAllTeams() {
    setTeams([]);
  }

  function updateSettings(next: DynamicTeamQualifierSettings) {
    setSettings(next);
  }

  // Rolls a genuinely fresh random seed — every *use* of a seed elsewhere is
  // deterministic (see makeSeededRandom in utils/dynamicTeamQualifier.ts),
  // so this is what actually makes "Regenerate Rest Schedule" try something
  // different rather than reproducing the exact same schedule.
  function regenerateRandomSeed() {
    setSettings({ ...settings, randomSeed: makeRandomSeed() });
  }

  // "Start Qualifying": locks the checked-in roster, generates the full
  // rest schedule for every qualifying round, and generates Round 1's
  // pairings — see lockRosterAndStartQualifying. On failure (roster
  // invalid, or the rest schedule couldn't validate even after internal
  // retries), nothing is persisted and the reason is surfaced via
  // `startError` so the Setup screen can offer "Regenerate Rest Schedule".
  function startQualifying(): { ok: true } | { ok: false; reason: string } {
    const result = lockRosterAndStartQualifying(teams, settings);
    if (!result.ok) {
      setStartError(result.reason);
      return result;
    }
    setStartError(null);
    setRounds(result.rounds);
    setRestAssignments(result.restAssignments);
    setStage('qualifying');
    return { ok: true };
  }

  function setMatchScore(
    matchId: string,
    result: { scoreA?: number; scoreB?: number; winnerId?: string; goldenPoint?: boolean; forfeit?: boolean },
  ) {
    setRounds(
      rounds.map((round) => ({
        ...round,
        matches: round.matches.map((match) => (match.id === matchId ? processQualifyingResult(match, result) : match)),
      })),
    );
  }

  // "Close Round" (Director Dashboard). Closing the *last* qualifying round
  // has nothing left to generate, so it locks immediately and moves
  // straight to Final Standings — every other round just becomes
  // 'completed' and waits for a separate "Generate Next Round" click (see
  // generateNextRound below).
  function closeCurrentRound() {
    if (!currentRound || !isQualifyingRoundComplete(currentRound)) return;
    const isLastRound = currentRound.roundNumber === settings.qualifyingRounds;
    if (isLastRound) {
      setRounds(rounds.map((r) => (r.roundNumber === currentRound.roundNumber ? lockQualifyingRound(r) : r)));
      setStage('final-standings');
    } else {
      setRounds(rounds.map((r) => (r.roundNumber === currentRound.roundNumber ? closeQualifyingRound(r) : r)));
    }
  }

  // "Generate Next Round" (Director Dashboard) — only enabled once the
  // current round is closed (see closeCurrentRound). Returns the failure
  // reason (if any) so the Dashboard can show a blocking warning instead of
  // silently doing nothing — see generateNextQualifyingRound.
  function generateNextRound(): { ok: true } | { ok: false; reason: string } {
    const result = generateNextQualifyingRound(teams, rounds, restAssignments, settings.randomSeed);
    if (!result.ok) return result;
    setRounds(result.rounds);
    setRestAssignments(result.restAssignments);
    return { ok: true };
  }

  // "Generate Medal Bracket" (Director Dashboard) — only reachable once
  // every qualifying round is locked (stage === 'final-standings').
  function startMedalBracket() {
    if (stage !== 'final-standings') return;
    const activeTeamIds = teams.filter((t) => t.checkedIn && !t.withdrawn).map((t) => t.id);
    const finalStandings = calculateFinalStandings(activeTeamIds, allMatches, restAssignments);
    setMedalBracket(generateMedalBracket(finalStandings));
    setStage('medal-bracket');
  }

  function setBracketScore(label: MedalBracketMatchLabel, scoreA: number, scoreB: number) {
    if (!medalBracket) return;
    const updated = processBracketResult(medalBracket, label, scoreA, scoreB);
    setMedalBracket(updated);
    if (isMedalBracketComplete(updated)) setStage('complete');
  }

  // Full session wipe for "Reset Dynamic Team Qualifier" — clears the
  // roster, settings, rest schedule, every round/score, and the medal
  // bracket (standings/final-standings are derived, so clearing rounds
  // clears them too).
  function resetDynamicTeamQualifier() {
    setSettings(DEFAULT_DYNAMIC_TEAM_QUALIFIER_SETTINGS);
    setTeams([]);
    setRestAssignments([]);
    setRounds([]);
    setMedalBracket(null);
    setStage('setup');
    setAuditEvents([]);
    setStartError(null);
  }

  return {
    settings,
    updateSettings,
    regenerateRandomSeed,
    teams: teamsWithLockState,
    addTeamsBulk,
    updateTeam,
    setCheckedIn,
    checkInAllTeams,
    setWithdrawn,
    removeTeam,
    removeAllTeams,
    restAssignments,
    rounds,
    currentRound,
    closedRound,
    medalBracket,
    stage,
    started,
    startError,
    qualifyingComplete: isQualifyingComplete(rounds, settings.qualifyingRounds),
    startQualifying,
    setMatchScore,
    closeCurrentRound,
    generateNextRound,
    startMedalBracket,
    setBracketScore,
    resetDynamicTeamQualifier,
  };
}
