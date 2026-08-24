import type { ChangeEvent } from 'react';
import type {
  PairingStyle,
  PoolKnockoutSettings,
  SessionTiming,
  SocialFormat,
  SocialScoringMode,
  TournamentFormat,
  TournamentSettings,
} from '../types';
import { playersPerTeam, teamsNeededFor } from '../utils/poolsKnockout';
import {
  calculateSessionPlan,
  MAX_GAME_TIME_MINUTES,
  MIN_GAME_TIME_MINUTES,
  socialScoringModeLabel,
  validateSessionTiming,
} from '../utils/tournament';
import { CourtSelector } from './CourtSelector';

interface TournamentSetupProps {
  settings: TournamentSettings;
  onChange: (settings: TournamentSettings) => void;
  // Individual (not-yet-teamed) player count and declared fixed-team
  // count — for the Pools & Knockout live summary, which needs both to
  // show how many teams the current mixed roster adds up to. See App.tsx.
  playerCount: number;
  fixedTeamCount: number;
  // True once Start Matches has been clicked. Only the Tournament Format
  // toggle locks in this state — everything else keeps its existing
  // "editable any time, applies going forward" behaviour.
  tournamentInProgress: boolean;
}

const SOCIAL_SCORING_MODES: SocialScoringMode[] = ['none', 'scoresOnly', 'scoresAndWins'];

