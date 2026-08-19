import type { ChangeEvent } from 'react';
import type { DynamicTeamQualifierSettings } from '../types';
import { CourtSelector } from './CourtSelector';

interface DynamicTeamQualifierSetupProps {
  settings: DynamicTeamQualifierSettings;
  onChangeSettings: (settings: DynamicTeamQualifierSettings) => void;
  started: boolean;
}

// Settings card for Dynamic Team Qualifier — session-level fields only (see
// DynamicTeamRoster for team registration/check-in, the live rest-schedule
// preview, and the Start button). Mirrors DynamicPairingSetup's shape: a
// self-contained card with its own fields rather than reusing
// TournamentSetup's generic Number of Courts/timing sections, since this
// format's fields (qualifying rounds, bracket scoring, ...) don't apply
// anywhere else.
export function DynamicTeamQualifierSetup({ settings, onChangeSettings, started }: DynamicTeamQualifierSetupProps) {
  function handleNumberChange(field: keyof DynamicTeamQualifierSettings, event: ChangeEvent<HTMLInputElement>) {
    const parsed = parseInt(event.target.value, 10);
    onChangeSettings({ ...settings, [field]: Number.isNaN(parsed) ? 0 : parsed });
  }

  return (
    <section className="card">
      <h2>Dynamic Team Qualifier Setup</h2>
      <p className="hint">
        Fixed doubles teams play a dynamic (results-based) qualifying stage with a fair rest rotation, then the top 4
        teams face off in a Semis / Gold / Bronze medal bracket.
      </p>

      <div className="form-row">
        <label htmlFor="dtq-division-name">Division / tournament name</label>
        <input
          id="dtq-division-name"
          type="text"
          value={settings.divisionName}
          onChange={(event) => onChangeSettings({ ...settings, divisionName: event.target.value })}
          placeholder="e.g. Men's 4.0 Doubles"
        />
      </div>

      <CourtSelector value={settings.numberOfCourts} onChange={(numberOfCourts) => onChangeSettings({ ...settings, numberOfCourts })} disabled={started} />

      <div className="form-row">
        <label htmlFor="dtq-number-of-teams">Number of teams (planning target)</label>
        <input
          id="dtq-number-of-teams"
          type="number"
          min={4}
          value={settings.numberOfTeams}
          onChange={(event) => handleNumberChange('numberOfTeams', event)}
          disabled={started}
        />
        <p className="hint">
          A planning target only — the actual schedule is generated from however many teams are checked in and
          non-withdrawn when qualifying starts. Default: 18 teams / 6 courts.
        </p>
      </div>

      <div className="timing-grid">
        <label className="timing-field">
          Qualifying rounds
          <input
            type="number"
            min={1}
            value={settings.qualifyingRounds}
            onChange={(event) => handleNumberChange('qualifyingRounds', event)}
            disabled={started}
          />
        </label>
        <label className="timing-field">
          Game duration (minutes)
          <input
            type="number"
            min={1}
            value={settings.qualifyingGameDurationMinutes}
            onChange={(event) => handleNumberChange('qualifyingGameDurationMinutes', event)}
            disabled={started}
          />
        </label>
        <label className="timing-field">
          Result / movement buffer (minutes)
          <input
            type="number"
            min={0}
            value={settings.resultBufferMinutes}
            onChange={(event) => handleNumberChange('resultBufferMinutes', event)}
            disabled={started}
          />
        </label>
      </div>
      <p className="hint">
        Each team plays {settings.gamesPerTeam} qualifying games and rests {settings.restsPerTeam} rounds by default
        (18 teams / 6 courts / 9 rounds) — the actual per-team split is recalculated for whatever team count actually
        checks in, spread as evenly as possible.
      </p>

      <div className="form-row">
        <span>Bracket size</span>
        <div className="toggle-group" role="group" aria-label="Bracket size">
          <button type="button" className="toggle-option active" disabled>
            Top 4
          </button>
        </div>
        <p className="hint">Only Top 4 (Semis, Gold, Bronze) is supported in this version.</p>
      </div>

      <div className="timing-grid">
        <label className="timing-field">
          Bracket: first to
          <input
            type="number"
            min={1}
            value={settings.bracketGameTarget}
            onChange={(event) => handleNumberChange('bracketGameTarget', event)}
            disabled={started}
          />
        </label>
        <label className="timing-field">
          Bracket: win by
          <input
            type="number"
            min={1}
            value={settings.bracketWinBy}
            onChange={(event) => handleNumberChange('bracketWinBy', event)}
            disabled={started}
          />
        </label>
        <label className="timing-field">
          Bracket: hard cap
          <input
            type="number"
            min={1}
            value={settings.bracketCap}
            onChange={(event) => handleNumberChange('bracketCap', event)}
            disabled={started}
          />
        </label>
      </div>

      <p className="hint">
        Once teams are checked in below, the Teams card shows a live preview of the resulting rest schedule — see how
        it actually turns out before you commit, and shuffle it if you want a different one.
      </p>
    </section>
  );
}
