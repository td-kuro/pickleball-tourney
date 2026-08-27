import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { CourtMovementLimit, DynamicGameFormat, DynamicPairingSettings, DynamicPairingTeam, Player, PlayerAvailabilityStatus } from '../types';
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
  onRemovePlayer: (id: string) => void;
  onRemoveAllPlayers: () => void;
  // Fixed teams — see DynamicPairingTeam / buildDynamicPairingEntrants.
  teams: DynamicPairingTeam[];
  onMakeTeam: (player1Id: string, player2Id: string) => void;
  onUnmakeTeam: (teamId: string) => void;
  onUpdateTeamSeedAndRating: (teamId: string, seed?: number, rating?: number) => void;
  onUpdateEntrantSkillLevel: (entrantId: string, skillLevel?: number) => void;
  onStartSession: () => void;
  started: boolean;
  gradingPhaseComplete: boolean;
  onGoToRounds: () => void;
}

// ids are minted as `dp-player-<Date.now()>-...` / `dp-team-<Date.now()>-...`
// (see useDynamicPairingSocial), so the timestamp segment (index 2 in both)
// doubles as a stable "added in this order" key — same trick
// ParticipantList uses to interleave players and teams in one list.
function idTimestamp(id: string): number {
  const value = Number(id.split('-')[2]);
  return Number.isNaN(value) ? 0 : value;
}

