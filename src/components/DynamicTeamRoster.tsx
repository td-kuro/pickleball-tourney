import { useState } from 'react';
import type { DynamicTeam, DynamicTeamQualifierSettings } from '../types';
import { validateCheckedInTeams } from '../utils/dynamicTeamQualifier';
import { DynamicTeamRestSchedulePreview } from './DynamicTeamRestSchedulePreview';

interface DynamicTeamRosterProps {
  teams: DynamicTeam[];
  settings: DynamicTeamQualifierSettings;
  onAddTeamsBulk: (count: number) => void;
  onUpdateTeam: (id: string, playerAName: string, playerBName: string, teamName: string, rating?: number, seed?: number) => void;
  onSetCheckedIn: (id: string, checkedIn: boolean) => void;
  onCheckInAllTeams: () => void;
  onRemoveTeam: (id: string) => void;
  onRemoveAllTeams: () => void;
  started: boolean;
  startError: string | null;
  onStartQualifying: () => void;
  onRegenerateSeed: () => void;
  onGoToRounds: () => void;
}

// Team Registration + Check-in, combined into one screen (see README's
// "Team check-in" — there's nothing to structurally distinguish "still
// registering" from "checking teams in" until qualifying actually starts,
// same reasoning as DynamicPairingSetup folding roster management and
// Start into one card). Only checked-in, non-withdrawn teams count toward
// the "ready to start" check — see validateCheckedInTeams. Also renders a
// live rest-schedule preview (see DynamicTeamRestSchedulePreview) above
// the Start button, so "Regenerate" has something concrete to show for
// itself instead of a bare seed number.
export function DynamicTeamRoster({
  teams,
  settings,
  onAddTeamsBulk,
  onUpdateTeam,
  onSetCheckedIn,
  onCheckInAllTeams,
  onRemoveTeam,
  onRemoveAllTeams,
  started,
  startError,
  onStartQualifying,
  onRegenerateSeed,
  onGoToRounds,
}: DynamicTeamRosterProps) {
  const startCheck = validateCheckedInTeams(teams, settings.numberOfCourts);
  const checkedInCount = teams.filter((t) => t.checkedIn && !t.withdrawn).length;
  const uncheckedCount = teams.filter((t) => !t.checkedIn && !t.withdrawn).length;

  function handleRemoveAll() {
    if (window.confirm('Are you sure you want to remove all teams?')) {
      onRemoveAllTeams();
    }
  }

  return (
    <>
      <section className="card">
        <div className="section-heading-row">
          <h2>Teams ({teams.length})</h2>
          <div className="dtq-team-header-actions">
            {!started && (
              <button type="button" className="secondary" onClick={() => onAddTeamsBulk(1)}>
                + Add Team
              </button>
            )}
            {teams.length > 0 && !started && (
              <>
                {uncheckedCount > 0 && (
                  <button type="button" className="secondary" onClick={onCheckInAllTeams}>
                    Check In All Teams
                  </button>
                )}
                <button type="button" className="danger" onClick={handleRemoveAll}>
                  Remove All Teams
                </button>
              </>
            )}
          </div>
        </div>
        <p className="hint">
          Dynamic Team Qualifier uses fixed doubles teams — the team, not the individual player, is the ranking and
          pairing unit. Seed (optional) is used only as a ranking tiebreaker.
        </p>

        {teams.length === 0 ? (
          <p className="empty-state">No teams yet. Click "+ Add Team" above.</p>
        ) : (
          <div className="player-list">
            {teams.map((team) => (
              <DynamicTeamRow
                key={team.id}
                team={team}
                onUpdate={onUpdateTeam}
                onSetCheckedIn={onSetCheckedIn}
                onRemove={onRemoveTeam}
                disabled={started}
              />
            ))}
          </div>
        )}

        <p className="hint">
          {checkedInCount} checked in of {teams.length} team{teams.length === 1 ? '' : 's'} registered.
        </p>
      </section>

      {!started && <DynamicTeamRestSchedulePreview teams={teams} settings={settings} onRegenerate={onRegenerateSeed} />}

      <section className="card start-matches-card">
        {!started ? (
          <>
            <button type="button" className="cta-button start-button" onClick={onStartQualifying} disabled={!startCheck.ok}>
              Start Qualifying
            </button>
            {!startCheck.ok && <p className="hint error">{startCheck.reason}</p>}
            {startError && (
              <>
                <p className="hint error">{startError}</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    onRegenerateSeed();
                    onStartQualifying();
                  }}
                >
                  Regenerate Rest Schedule &amp; Retry
                </button>
              </>
            )}
          </>
        ) : (
          <button type="button" className="cta-button start-button" onClick={onGoToRounds}>
            Go to Rounds
          </button>
        )}
      </section>
    </>
  );
}

