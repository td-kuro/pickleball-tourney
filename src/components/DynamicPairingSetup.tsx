import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { CourtMovementLimit, DynamicGameFormat, DynamicPairingSettings, Player, PlayerAvailabilityStatus } from '../types';
import {
  canGenerateDynamicPairingRound,
  courtMovementLimitLabel,
  dynamicPairingAvailabilityLabel,
  gameFormatLabel,
} from '../utils/dynamicPairingSocial';
import { CourtSelector } from './CourtSelector';

const MOVEMENT_LIMITS: CourtMovementLimit[] = ['unrestricted', 'max-1', 'max-2'];
// 'resting-this-round' isn't offered here deliberately — it's a live,
// current-round action (see PlayerAvailabilityControls in
// DynamicPairingRestingPlayers.tsx), not a setup-time roster edit.
const AVAILABILITY_OPTIONS: PlayerAvailabilityStatus[] = ['available', 'unavailable', 'left-early', 'injured'];

interface DynamicPairingSetupProps {
  settings: DynamicPairingSettings;
  onChangeSettings: (settings: DynamicPairingSettings) => void;
  players: Player[];
  onAddPlayersBulk: (count: number) => void;
  onUpdatePlayer: (
    id: string,
    name: string,
    rating?: number,
    startingSeed?: number,
    availabilityStatus?: PlayerAvailabilityStatus,
  ) => void;
  onUpdatePlayerSkillLevel: (id: string, skillLevel?: number) => void;
  onRemovePlayer: (id: string) => void;
  onRemoveAllPlayers: () => void;
  onStartSession: () => void;
  started: boolean;
  gradingPhaseComplete: boolean;
  onGoToRounds: () => void;
}