// Setup screen for Dynamic Pairing Social — a self-contained card (not
// reusing TournamentSetup's Number of Courts/roster sections, since this
// format needs its own fields: session name, grading rounds, game format,
// court movement limit, and a player roster with starting seed +
// availability that plain PlayerForm/PlayerList don't have). See
// TournamentSetup's Social Format toggle for how you get here, and
// utils/dynamicPairingSocial.ts for the logic this configures.
//
// Fixed teams: select two individual player rows (checkbox) and confirm in
// the "Make Team" bar that appears — same interaction as Standard Social
// Play's ParticipantList, rebuilt locally here since Dynamic Pairing
// Social's row shape (seed/skill columns, its own availability set) and
// its own DynamicPairingTeam type are deliberately kept separate from that
// mode's Team/useTeams (see the file header of
// utils/dynamicPairingSocial.ts). A team doesn't own a separate player
// list — team.playerIds just references two ids already in `players` — so
// both members keep their own individual rows in the underlying roster;
// this screen just hides them from the plain player list and renders one
// DynamicPairingTeamRow instead (see the merge into `entries` below).
export function DynamicPairingSetup({
  settings,
  onChangeSettings,
  players,
  onAddPlayersBulk,
  onUpdatePlayer,
  onRemovePlayer,
  onRemoveAllPlayers,
  teams,
  onMakeTeam,
  onUnmakeTeam,
  onUpdateTeamSeedAndRating,
  onUpdateEntrantSkillLevel,
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
          <label htmlFor="dp-ranking-lag">Ranking lag (rounds)</label>
          <input
            id="dp-ranking-lag"
            type="number"
            min={0}
            value={settings.rankingLagRounds}
            onChange={(event) => {
              const parsed = parseInt(event.target.value, 10);
              onChangeSettings({ ...settings, rankingLagRounds: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) });
            }}
            disabled={started}
          />
          <p className="hint">
            Once dynamic pairing starts, Round N's court order is decided from completed results up to Round N − 1 −
            this number — so with the default of 1, Round N is generated (and already visible under All Rounds) as
            soon as Round N − 1 becomes current, without waiting for it to finish. Set to 0 to always wait for the
            immediately preceding round to complete before generating the next one.
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
          {teams.length > 0 && (
            <p className="hint">
              Not applied once a fixed team exists — see README's "Fixed teams". Rounds are freshly ranked
              best-to-worst instead.
            </p>
          )}
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
          {!started && (
            <button type="button" className="secondary" onClick={() => onAddPlayersBulk(1)}>
              + Add Player
            </button>
          )}
        </div>
        <p className="hint">
          Starting seed (optional) is used only as a ranking tiebreaker — grading rounds are randomized regardless of
          seed. Select two players below to combine them into a fixed team that always plays together and is
          ranked as one unit — see README's "Fixed teams".
        </p>
        <DynamicPairingParticipantList
          players={players}
          teams={teams}
          onUpdatePlayer={onUpdatePlayer}
          onUpdateEntrantSkillLevel={onUpdateEntrantSkillLevel}
          onRemovePlayer={onRemovePlayer}
          onMakeTeam={onMakeTeam}
          onUnmakeTeam={onUnmakeTeam}
          onUpdateTeamSeedAndRating={onUpdateTeamSeedAndRating}
          disabled={started}
          skillLevelEditable={started && gradingPhaseComplete}
        />
        <p className="hint">
          {players.filter((p) => (p.availabilityStatus ?? 'available') === 'available').length} available of{' '}
          {players.length} added.
        </p>
        <p className="hint">
          {gradingPhaseComplete
            ? 'Skill level (1 = strongest) can be set per player/team below — it helps break ranking ties while match data is still thin. You can also set it from the Admin Skill Review screen shown right after grading finishes.'
            : `Skill level can be set once all ${settings.gradingRounds} grading round${settings.gradingRounds === 1 ? '' : 's'} are scored — you'll also get a dedicated Admin Skill Review screen at that point.`}
        </p>
        {(players.length > 0 || teams.length > 0) && !started && (
          <div className="section-footer-actions">
            <button type="button" className="danger" onClick={handleRemoveAll}>
              Remove All Players
            </button>
          </div>
        )}
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

interface DynamicPairingParticipantListProps {
  players: Player[];
  teams: DynamicPairingTeam[];
  onUpdatePlayer: DynamicPairingSetupProps['onUpdatePlayer'];
  onUpdateEntrantSkillLevel: (entrantId: string, skillLevel?: number) => void;
  onRemovePlayer: (id: string) => void;
  onMakeTeam: (player1Id: string, player2Id: string) => void;
  onUnmakeTeam: (teamId: string) => void;
  onUpdateTeamSeedAndRating: (teamId: string, seed?: number, rating?: number) => void;
  disabled: boolean;
  skillLevelEditable: boolean;
}

type DynamicPairingEntry = { kind: 'player'; player: Player } | { kind: 'team'; team: DynamicPairingTeam };

function DynamicPairingParticipantList({
  players,
  teams,
  onUpdatePlayer,
  onUpdateEntrantSkillLevel,
  onRemovePlayer,
  onMakeTeam,
  onUnmakeTeam,
  onUpdateTeamSeedAndRating,
  disabled,
  skillLevelEditable,
}: DynamicPairingParticipantListProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (players.length === 0) {
    return <p className="empty-state">No players yet. Add a player to the left.</p>;
  }

  const teamMemberIds = new Set(teams.flatMap((t) => t.playerIds));
  const individualPlayers = players.filter((p) => !teamMemberIds.has(p.id));

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id);
      if (current.length >= 2) return [current[1], id];
      return [...current, id];
    });
  }

  function handleMakeTeam() {
    if (selectedIds.length !== 2) return;
    onMakeTeam(selectedIds[0], selectedIds[1]);
    setSelectedIds([]);
  }

  const entries: DynamicPairingEntry[] = [
    ...individualPlayers.map((player): DynamicPairingEntry => ({ kind: 'player', player })),
    ...teams.map((team): DynamicPairingEntry => ({ kind: 'team', team })),
  ].sort((a, b) => {
    const idA = a.kind === 'player' ? a.player.id : a.team.id;
    const idB = b.kind === 'player' ? b.player.id : b.team.id;
    return idTimestamp(idA) - idTimestamp(idB);
  });

  return (
    <div className="player-list">
      {!disabled && selectedIds.length === 2 && (
        <div className="make-team-bar">
          <span>2 players selected</span>
          <button type="button" onClick={handleMakeTeam}>
            Make Team
          </button>
          <button type="button" className="secondary" onClick={() => setSelectedIds([])}>
            Cancel
          </button>
        </div>
      )}
      {entries.map((entry, index) =>
        entry.kind === 'player' ? (
          <DynamicPairingPlayerRow
            key={entry.player.id}
            index={index}
            player={entry.player}
            onUpdate={onUpdatePlayer}
            onUpdateSkillLevel={onUpdateEntrantSkillLevel}
            onRemove={onRemovePlayer}
            disabled={disabled}
            skillLevelEditable={skillLevelEditable}
            selectable={!disabled}
            selected={selectedIds.includes(entry.player.id)}
            onToggleSelect={toggleSelect}
          />
        ) : (
          <DynamicPairingTeamRow
            key={entry.team.id}
            index={index}
            team={entry.team}
            players={players}
            onUpdatePlayer={onUpdatePlayer}
            onUpdateSkillLevel={onUpdateEntrantSkillLevel}
            onUpdateSeedAndRating={onUpdateTeamSeedAndRating}
            onUnmakeTeam={onUnmakeTeam}
            onRemove={onRemovePlayer}
            disabled={disabled}
            skillLevelEditable={skillLevelEditable}
          />
        ),
      )}
    </div>
  );
}

