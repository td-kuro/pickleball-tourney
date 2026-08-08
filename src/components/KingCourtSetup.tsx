import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { Player } from '../types';
import { validateKingCourtSetup } from '../utils/kingCourt';
import { PlayerForm } from './PlayerForm';
import { PlayerList } from './PlayerList';

interface KingCourtSetupProps {
  players: Player[];
  onAddPlayer: (name: string, rating?: number) => void;
  onAddPlayersBulk: (count: number) => void;
  onUpdatePlayer: (id: string, name: string, rating?: number) => void;
  onRemovePlayer: (id: string) => void;
  onRemoveAllPlayers: () => void;
  numberOfCourts: number;
  onNumberOfCourtsChange: (courts: number) => void;
  // True once Cycle 1 has started — the roster and court count lock at
  // that point, same spirit as Tournament Format locking once Start
  // Matches is clicked (see TournamentSetup).
  locked: boolean;
}

// Setup tab content, part 1 (see CourtSeeding for part 2): number of
// courts and the player roster. Reuses PlayerForm/PlayerList directly
// (the same components RosterSetup uses for Add Player) rather than
// duplicating player management — King Court shares usePlayers's roster
// with Tournament/Social Play, see App.tsx.
export function KingCourtSetup({
  players,
  onAddPlayer,
  onAddPlayersBulk,
  onUpdatePlayer,
  onRemovePlayer,
  onRemoveAllPlayers,
  numberOfCourts,
  onNumberOfCourtsChange,
  locked,
}: KingCourtSetupProps) {
  const [bulkCount, setBulkCount] = useState('');
  const bulkCountValue = parseInt(bulkCount, 10);
  const setupCheck = validateKingCourtSetup(players, numberOfCourts);

  function handleCourtsChange(event: ChangeEvent<HTMLInputElement>) {
    const parsed = parseInt(event.target.value, 10);
    onNumberOfCourtsChange(Number.isNaN(parsed) ? 1 : Math.max(1, parsed));
  }

  function handleGenerateSlots(event: FormEvent) {
    event.preventDefault();
    if (Number.isNaN(bulkCountValue) || bulkCountValue < 1) return;
    onAddPlayersBulk(bulkCountValue);
    setBulkCount('');
  }

  function handleRemoveAllPlayers() {
    if (window.confirm('Are you sure you want to remove all players?')) {
      onRemoveAllPlayers();
    }
  }

  return (
    <>
      <section className="card">
        <h2>King Court Setup</h2>
        <p className="hint">
          Each court seats exactly 5 players — 4 play doubles while 1 rests, rotating every game so everyone partners
          with everyone else once per 5-game cycle.
        </p>
        <div className="form-row">
          <label htmlFor="kc-courts">Number of Courts</label>
          <input
            id="kc-courts"
            type="number"
            min={1}
            value={numberOfCourts}
            onChange={handleCourtsChange}
            disabled={locked}
          />
        </div>
        <p className="hint">
          Higher court number means stronger court — Court {numberOfCourts} is the strongest, Court 1 the weakest.
        </p>
        <p className={setupCheck.ok ? 'hint winner-hint' : 'hint error'}>
          {setupCheck.ok
            ? `${players.length} players ready for ${numberOfCourts} court${numberOfCourts === 1 ? '' : 's'}.`
            : setupCheck.reason}
        </p>
      </section>

      {!locked && (
        <div className="setup-grid">
          <section className="card">
            <h2>Add Player</h2>
            <p className="hint">Total players should equal courts × 5 (e.g. 6 courts needs 30 players).</p>
            <PlayerForm onSubmit={onAddPlayer} />

            <div className="bulk-add">
              <p className="bulk-add-label">Or generate multiple player slots</p>
              <form className="bulk-add-form" onSubmit={handleGenerateSlots}>
                <input
                  type="number"
                  min={1}
                  value={bulkCount}
                  onChange={(event) => setBulkCount(event.target.value)}
                  placeholder="e.g. 15"
                  aria-label="Number of players to generate"
                />
                <button type="submit" className="secondary" disabled={Number.isNaN(bulkCountValue) || bulkCountValue < 1}>
                  Generate Player Slots
                </button>
              </form>
            </div>
          </section>

          <section className="card">
            <div className="section-heading-row">
              <h2>Players ({players.length})</h2>
              {players.length > 0 && (
                <button type="button" className="danger" onClick={handleRemoveAllPlayers}>
                  Remove All Players
                </button>
              )}
            </div>
            <PlayerList players={players} onUpdate={onUpdatePlayer} onRemove={onRemovePlayer} />
          </section>
        </div>
      )}

      {locked && (
        <section className="card">
          <h2>Players ({players.length})</h2>
          <p className="hint">
            The roster is locked while a King Court session is active — use Reset King Court to start over with a
            different roster or court count.
          </p>
        </section>
      )}
    </>
  );
}
