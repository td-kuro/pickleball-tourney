import type { ChangeEvent } from 'react';
import type { MatchType, PlayMode, SocialScoringMode, TournamentSettings } from '../types';
import { maxPlayersForRound, playersNeededPerMatch, socialScoringModeLabel } from '../utils/tournament';

interface TournamentSetupProps {
  settings: TournamentSettings;
  onChange: (settings: TournamentSettings) => void;
  playerCount: number;
}

const SOCIAL_SCORING_MODES: SocialScoringMode[] = ['none', 'scoresOnly', 'scoresAndWins'];

export function TournamentSetup({ settings, onChange, playerCount }: TournamentSetupProps) {
  const perCourt = playersNeededPerMatch(settings.matchType);
  const maxPlayers = maxPlayersForRound(settings);

  function handlePlayModeChange(playMode: PlayMode) {
    onChange({ ...settings, playMode });
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
            className={settings.playMode === 'social' ? 'toggle-option active' : 'toggle-option'}
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

      <p className="hint">
        {settings.courts} court{settings.courts === 1 ? '' : 's'} × {perCourt} players per court = up to{' '}
        {maxPlayers} players per round ({playerCount} player{playerCount === 1 ? '' : 's'} added).
      </p>
    </section>
  );
}