// Setup fields 1–3 (see App.tsx for the full page order): Format (Social
// Format and/or Tournament Format + Pool/Knockout Setup) and Doubles
// Pairing Mode. Number of Courts is its own separate card, rendered right
// after this one. Player/Team setup and Social Play timing sit further
// down in App.tsx — see RosterSetup and SocialSessionSetup below.
//
// Match Type (Singles/Doubles) and Play Mode (Tournament/Social) used to
// live here as toggles — both are gone now: matchType silently defaults to
// 'doubles' (see useTournament's DEFAULT_SETTINGS) with no UI to change it
// back (singles logic itself is untouched, just not reachable from the UI —
// easy to re-expose later if needed), and picking Tournament vs. Social now
// happens directly from the top nav (see App.tsx's handleGoToTournamentSetup
// / handleGoToSocialSetup), which also sets playMode before landing here.
export function TournamentSetup({ settings, onChange, playerCount, fixedTeamCount, tournamentInProgress }: TournamentSetupProps) {
  const isPoolsKnockout = settings.playMode === 'tournament' && settings.tournamentFormat === 'pools-knockout';
  const isDynamicTeamQualifier = settings.playMode === 'tournament' && settings.tournamentFormat === 'dynamic-team-qualifier';
  const isKingCourt = settings.playMode === 'king-court-5';
  // "Social Play Mode" is a UI grouping over two underlying playMode
  // values — 'social' (Standard Social Play / Dynamic Pairing Social) and
  // 'king-court-5' (5-Player King Court, shown here as a third Social
  // Format for discoverability) — see the Social Format toggle below and
  // SocialFormat in ../types.ts for why King Court's own playMode value is
  // left completely untouched by this grouping.
  const isSocialGroup = settings.playMode === 'social' || isKingCourt;
  const activeSocialFormat: SocialFormat = isKingCourt ? 'king-court-5' : (settings.socialFormat ?? 'standard-social');
  const isDynamicPairingSocial = settings.playMode === 'social' && activeSocialFormat === 'dynamic-pairing-social';

  function handleSocialFormatChange(format: SocialFormat) {
    if (format === 'king-court-5') {
      // King Court's own logic (App.tsx, useKingCourt, KingCourtSetup, ...)
      // all keys off playMode === 'king-court-5' directly and is otherwise
      // completely unchanged — this just gets there via the Social Format
      // toggle instead of a flat top-level button.
      onChange({ ...settings, playMode: 'king-court-5', socialFormat: format });
    } else {
      onChange({ ...settings, playMode: 'social', socialFormat: format });
    }
  }

  function handleFormatChange(tournamentFormat: TournamentFormat) {
    onChange({ ...settings, tournamentFormat });
  }

  function handlePairingStyleChange(pairingStyle: PairingStyle) {
    onChange({ ...settings, pairingStyle });
  }

  return (
    <section className="card">
      {isDynamicPairingSocial && (
        <p className="hint">Dynamic Pairing Social is doubles only — each court seats 4 players.</p>
      )}

      {isDynamicTeamQualifier && (
        <p className="hint">Dynamic Team Qualifier is fixed-partner doubles only — teams, not individual players, are the ranking unit.</p>
      )}

      {isSocialGroup && (
        <div className="form-row">
          <span>Social Format</span>
          <div className="toggle-group" role="group" aria-label="Social format">
            <button
              type="button"
              className={activeSocialFormat === 'standard-social' ? 'toggle-option active toggle-option-green' : 'toggle-option'}
              onClick={() => handleSocialFormatChange('standard-social')}
            >
              Standard Social Play
            </button>
            <button
              type="button"
              className={
                activeSocialFormat === 'dynamic-pairing-social' ? 'toggle-option active toggle-option-green' : 'toggle-option'
              }
              onClick={() => handleSocialFormatChange('dynamic-pairing-social')}
            >
              Dynamic Pairing Social
            </button>
            <button
              type="button"
              className={activeSocialFormat === 'king-court-5' ? 'toggle-option active toggle-option-green' : 'toggle-option'}
              onClick={() => handleSocialFormatChange('king-court-5')}
            >
              5-Player King Court
            </button>
          </div>
          <p className="hint">
            {activeSocialFormat === 'standard-social' &&
              'Casual: focuses on fair rotation and even game time. Ranking is de-emphasised.'}
            {activeSocialFormat === 'dynamic-pairing-social' &&
              'Doubles only: grading rounds establish rankings, then courts, partners, and opponents are reassigned every round to keep matches competitive and balanced — see the Dynamic Pairing Social setup below.'}
            {activeSocialFormat === 'king-court-5' &&
              'Fixed 5-player courts running 5-game doubles cycles, with rank-based movement between courts after each cycle.'}
          </p>
        </div>
      )}

      {settings.playMode === 'tournament' && (
        <div className="form-row">
          <span>Tournament Format</span>
          <div className="toggle-group" role="group" aria-label="Tournament format">
            <button
              type="button"
              className={settings.tournamentFormat === 'leaderboard' ? 'toggle-option active' : 'toggle-option'}
              onClick={() => handleFormatChange('leaderboard')}
              disabled={tournamentInProgress}
            >
              Leaderboard
            </button>
            <button
              type="button"
              className={
                settings.tournamentFormat === 'pools-knockout' ? 'toggle-option active toggle-option-green' : 'toggle-option'
              }
              onClick={() => handleFormatChange('pools-knockout')}
              disabled={tournamentInProgress}
            >
              Pools & Knockout
            </button>
            <button
              type="button"
              className={
                settings.tournamentFormat === 'dynamic-team-qualifier' ? 'toggle-option active toggle-option-green' : 'toggle-option'
              }
              onClick={() => handleFormatChange('dynamic-team-qualifier')}
              disabled={tournamentInProgress}
            >
              Dynamic Team Qualifier
            </button>
          </div>
          <p className="hint">
            {settings.tournamentFormat === 'leaderboard' &&
              'Everyone plays rotating rounds, ranked by total points, wins, and byes.'}
            {settings.tournamentFormat === 'pools-knockout' &&
              'Fixed teams play round-robin pools, then the top teams face off in a single-elimination knockout bracket.'}
            {settings.tournamentFormat === 'dynamic-team-qualifier' &&
              'Fixed doubles teams play a dynamic, results-based qualifying stage with a fair rest rotation, then the top 4 face off in a Semis / Gold / Bronze medal bracket — see the setup card below.'}
          </p>
        </div>
      )}

      {isPoolsKnockout && (
        <PoolKnockoutSetupSection settings={settings} onChange={onChange} playerCount={playerCount} fixedTeamCount={fixedTeamCount} />
      )}

      {isDynamicTeamQualifier && (
        <p className="hint">
          Division name, courts, qualifying rounds, bracket scoring, team registration, and check-in are all on the
          cards below.
        </p>
      )}

      {!isKingCourt && settings.playMode === 'tournament' && settings.tournamentFormat === 'leaderboard' && (
        <div className="form-row">
          <span>Pairing Style</span>
          <div className="toggle-group" role="group" aria-label="Pairing style">
            <button
              type="button"
              className={settings.pairingStyle === 'balanced' ? 'toggle-option active' : 'toggle-option'}
              onClick={() => handlePairingStyleChange('balanced')}
            >
              Balanced
            </button>
            <button
              type="button"
              className={settings.pairingStyle === 'leaderboard-based' ? 'toggle-option active' : 'toggle-option'}
              onClick={() => handlePairingStyleChange('leaderboard-based')}
            >
              Leaderboard-based
            </button>
            <button
              type="button"
              className={settings.pairingStyle === 'random' ? 'toggle-option active' : 'toggle-option'}
              onClick={() => handlePairingStyleChange('random')}
            >
              Random
            </button>
          </div>
          <p className="hint">
            {settings.pairingStyle === 'balanced' &&
              'Fair matches by rating/current performance, avoiding repeat opponents and partners where possible.'}
            {settings.pairingStyle === 'leaderboard-based' &&
              'Pairs competitors with similar current ranking (1st vs. 2nd, 3rd vs. 4th, ...) — for rotating Doubles this guides balanced team formation instead of pitting top-ranked players against each other directly.'}
            {settings.pairingStyle === 'random' &&
              'Shuffled pairings each round, still respecting court capacity and bye fairness.'}
          </p>
        </div>
      )}

    </section>
  );
}

