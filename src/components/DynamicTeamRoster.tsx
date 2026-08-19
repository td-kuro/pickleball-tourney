import { useId, useState, type FormEvent } from 'react';
import type { DynamicTeam } from '../types';
import { validateCheckedInTeams } from '../utils/dynamicTeamQualifier';

interface DynamicTeamRosterProps {
  teams: DynamicTeam[];
  numberOfCourts: number;
  onAddTeam: (playerAName: string, playerBName: string, teamName: string, rating?: number, seed?: number) => void;
  onAddTeamsBulk: (count: number) => void;
  onUpdateTeam: (id: string, playerAName: string, playerBName: string, teamName: string, rating?: number, seed?: number) => void;
  onSetCheckedIn: (id: string, checkedIn: boolean) => void;
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
// the "ready to start" check — see validateCheckedInTeams.
export function DynamicTeamRoster({
  teams,
  numberOfCourts,
  onAddTeam,
  onAddTeamsBulk,
  onUpdateTeam,
  onSetCheckedIn,
  onRemoveTeam,
  onRemoveAllTeams,
  started,
  startError,
  onStartQualifying,
  onRegenerateSeed,
  onGoToRounds,
}: DynamicTeamRosterProps) {
  const startCheck = validateCheckedInTeams(teams, numberOfCourts);
  const checkedInCount = teams.filter((t) => t.checkedIn && !t.withdrawn).length;

  function handleRemoveAll() {
    if (window.confirm('Are you sure you want to remove all teams?')) {
      onRemoveAllTeams();
    }
  }

  return (
    <>
      <div className="setup-grid">
        <DynamicTeamForm onAddTeam={onAddTeam} onAddTeamsBulk={onAddTeamsBulk} disabled={started} />

        <section className="card">
          <div className="section-heading-row">
            <h2>Teams ({teams.length})</h2>
            {teams.length > 0 && !started && (
              <button type="button" className="danger" onClick={handleRemoveAll}>
                Remove All Teams
              </button>
            )}
          </div>

          {teams.length === 0 ? (
            <p className="empty-state">No teams yet. Add a team on the left.</p>
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
      </div>

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

interface DynamicTeamFormProps {
  onAddTeam: (playerAName: string, playerBName: string, teamName: string, rating?: number, seed?: number) => void;
  onAddTeamsBulk: (count: number) => void;
  disabled: boolean;
}

function DynamicTeamForm({ onAddTeam, onAddTeamsBulk, disabled }: DynamicTeamFormProps) {
  const [playerAName, setPlayerAName] = useState('');
  const [playerBName, setPlayerBName] = useState('');
  const [rating, setRating] = useState('');
  const [seed, setSeed] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bulkCount, setBulkCount] = useState('');
  const bulkCountValue = parseInt(bulkCount, 10);
  const id = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedA = playerAName.trim();
    const trimmedB = playerBName.trim();
    if (!trimmedA || !trimmedB) {
      setError('Enter both player names.');
      return;
    }
    const parsedRating = rating.trim() === '' ? undefined : parseFloat(rating);
    if (parsedRating != null && (Number.isNaN(parsedRating) || parsedRating < 0)) {
      setError('Rating must be a valid, non-negative number, or left blank.');
      return;
    }
    const parsedSeed = seed.trim() === '' ? undefined : parseInt(seed, 10);
    if (parsedSeed != null && (Number.isNaN(parsedSeed) || parsedSeed < 1)) {
      setError('Seed must be a whole number of at least 1, or left blank.');
      return;
    }
    setError(null);
    onAddTeam(trimmedA, trimmedB, '', parsedRating, parsedSeed);
    setPlayerAName('');
    setPlayerBName('');
    setRating('');
    setSeed('');
  }

  function handleGenerateSlots(event: FormEvent) {
    event.preventDefault();
    if (Number.isNaN(bulkCountValue) || bulkCountValue < 1) return;
    onAddTeamsBulk(bulkCountValue);
    setBulkCount('');
  }

  return (
    <section className="card">
      <h2>Add Team</h2>
      <p className="hint">Dynamic Team Qualifier uses fixed doubles teams — the team, not the individual player, is the ranking and pairing unit. Each team's display name is derived from its two player names.</p>
      <form className="player-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label htmlFor={`${id}-player-a`}>Player 1 name</label>
          <input
            id={`${id}-player-a`}
            type="text"
            value={playerAName}
            onChange={(event) => setPlayerAName(event.target.value)}
            placeholder="Player 1 name"
            disabled={disabled}
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor={`${id}-player-b`}>Player 2 name</label>
          <input
            id={`${id}-player-b`}
            type="text"
            value={playerBName}
            onChange={(event) => setPlayerBName(event.target.value)}
            placeholder="Player 2 name"
            disabled={disabled}
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor={`${id}-rating`}>Rating / DUPR (optional)</label>
          <input
            id={`${id}-rating`}
            type="number"
            step="0.1"
            min="0"
            value={rating}
            onChange={(event) => setRating(event.target.value)}
            placeholder="Unrated"
            disabled={disabled}
          />
        </div>
        <div className="form-row">
          <label htmlFor={`${id}-seed`}>Seed (optional)</label>
          <input
            id={`${id}-seed`}
            type="number"
            min={1}
            step={1}
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            placeholder="e.g. 1 = strongest"
            disabled={disabled}
          />
        </div>
        {error && <p className="hint error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={disabled}>
            Add Team
          </button>
        </div>
      </form>

      <div className="bulk-add">
        <p className="bulk-add-label">Or generate multiple team slots</p>
        <form className="bulk-add-form" onSubmit={handleGenerateSlots}>
          <input
            type="number"
            min={1}
            value={bulkCount}
            onChange={(event) => setBulkCount(event.target.value)}
            placeholder="e.g. 8"
            aria-label="Number of teams to generate"
            disabled={disabled}
          />
          <button type="submit" className="secondary" disabled={disabled || Number.isNaN(bulkCountValue) || bulkCountValue < 1}>
            Generate Team Slots
          </button>
        </form>
      </div>

      {disabled && <p className="hint">The roster is locked while qualifying is in progress — use Reset to start over.</p>}
    </section>
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
  const nameEditable = !team.partnerLocked && !disabled;

  function commit() {
    onUpdate(team.id, playerAName, playerBName, team.displayName === `${team.playerAName} / ${team.playerBName}` ? '' : team.displayName, team.rating, team.seed);
  }

  return (
    <div className="player-row dtq-team-row">
      <span className="player-row-index">{team.teamCode}</span>
      <input
        type="text"
        className="player-row-name"
        value={playerAName}
        onChange={(event) => setPlayerAName(event.target.value)}
        onBlur={commit}
        placeholder="Player 1"
        aria-label={`${team.teamCode} player 1 name`}
        disabled={!nameEditable}
      />
      <input
        type="text"
        className="player-row-name"
        value={playerBName}
        onChange={(event) => setPlayerBName(event.target.value)}
        onBlur={commit}
        placeholder="Player 2"
        aria-label={`${team.teamCode} player 2 name`}
        disabled={!nameEditable}
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