// Setup screen for Dynamic Pairing Social — a self-contained card (not
// reusing TournamentSetup's Number of Courts/roster sections, since this
// format needs its own fields: session name, grading rounds, game format,
// court movement limit, and a player roster with starting seed +
// availability that plain PlayerForm/PlayerList don't have). See
// TournamentSetup's Social Format toggle for how you get here, and
// utils/dynamicPairingSocial.ts for the logic this configures.
export function DynamicPairingSetup({
  settings,
  onChangeSettings,
  players,
  onAddPlayersBulk,
  onUpdatePlayer,
  onUpdatePlayerSkillLevel,
  onRemovePlayer,
  onRemoveAllPlayers,
  onStartSession,
  started,
  gradingPhaseComplete,
  onGoToRounds,
}: DynamicPairingSetupProps) {
  const startCheck = canGenerateDynamicPairingRound(players, settings, undefined);

  function handleRemoveAll() {
    if (window.confirm('Are you sure you want to remove all players?')) {
      onRemoveAllPlayers();
    }
  }

  return (
    <>
      <section className="card">
        <h2>Dynamic Pairing Social Setup</h2>
        <p className="hint">
          Grading rounds establish a baseline ranking, then every round after that re-ranks players from their
          results and rebuilds courts, partners, and opponents to keep matches competitive and balanced.
        </p>

        <div className="form-row">
          <label htmlFor="dp-session-name">Session name</label>
          <input
            id="dp-session-name"
            type="text"
            value={settings.sessionName}
            onChange={(event) => onChangeSettings({ ...settings, sessionName: event.target.value })}
            placeholder="e.g. Saturday Morning Social"
          />
        </div>

        <CourtSelector
          value={settings.numberOfCourts}
          onChange={(numberOfCourts) => onChangeSettings({ ...settings, numberOfCourts })}
          disabled={started}
        />
        <p className="hint">
          Recommended: 6 courts for 24–30 players (24 active at once, the rest resting in fair rotation — see
          "Court capacity" in the README). Active capacity = courts × 4 ={' '}
          <strong>{settings.numberOfCourts * 4} players</strong>.
        </p>

        <div className="form-row">
          <label htmlFor="dp-grading-rounds">Grading rounds</label>
          <input
            id="dp-grading-rounds"
            type="number"
            min={0}
            value={settings.gradingRounds}
            onChange={(event) => {
              const parsed = parseInt(event.target.value, 10);
              onChangeSettings({ ...settings, gradingRounds: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) });
            }}
            disabled={started}
          />
          <p className="hint">
            All {settings.gradingRounds} round{settings.gradingRounds === 1 ? '' : 's'} are generated up front when
            you start matches, pairing courts at random (not by seed or results) while enough game data builds up —
            see them all immediately under All Rounds. Default: 3. Once every grading round is scored, an Admin
            Skill Review screen lets you assign a skill level per player before dynamic pairing begins.
          </p>
        </div>

        <div className="form-row">
          <span>Game format</span>
          <div className="toggle-group" role="group" aria-label="Game format">
            <button
              type="button"
              className={settings.gameFormat === 'timed' ? 'toggle-option active' : 'toggle-option'}
              onClick={() => onChangeSettings({ ...settings, gameFormat: 'timed' as DynamicGameFormat })}
            >
              {gameFormatLabel('timed')}
            </button>
            <button
              type="button"
              className={settings.gameFormat === 'first-to-score' ? 'toggle-option active' : 'toggle-option'}
              onClick={() => onChangeSettings({ ...settings, gameFormat: 'first-to-score' as DynamicGameFormat })}
            >
              {gameFormatLabel('first-to-score')}
            </button>
          </div>
          {settings.gameFormat === 'timed' ? (
            <label className="timing-field">
              Game duration (minutes)
              <input
                type="number"
                min={1}
                value={settings.gameDurationMinutes ?? ''}
                onChange={(event) => {
                  const parsed = parseInt(event.target.value, 10);
                  onChangeSettings({ ...settings, gameDurationMinutes: Number.isNaN(parsed) ? undefined : parsed });
                }}
                aria-label="Game duration in minutes"
              />
            </label>
          ) : (
            <label className="timing-field">
              Winning score
              <input
                type="number"
                min={1}
                value={settings.winningScore ?? ''}
                onChange={(event) => {
                  const parsed = parseInt(event.target.value, 10);
                  onChangeSettings({ ...settings, winningScore: Number.isNaN(parsed) ? undefined : parsed });
                }}
                aria-label="Winning score"
              />
            </label>
          )}
        </div>

        <div className="form-row">
          <span>Maximum court movement per round</span>
          <div className="toggle-group" role="group" aria-label="Maximum court movement per round">
            {MOVEMENT_LIMITS.map((limit) => (
              <button
                key={limit}
                type="button"
                className={settings.maxCourtMovement === limit ? 'toggle-option active' : 'toggle-option'}
                onClick={() => onChangeSettings({ ...settings, maxCourtMovement: limit })}
              >
                {courtMovementLimitLabel(limit)}
              </button>
            ))}
          </div>
          <p className="hint">
            Caps how far a player's court can move between ranking rounds, so one unusually big result doesn't
            cause a dramatic jump. Applied after grading only. Recommended: Max 1 Court.
          </p>
        </div>

        <div className="form-row">
          <span>Score confirmation</span>
          <label className="dp-placeholder-toggle">
            <input type="checkbox" checked={settings.scoreConfirmationRequired} disabled />
            Require organiser confirmation before a score is final
          </label>
          <p className="hint">Placeholder for a future version — always off for now; scores are final as entered.</p>
        </div>

        <div className="form-row">
          <span>Manual overrides</span>
          <p className="hint">
            Placeholder for a future version — manually editing a generated court/partnership isn't available yet.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="section-heading-row">
          <h2>Players ({players.length})</h2>
          <div className="participant-header-actions">
            {!started && (
              <button type="button" className="secondary" onClick={() => onAddPlayersBulk(1)}>
                + Add Player
              </button>
            )}
            {players.length > 0 && !started && (
              <button type="button" className="danger" onClick={handleRemoveAll}>
                Remove All Players
              </button>
            )}
          </div>
        </div>
        <p className="hint">
          Starting seed (optional) is used only as a ranking tiebreaker — grading rounds are randomized regardless of
          seed.
        </p>
        <DynamicPairingPlayerList
          players={players}
          onUpdate={onUpdatePlayer}
          onUpdateSkillLevel={onUpdatePlayerSkillLevel}
          onRemove={onRemovePlayer}
          disabled={started}
          skillLevelEditable={started && gradingPhaseComplete}
        />
        <p className="hint">
          {players.filter((p) => (p.availabilityStatus ?? 'available') === 'available').length} available of{' '}
          {players.length} added.
        </p>
        <p className="hint">
          {gradingPhaseComplete
            ? 'Skill level (1 = strongest) can be set per player below — it helps break ranking ties while match data is still thin. You can also set it from the Admin Skill Review screen shown right after grading finishes.'
            : `Skill level can be set once all ${settings.gradingRounds} grading round${settings.gradingRounds === 1 ? '' : 's'} are scored — you'll also get a dedicated Admin Skill Review screen at that point.`}
        </p>
      </section>

      <section className="card start-matches-card">
        {!started ? (
          <>
            <button type="button" className="cta-button start-button" onClick={onStartSession} disabled={!startCheck.ok}>
              Start Matches
            </button>
            {!startCheck.ok && <p className="hint error">{startCheck.reason}</p>}
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

interface DynamicPairingPlayerListProps {
  players: Player[];
  onUpdate: (
    id: string,
    name: string,
    rating?: number,
    startingSeed?: number,
    availabilityStatus?: PlayerAvailabilityStatus,
  ) => void;
  onUpdateSkillLevel: (id: string, skillLevel?: number) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
  skillLevelEditable: boolean;
}

function DynamicPairingPlayerList({
  players,
  onUpdate,
  onUpdateSkillLevel,
  onRemove,
  disabled,
  skillLevelEditable,
}: DynamicPairingPlayerListProps) {
  if (players.length === 0) {
    return <p className="empty-state">No players yet. Add a player to the left.</p>;
  }
  return (
    <div className="player-list">
      {players.map((player, index) => (
        <DynamicPairingPlayerRow
          key={player.id}
          index={index}
          player={player}
          onUpdate={onUpdate}
          onUpdateSkillLevel={onUpdateSkillLevel}
          onRemove={onRemove}
          disabled={disabled}
          skillLevelEditable={skillLevelEditable}
        />
      ))}
    </div>
  );
}

interface DynamicPairingPlayerRowProps {
  index: number;
  player: Player;
  onUpdate: DynamicPairingPlayerListProps['onUpdate'];
  onUpdateSkillLevel: (id: string, skillLevel?: number) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
  skillLevelEditable: boolean;
}

function DynamicPairingPlayerRow({
  index,
  player,
  onUpdate,
  onUpdateSkillLevel,
  onRemove,
  disabled,
  skillLevelEditable,
}: DynamicPairingPlayerRowProps) {
  const [name, setName] = useState(player.name);
  const [rating, setRating] = useState(player.rating != null ? String(player.rating) : '');
  const [seed, setSeed] = useState(player.startingSeed != null ? String(player.startingSeed) : '');
  const [skillLevel, setSkillLevel] = useState(player.skillLevel != null ? String(player.skillLevel) : '');

  function commit(nextName: string, nextRating: string, nextSeed: string) {
    const trimmedRating = nextRating.trim();
    const parsedRating = trimmedRating === '' ? undefined : parseFloat(trimmedRating);
    const trimmedSeed = nextSeed.trim();
    const parsedSeed = trimmedSeed === '' ? undefined : parseInt(trimmedSeed, 10);
    onUpdate(
      player.id,
      nextName,
      parsedRating != null && !Number.isNaN(parsedRating) ? parsedRating : undefined,
      parsedSeed != null && !Number.isNaN(parsedSeed) ? parsedSeed : undefined,
      player.availabilityStatus,
    );
  }

  function commitSkillLevel(nextSkillLevel: string) {
    const trimmed = nextSkillLevel.trim();
    const parsed = trimmed === '' ? undefined : parseInt(trimmed, 10);
    onUpdateSkillLevel(player.id, parsed != null && !Number.isNaN(parsed) ? parsed : undefined);
  }

  function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur();
  }

  function handleAvailabilityChange(event: ChangeEvent<HTMLSelectElement>) {
    onUpdate(player.id, name, player.rating, player.startingSeed, event.target.value as PlayerAvailabilityStatus);
  }

  const missingName = name.trim() === '';
  const availability = player.availabilityStatus ?? 'available';

  return (
    <div className={missingName ? 'player-row player-row-invalid' : 'player-row'}>
      <span className="player-row-index">{index + 1}</span>
      <input
        type="text"
        className="player-row-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => commit(name, rating, seed)}
        onKeyDown={blurOnEnter}
        placeholder={`Player ${index + 1}`}
        aria-label={`Player ${index + 1} name`}
        disabled={disabled}
      />
      <input
        type="number"
        className="player-row-rating"
        step="0.1"
        min="0"
        value={rating}
        onChange={(event) => setRating(event.target.value)}
        onBlur={() => commit(name, rating, seed)}
        onKeyDown={blurOnEnter}
        placeholder="Unrated"
        aria-label={`Player ${index + 1} rating`}
        disabled={disabled}
      />
      <input
        type="number"
        className="player-row-rating"
        min={1}
        step={1}
        value={seed}
        onChange={(event) => setSeed(event.target.value)}
        onBlur={() => commit(name, rating, seed)}
        onKeyDown={blurOnEnter}
        placeholder="Seed"
        aria-label={`Player ${index + 1} starting seed`}
        disabled={disabled}
      />
      <input
        type="number"
        className="player-row-rating"
        min={1}
        step={1}
        value={skillLevel}
        onChange={(event) => setSkillLevel(event.target.value)}
        onBlur={() => commitSkillLevel(skillLevel)}
        onKeyDown={blurOnEnter}
        placeholder="Skill"
        title={skillLevelEditable ? 'Skill level (1 = strongest)' : `Skill level can be set once grading rounds finish`}
        aria-label={`Player ${index + 1} skill level`}
        disabled={!skillLevelEditable}
      />
      <select
        className="dp-availability-select"
        value={availability}
        onChange={handleAvailabilityChange}
        aria-label={`Player ${index + 1} availability`}
      >
        {AVAILABILITY_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {dynamicPairingAvailabilityLabel(status)}
          </option>
        ))}
      </select>
      <button type="button" className="danger" onClick={() => onRemove(player.id)} disabled={disabled}>
        Remove
      </button>
    </div>
  );
}
