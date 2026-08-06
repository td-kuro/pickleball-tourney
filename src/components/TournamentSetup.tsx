import type { ChangeEvent } from 'react';
import type {
  MatchType,
  PlayMode,
  PoolKnockoutSettings,
  SessionTiming,
  SocialScoringMode,
  TournamentFormat,
  TournamentSettings,
} from '../types';
import { playersPerTeam, teamsNeededFor } from '../utils/poolsKnockout';
import {
  calculateSessionPlan,
  maxPlayersForRound,
  MAX_GAME_TIME_MINUTES,
  MIN_GAME_TIME_MINUTES,
  playersNeededPerMatch,
  socialScoringModeLabel,
  validateSessionTiming,
} from '../utils/tournament';

interface TournamentSetupProps {
  settings: TournamentSettings;
  onChange: (settings: TournamentSettings) => void;
  playerCount: number;
  // True once Start Matches has been clicked. Only the (new) Tournament
  // Format toggle locks in this state — everything else keeps its existing
  // "editable any time, applies going forward" behaviour.
  tournamentInProgress: boolean;
}

const SOCIAL_SCORING_MODES: SocialScoringMode[] = ['none', 'scoresOnly', 'scoresAndWins'];

export function TournamentSetup({ settings, onChange, playerCount, tournamentInProgress }: TournamentSetupProps) {
  const perCourt = playersNeededPerMatch(settings.matchType);
  const maxPlayers = maxPlayersForRound(settings);
  const isPoolsKnockout = settings.playMode === 'tournament' && settings.tournamentFormat === 'pools-knockout';

  function handlePlayModeChange(playMode: PlayMode) {
    onChange({ ...settings, playMode });
  }

  function handleFormatChange(tournamentFormat: TournamentFormat) {
    onChange({ ...settings, tournamentFormat });
  }

  function handleSocialScoringChange(socialScoringMode: SocialScoringMode) {
    onChange({ ...settings, socialScoringMode });
  }

  function handleCourtsChange(event: ChangeEvent<HTMLInputElement>) {
    const parsed = parseInt(event.target.value, 10);
    const courts = Number.isNaN(parsed) ? 1 : Math.max(1, parsed);
    onChange({ ...settings, courts });
  }

  function handleMatchTypeChange(matchType: MatchType) {
    onChange({ ...settings, matchType });
  }

  return (
    <section className="card">
      <h2>Session Setup</h2>

      <div className="form-row">
        <span>Play Mode</span>
        <div className="toggle-group" role="group" aria-label="Play mode">
          <button
            type="button"
            className={settings.playMode === 'tournament' ? 'toggle-option active' : 'toggle-option'}
            onClick={() => handlePlayModeChange('tournament')}
          >
            Tournament Mode
          </button>
          <button
            type="button"
            className={settings.playMode === 'social' ? 'toggle-option active toggle-option-green' : 'toggle-option'}
            onClick={() => handlePlayModeChange('social')}
          >
            Social Play Mode
          </button>
        </div>
        <p className="hint">
          {settings.playMode === 'tournament'
            ? 'Competitive: tracks points, wins/losses, and a ranked leaderboard.'
            : 'Casual: focuses on fair rotation and even game time. Ranking is de-emphasised.'}
        </p>
      </div>

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
          </div>
          <p className="hint">
            {settings.tournamentFormat === 'leaderboard'
              ? 'Everyone plays rotating rounds, ranked by total points, wins, and byes.'
              : 'Fixed teams play round-robin pools, then the top teams face off in a single-elimination knockout bracket.'}
          </p>
        </div>
      )}

      {isPoolsKnockout && <PoolKnockoutSetupSection settings={settings} onChange={onChange} playerCount={playerCount} />}

      {settings.playMode === 'social' && (
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
            {settings.socialScoringMode === 'none' &&
              'No score entry — just generate rounds and rotate players fairly.'}
            {settings.socialScoringMode === 'scoresOnly' &&
              'Scores and total points are tracked, but players are not ranked competitively.'}
            {settings.socialScoringMode === 'scoresAndWins' &&
              'Scores, points, wins, and losses are tracked — still shown as casual Player Stats, not a leaderboard.'}
          </p>
        </div>
      )}

      {settings.playMode === 'social' && <SessionTimingSection settings={settings} onChange={onChange} />}

      <div className="form-row">
        <label htmlFor="courts">Number of Courts</label>
        <input id="courts" type="number" min={1} value={settings.courts} onChange={handleCourtsChange} />
      </div>

      <div className="form-row">
        <span>Match Type</span>
        <div className="toggle-group" role="group" aria-label="Match type">
          <button
            type="button"
            className={settings.matchType === 'singles' ? 'toggle-option active' : 'toggle-option'}
            onClick={() => handleMatchTypeChange('singles')}
          >
            Singles
          </button>
          <button
            type="button"
            className={settings.matchType === 'doubles' ? 'toggle-option active' : 'toggle-option'}
            onClick={() => handleMatchTypeChange('doubles')}
          >
            Doubles
          </button>
        </div>
      </div>

      {!isPoolsKnockout && (
        <p className="hint">
          {settings.courts} court{settings.courts === 1 ? '' : 's'} × {perCourt} players per court = up to{' '}
          {maxPlayers} players per round ({playerCount} player{playerCount === 1 ? '' : 's'} added).
        </p>
      )}
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
  playerCount: number;
}

// Pools & Knockout only: number of pools, teams per pool, how many times
// each pair of teams in a pool plays each other, and how many teams
// advance from each pool — plus a live summary of how many teams/players
// that adds up to needing. Purely a planning aid, same spirit as
// SessionTimingSection above.
function PoolKnockoutSetupSection({ settings, onChange, playerCount }: PoolKnockoutSetupSectionProps) {
  const pk = settings.poolKnockoutSettings;
  const teamsNeeded = teamsNeededFor(pk);
  const perTeam = playersPerTeam(settings.matchType);
  const playersNeeded = teamsNeeded * perTeam;
  const knockoutSize = pk.numberOfPools * pk.teamsAdvancingPerPool;

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
        — {playersNeeded} player{playersNeeded === 1 ? '' : 's'} in {settings.matchType === 'singles' ? 'Singles' : 'Doubles'}{' '}
        (you have {playerCount}). Top {pk.teamsAdvancingPerPool} from each pool advances to a {knockoutSize}-team
        knockout bracket.
      </p>

      {pk.teamsAdvancingPerPool > pk.teamsPerPool && (
        <p className="hint error">Teams advancing per pool cannot be more than teams per pool.</p>
      )}
      {knockoutSize < 2 && <p className="hint error">At least 2 teams total must advance to the knockout bracket.</p>}
      {playerCount !== playersNeeded && (
        <p className="hint error">
          You have {playerCount} player{playerCount === 1 ? '' : 's'}, but this setup needs exactly {playersNeeded}.
        </p>
      )}
    </div>
  );
}