interface DynamicPairingPlayerRowProps {
  index: number;
  player: Player;
  onUpdate: DynamicPairingSetupProps['onUpdatePlayer'];
  onUpdateSkillLevel: (id: string, skillLevel?: number) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
  skillLevelEditable: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function DynamicPairingPlayerRow({
  index,
  player,
  onUpdate,
  onUpdateSkillLevel,
  onRemove,
  disabled,
  skillLevelEditable,
  selectable,
  selected,
  onToggleSelect,
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
      {selectable && (
        <input
          type="checkbox"
          className="player-row-select"
          checked={selected ?? false}
          onChange={() => onToggleSelect?.(player.id)}
          aria-label={`Select ${player.name || `player ${index + 1}`} for a fixed team`}
        />
      )}
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

interface DynamicPairingTeamRowProps {
  index: number;
  team: DynamicPairingTeam;
  players: Player[];
  onUpdatePlayer: DynamicPairingSetupProps['onUpdatePlayer'];
  onUpdateSkillLevel: (id: string, skillLevel?: number) => void;
  onUpdateSeedAndRating: (teamId: string, seed?: number, rating?: number) => void;
  onUnmakeTeam: (teamId: string) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
  skillLevelEditable: boolean;
}

// One fixed team's row — each member's own name/availability (editable in
// place, via the same onUpdatePlayer the individual rows use — a team
// member is still a normal roster entry, just no longer shown on its own
// row, see the merge in DynamicPairingParticipantList), plus the team's own
// seed/rating/skill level (used for ranking — see
// buildDynamicPairingEntrants). "Split Team" reverts to two individual
// rows; "Remove" deletes both players (and, as a side effect, the team)
// entirely.
function DynamicPairingTeamRow({
  index,
  team,
  players,
  onUpdatePlayer,
  onUpdateSkillLevel,
  onUpdateSeedAndRating,
  onUnmakeTeam,
  onRemove,
  disabled,
  skillLevelEditable,
}: DynamicPairingTeamRowProps) {
  const [aId, bId] = team.playerIds;
  const playerA = players.find((p) => p.id === aId);
  const playerB = players.find((p) => p.id === bId);
  const [nameA, setNameA] = useState(playerA?.name ?? '');
  const [nameB, setNameB] = useState(playerB?.name ?? '');
  const [seed, setSeed] = useState(team.seed != null ? String(team.seed) : '');
  const [rating, setRating] = useState(team.rating != null ? String(team.rating) : '');
  const [skillLevel, setSkillLevel] = useState(team.skillLevel != null ? String(team.skillLevel) : '');

  function commitName(player: Player | undefined, nextName: string) {
    if (!player) return;
    onUpdatePlayer(player.id, nextName, player.rating, player.startingSeed, player.availabilityStatus);
  }

  function commitSeedAndRating(nextSeed: string, nextRating: string) {
    const trimmedSeed = nextSeed.trim();
    const parsedSeed = trimmedSeed === '' ? undefined : parseInt(trimmedSeed, 10);
    const trimmedRating = nextRating.trim();
    const parsedRating = trimmedRating === '' ? undefined : parseFloat(trimmedRating);
    onUpdateSeedAndRating(
      team.id,
      parsedSeed != null && !Number.isNaN(parsedSeed) ? parsedSeed : undefined,
      parsedRating != null && !Number.isNaN(parsedRating) ? parsedRating : undefined,
    );
  }

  function commitSkillLevel(nextSkillLevel: string) {
    const trimmed = nextSkillLevel.trim();
    const parsed = trimmed === '' ? undefined : parseInt(trimmed, 10);
    onUpdateSkillLevel(team.id, parsed != null && !Number.isNaN(parsed) ? parsed : undefined);
  }

  function handleAvailabilityChange(player: Player | undefined, status: PlayerAvailabilityStatus) {
    if (!player) return;
    onUpdatePlayer(player.id, player.name, player.rating, player.startingSeed, status);
  }

  function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur();
  }

  const missingName = nameA.trim() === '' || nameB.trim() === '';

  return (
    <div className={missingName ? 'player-row player-row-invalid' : 'player-row'}>
      <span className="player-row-index">{index + 1}</span>
      <span className="participant-badge participant-badge-team">Team</span>
      <div className="dp-team-members">
        {[
          { name: nameA, setName: setNameA, player: playerA, label: 'Player 1' },
          { name: nameB, setName: setNameB, player: playerB, label: 'Player 2' },
        ].map(({ name, setName, player, label }, memberIndex) => (
          <div className="dp-team-member" key={player?.id ?? memberIndex}>
            <input
              type="text"
              className="player-row-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => commitName(player, name)}
              onKeyDown={blurOnEnter}
              placeholder={label}
              aria-label={`Team ${index + 1} ${label} name`}
              disabled={disabled}
            />
            <select
              className="dp-availability-select"
              value={player?.availabilityStatus ?? 'available'}
              onChange={(event) => handleAvailabilityChange(player, event.target.value as PlayerAvailabilityStatus)}
              aria-label={`Team ${index + 1} ${label} availability`}
            >
              {AVAILABILITY_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {dynamicPairingAvailabilityLabel(status)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <input
        type="number"
        className="player-row-rating"
        step="0.1"
        min="0"
        value={rating}
        onChange={(event) => setRating(event.target.value)}
        onBlur={() => commitSeedAndRating(seed, rating)}
        onKeyDown={blurOnEnter}
        placeholder="Unrated"
        aria-label={`Team ${index + 1} rating`}
        disabled={disabled}
      />
      <input
        type="number"
        className="player-row-rating"
        min={1}
        step={1}
        value={seed}
        onChange={(event) => setSeed(event.target.value)}
        onBlur={() => commitSeedAndRating(seed, rating)}
        onKeyDown={blurOnEnter}
        placeholder="Seed"
        aria-label={`Team ${index + 1} starting seed`}
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
        title={skillLevelEditable ? 'Skill level (1 = strongest)' : 'Skill level can be set once grading rounds finish'}
        aria-label={`Team ${index + 1} skill level`}
        disabled={!skillLevelEditable}
      />
      <button type="button" className="secondary" onClick={() => onUnmakeTeam(team.id)}>
        Split Team
      </button>
      <button
        type="button"
        className="danger"
        onClick={() => {
          if (playerA) onRemove(playerA.id);
          if (playerB) onRemove(playerB.id);
        }}
        disabled={disabled}
      >
        Remove
      </button>
    </div>
  );
}