interface NumberOfCourtsSetupProps {
  settings: TournamentSettings;
  onChange: (settings: TournamentSettings) => void;
  isKingCourt: boolean;
  isDynamicPairingSocial: boolean;
  isDynamicTeamQualifier: boolean;
}

// Its own card (previously the tail end of the Session Setup card above) —
// King Court, Dynamic Pairing Social, and Dynamic Team Qualifier each set
// their court count from their own dedicated setup card instead, so this
// one just explains where to look for those three rather than rendering
// the shared CourtSelector.
export function NumberOfCourtsSetup({
  settings,
  onChange,
  isKingCourt,
  isDynamicPairingSocial,
  isDynamicTeamQualifier,
}: NumberOfCourtsSetupProps) {
  return (
    <section className="card">
      <h2>Number of Courts</h2>

      {!isKingCourt && !isDynamicPairingSocial && !isDynamicTeamQualifier && (
        <CourtSelector value={settings.courts} onChange={(courts) => onChange({ ...settings, courts })} />
      )}

      {isKingCourt && (
        <p className="hint">Number of courts and player seeding for King Court are set below, on the King Court Setup card.</p>
      )}

      {isDynamicPairingSocial && (
        <p className="hint">
          Session name, number of courts, players, and every other Dynamic Pairing Social setting are on the card below.
        </p>
      )}

      {isDynamicTeamQualifier && (
        <p className="hint">Number of courts is set below, on the Dynamic Team Qualifier setup card.</p>
      )}
    </section>
  );
}

interface SocialSessionSetupProps {
  settings: TournamentSettings;
  onChange: (settings: TournamentSettings) => void;
}

// Setup field 7 (see App.tsx): Social Scoring + Session Timing, both
// Social Play only. Rendered after the player/team roster (field 6), so
// this is a separate component from TournamentSetup above rather than
// part of it.
export function SocialSessionSetup({ settings, onChange }: SocialSessionSetupProps) {
  function handleSocialScoringChange(socialScoringMode: SocialScoringMode) {
    onChange({ ...settings, socialScoringMode });
  }

  return (
    <section className="card">
      <div className="form-row">
        <span>Scoring</span>
        <div className="toggle-group" role="group" aria-label="Social scoring mode">
          {SOCIAL_SCORING_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={settings.socialScoringMode === mode ? 'toggle-option active' : 'toggle-option'}
              onClick={() => handleSocialScoringChange(mode)}
            >
              {socialScoringModeLabel(mode)}
            </button>
          ))}
        </div>
        <p className="hint">
          {settings.socialScoringMode === 'none' && 'No score entry — just generate rounds and rotate players fairly.'}
          {settings.socialScoringMode === 'scoresOnly' &&
            'Scores and total points are tracked, but players are not ranked competitively.'}
          {settings.socialScoringMode === 'scoresAndWins' &&
            'Scores, points, wins, and losses are tracked — still shown as casual Player Stats, not a leaderboard.'}
        </p>
      </div>

      <SessionTimingSection settings={settings} onChange={onChange} />
    </section>
  );
}

