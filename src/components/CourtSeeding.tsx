import type { KingCourtPlayerAssignment, Player } from '../types';
import { validateKingCourtSeeding } from '../utils/kingCourt';

interface CourtSeedingProps {
  players: Player[];
  numberOfCourts: number;
  assignments: KingCourtPlayerAssignment[];
  onAssign: (playerId: string, courtNumber: number | null) => void;
  onStartCycle1: () => void;
}

// Setup tab content, part 2: manually seed players into their starting
// courts before Cycle 1. Uses simple dropdowns rather than drag/drop (see
// the King Court spec's own fallback for this) — each player gets a
// "move to court" select, both in the unassigned pool and within a
// court's slot list.
export function CourtSeeding({ players, numberOfCourts, assignments, onAssign, onStartCycle1 }: CourtSeedingProps) {
  const courtByPlayer = new Map(assignments.map((a) => [a.playerId, a.courtNumber]));
  // Strongest court first, matching the "Court 6 = strongest" convention.
  const courtNumbers = Array.from({ length: numberOfCourts }, (_, i) => numberOfCourts - i);
  const unassigned = players.filter((p) => !courtByPlayer.has(p.id));
  const seedingCheck = validateKingCourtSeeding(assignments, players, numberOfCourts);

  function handleSelectChange(playerId: string, value: string) {
    onAssign(playerId, value === '' ? null : Number(value));
  }

  return (
    <section className="card">
      <h2>Court Seeding</h2>
      <p className="hint">
        Assign each player to a starting court — e.g. seed your strongest 5 players onto Court {numberOfCourts}. Every
        court needs exactly 5 players before Cycle 1 can start.
      </p>

      {unassigned.length > 0 && (
        <div className="kc-unassigned">
          <p className="bulk-add-label">Unassigned ({unassigned.length})</p>
          <div className="kc-unassigned-list">
            {unassigned.map((player) => (
              <div key={player.id} className="kc-unassigned-row">
                <span>{player.name}</span>
                <select
                  aria-label={`Assign ${player.name} to a court`}
                  value=""
                  onChange={(event) => handleSelectChange(player.id, event.target.value)}
                >
                  <option value="" disabled>
                    Assign to court…
                  </option>
                  {courtNumbers.map((court) => (
                    <option key={court} value={court}>
                      Court {court}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="kc-court-grid">
        {courtNumbers.map((court) => {
          const courtPlayers = players.filter((p) => courtByPlayer.get(p.id) === court);
          return (
            <div key={court} className="kc-court-card">
              <h3>
                Court {court}
                {court === numberOfCourts ? ' — Strongest' : court === 1 ? ' — Weakest' : ''}
              </h3>
              <ul className="kc-court-slots">
                {Array.from({ length: 5 }, (_, i) => courtPlayers[i]).map((player, index) => (
                  <li key={player?.id ?? index} className={player ? 'kc-court-slot filled' : 'kc-court-slot'}>
                    {player ? (
                      <>
                        <span>{player.name}</span>
                        <select
                          aria-label={`Move ${player.name}`}
                          value={court}
                          onChange={(event) => handleSelectChange(player.id, event.target.value)}
                        >
                          {courtNumbers.map((c) => (
                            <option key={c} value={c}>
                              Court {c}
                            </option>
                          ))}
                          <option value="">Unassign</option>
                        </select>
                      </>
                    ) : (
                      <span className="kc-court-slot-empty">Empty slot</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {!seedingCheck.ok && <p className="hint error">{seedingCheck.reason}</p>}

      <button type="button" className="cta-button start-button" onClick={onStartCycle1} disabled={!seedingCheck.ok}>
        Start Cycle 1
      </button>
    </section>
  );
}