interface DynamicTeamRowProps {
  team: DynamicTeam;
  onUpdate: (id: string, playerAName: string, playerBName: string, teamName: string, rating?: number, seed?: number) => void;
  onSetCheckedIn: (id: string, checkedIn: boolean) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}

function DynamicTeamRow({ team, onUpdate, onSetCheckedIn, onRemove, disabled }: DynamicTeamRowProps) {
  const [playerAName, setPlayerAName] = useState(team.playerAName);
  const [playerBName, setPlayerBName] = useState(team.playerBName);
  const [rating, setRating] = useState(team.rating != null ? String(team.rating) : '');
  const [seed, setSeed] = useState(team.seed != null ? String(team.seed) : '');
  const nameEditable = !team.partnerLocked && !disabled;

  function commit(nextRating: string, nextSeed: string) {
    const trimmedRating = nextRating.trim();
    const parsedRating = trimmedRating === '' ? undefined : parseFloat(trimmedRating);
    const trimmedSeed = nextSeed.trim();
    const parsedSeed = trimmedSeed === '' ? undefined : parseInt(trimmedSeed, 10);
    onUpdate(
      team.id,
      playerAName,
      playerBName,
      team.displayName === `${team.playerAName} / ${team.playerBName}` ? '' : team.displayName,
      parsedRating != null && !Number.isNaN(parsedRating) ? parsedRating : undefined,
      parsedSeed != null && !Number.isNaN(parsedSeed) ? parsedSeed : undefined,
    );
  }

  return (
    <div className="player-row dtq-team-row">
      <span className="player-row-index">{team.teamCode}</span>
      <input
        type="text"
        className="player-row-name"
        value={playerAName}
        onChange={(event) => setPlayerAName(event.target.value)}
        onBlur={() => commit(rating, seed)}
        placeholder="Player 1"
        aria-label={`${team.teamCode} player 1 name`}
        disabled={!nameEditable}
      />
      <input
        type="text"
        className="player-row-name"
        value={playerBName}
        onChange={(event) => setPlayerBName(event.target.value)}
        onBlur={() => commit(rating, seed)}
        placeholder="Player 2"
        aria-label={`${team.teamCode} player 2 name`}
        disabled={!nameEditable}
      />
      <input
        type="number"
        className="player-row-rating"
        step="0.1"
        min="0"
        value={rating}
        onChange={(event) => setRating(event.target.value)}
        onBlur={() => commit(rating, seed)}
        placeholder="Unrated"
        aria-label={`${team.teamCode} rating`}
        disabled={disabled}
      />
      <input
        type="number"
        className="player-row-rating"
        min={1}
        step={1}
        value={seed}
        onChange={(event) => setSeed(event.target.value)}
        onBlur={() => commit(rating, seed)}
        placeholder="Seed"
        aria-label={`${team.teamCode} seed`}
        disabled={disabled}
      />
      <label className="dtq-checkin-toggle" title={team.withdrawn ? 'Withdrawn teams cannot check in' : undefined}>
        <input
          type="checkbox"
          checked={team.checkedIn}
          onChange={(event) => onSetCheckedIn(team.id, event.target.checked)}
          disabled={team.withdrawn}
          aria-label={`${team.teamCode} checked in`}
        />
        Checked in
      </label>
      <button type="button" className="secondary dtq-placeholder-button" disabled title="Coming later">
        Withdraw
      </button>
      <button type="button" className="danger" onClick={() => onRemove(team.id)} disabled={disabled}>
        Remove
      </button>
    </div>
  );
}