interface SessionTimingSectionProps {
  settings: TournamentSettings;
  onChange: (settings: TournamentSettings) => void;
}

// Social Play only: lets the user enter their booked court time and how
// long each game + changeover takes, and shows the resulting estimated
// round count up front. Purely a planning aid — see calculateSessionPlan;
// there's no live countdown timer.
function SessionTimingSection({ settings, onChange }: SessionTimingSectionProps) {
  const timing = settings.sessionTiming;
  const plan = calculateSessionPlan(timing);
  const validation = validateSessionTiming(timing);

  function handleTimingChange(field: keyof SessionTiming, event: ChangeEvent<HTMLInputElement>) {
    const parsed = parseInt(event.target.value, 10);
    onChange({
      ...settings,
      sessionTiming: { ...timing, [field]: Number.isNaN(parsed) ? 0 : parsed },
    });
  }

  return (
    <div className="form-row">
      <span>Session Timing</span>

      <div className="timing-grid">
        <label className="timing-field">
          Session time (minutes)
          <input
            type="number"
            min={1}
            value={timing.sessionTimeMinutes}
            onChange={(event) => handleTimingChange('sessionTimeMinutes', event)}
            aria-label="Session time in minutes"
          />
        </label>
        <label className="timing-field">
          Game time (minutes)
          <input
            type="number"
            min={MIN_GAME_TIME_MINUTES}
            max={MAX_GAME_TIME_MINUTES}
            value={timing.gameTimeMinutes}
            onChange={(event) => handleTimingChange('gameTimeMinutes', event)}
            aria-label="Game time in minutes"
          />
        </label>
        <label className="timing-field">
          Buffer time (minutes)
          <input
            type="number"
            min={0}
            value={timing.bufferTimeMinutes}
            onChange={(event) => handleTimingChange('bufferTimeMinutes', event)}
            aria-label="Buffer time in minutes"
          />
        </label>
      </div>

      <p className="session-timing-summary">
        Based on a {timing.sessionTimeMinutes}-minute session, {timing.gameTimeMinutes}-minute games, and{' '}
        {timing.bufferTimeMinutes}-minute buffers, you can run approximately{' '}
        <strong>
          {plan.estimatedRounds} round{plan.estimatedRounds === 1 ? '' : 's'}
        </strong>{' '}
        with {plan.remainingTimeMinutes} minute{plan.remainingTimeMinutes === 1 ? '' : 's'} remaining.
      </p>

      {!validation.ok && <p className="hint error">{validation.reason}</p>}
      <p className="hint">
        Game time must be {MIN_GAME_TIME_MINUTES}–{MAX_GAME_TIME_MINUTES} minutes. A 1–2 minute buffer is
        suggested (0 is allowed).
      </p>
    </div>
  );
}

interface PoolKnockoutSetupSectionProps {
  settings: TournamentSettings;
  onChange: (settings: TournamentSettings) => void;
  // Individual (not-yet-teamed) player count and declared fixed-team
  // count — see App.tsx/RosterSetup. For Singles, fixedTeamCount is always
  // 0 (no fixed-teams concept there).
  playerCount: number;
  fixedTeamCount: number;
}

