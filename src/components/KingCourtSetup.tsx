import type { Player } from '../types';
import { validateKingCourtSetup } from '../utils/kingCourt';
import { CourtSelector } from './CourtSelector';
import { PlayerList } from './PlayerList';

interface KingCourtSetupProps {
  players: Player[];
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
  onAddPlayersBulk,
  onUpdatePlayer,
  onRemovePlayer,
  onRemoveAllPlayers,
  numberOfCourts,
  onNumberOfCourtsChange,
  locked,
}: KingCourtSetupProps) {
  const setupCheck = validateKingCourtSetup(players, numberOfCourts);

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
        <CourtSelector value={numberOfCourts} onChange={onNumberOfCourtsChange} disabled={locked} />
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
        <section className="card">
          <div className="section-heading-row">
            <h2>Players ({players.length})</h2>
            <div className="participant-header-actions">
              <button type="button" className="secondary" onClick={() => onAddPlayersBulk(1)}>
                + Add Player
              </button>
              {players.length > 0 && (
                <button type="button" className="danger" onClick={handleRemoveAllPlayers}>
                  Remove All Players
                </button>
              )}
            </div>
          </div>
          <p className="hint">Total players should equal courts × 5 (e.g. 6 courts needs 30 players).</p>
          <PlayerList players={players} onUpdate={onUpdatePlayer} onRemove={onRemovePlayer} />
        </section>
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
