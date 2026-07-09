import type { ChangeEvent } from 'react';
import type { MatchType, TournamentSettings } from '../types';
import { maxPlayersForRound, playersNeededPerMatch } from '../utils/tournament';

interface TournamentSetupProps {
  settings: TournamentSettings;
  onChange: (settings: TournamentSettings) => void;
  playerCount: number;
}

export function TournamentSetup({ settings, onChange, playerCount }: TournamentSetupProps) {
  const perCourt = playersNeededPerMatch(settings.matchType);
  const maxPlayers = maxPlayersForRound(settings);

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
      <h2>Tournament Setup</h2>

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