// Pools & Knockout only: number of pools, teams per pool, how many times
// each pair of teams in a pool plays each other, and how many teams
// advance from each pool — plus a live summary of how many teams that adds
// up to needing. Purely a planning aid, same spirit as SessionTimingSection
// above. Doubles teams come from both the declared fixed-teams roster
// (used directly) and individual players (auto-paired two at a time when
// the tournament starts) — same mixed roster as every other Doubles mode,
// see ParticipantSetup/formTeams.
function PoolKnockoutSetupSection({ settings, onChange, playerCount, fixedTeamCount }: PoolKnockoutSetupSectionProps) {
  const pk = settings.poolKnockoutSettings;
  const teamsNeeded = teamsNeededFor(pk);
  const isDoubles = settings.matchType === 'doubles';
  const perTeam = playersPerTeam(settings.matchType);
  const playersNeeded = teamsNeeded * perTeam;
  const knockoutSize = pk.numberOfPools * pk.teamsAdvancingPerPool;
  const teamsFromPlayers = isDoubles ? Math.floor(playerCount / 2) : playerCount;
  const currentTeams = isDoubles ? fixedTeamCount + teamsFromPlayers : playerCount;
  const oddPlayerOut = isDoubles && playerCount % 2 !== 0;

  function handleChange(field: keyof PoolKnockoutSettings, event: ChangeEvent<HTMLInputElement>) {
    const parsed = parseInt(event.target.value, 10);
    onChange({
      ...settings,
      poolKnockoutSettings: { ...pk, [field]: Number.isNaN(parsed) ? 0 : parsed },
    });
  }

  return (
    <div className="form-row">
      <span>Pools & Knockout Setup</span>

      <div className="timing-grid">
        <label className="timing-field">
          Number of pools
          <input
            type="number"
            min={1}
            value={pk.numberOfPools}
            onChange={(event) => handleChange('numberOfPools', event)}
            aria-label="Number of pools"
          />
        </label>
        <label className="timing-field">
          Teams per pool
          <input
            type="number"
            min={2}
            value={pk.teamsPerPool}
            onChange={(event) => handleChange('teamsPerPool', event)}
            aria-label="Teams per pool"
          />
        </label>
        <label className="timing-field">
          Times each team plays each other
          <input
            type="number"
            min={1}
            value={pk.timesEachTeamPlays}
            onChange={(event) => handleChange('timesEachTeamPlays', event)}
            aria-label="Times each team plays each other"
          />
        </label>
        <label className="timing-field">
          Teams advancing per pool
          <input
            type="number"
            min={1}
            value={pk.teamsAdvancingPerPool}
            onChange={(event) => handleChange('teamsAdvancingPerPool', event)}
            aria-label="Teams advancing per pool"
          />
        </label>
      </div>

      <p className="session-timing-summary">
        {pk.numberOfPools} pool{pk.numberOfPools === 1 ? '' : 's'} × {pk.teamsPerPool} teams needs{' '}
        <strong>
          {teamsNeeded} team{teamsNeeded === 1 ? '' : 's'}
        </strong>{' '}
        {isDoubles
          ? `— you have ${currentTeams} (${fixedTeamCount} fixed team${fixedTeamCount === 1 ? '' : 's'} + ${playerCount} individual player${playerCount === 1 ? '' : 's'} → ${teamsFromPlayers} more team${teamsFromPlayers === 1 ? '' : 's'})`
          : `— ${playersNeeded} player${playersNeeded === 1 ? '' : 's'} in Singles (you have ${playerCount})`}
        . Top {pk.teamsAdvancingPerPool} from each pool advances to a {knockoutSize}-team knockout bracket.
      </p>

      {pk.teamsAdvancingPerPool > pk.teamsPerPool && (
        <p className="hint error">Teams advancing per pool cannot be more than teams per pool.</p>
      )}
      {knockoutSize < 2 && <p className="hint error">At least 2 teams total must advance to the knockout bracket.</p>}
      {oddPlayerOut && (
        <p className="hint error">
          {playerCount} individual players can't be paired up evenly — add one more, or check two players to make a
          team.
        </p>
      )}
      {isDoubles
        ? !oddPlayerOut &&
          currentTeams !== teamsNeeded && (
            <p className="hint error">
              You have {currentTeams} team{currentTeams === 1 ? '' : 's'}, but this setup needs exactly {teamsNeeded}.
            </p>
          )
        : playerCount !== playersNeeded && (
            <p className="hint error">
              You have {playerCount} player{playerCount === 1 ? '' : 's'}, but this setup needs exactly {playersNeeded}.
            </p>
          )}
    </div>
  );
}
