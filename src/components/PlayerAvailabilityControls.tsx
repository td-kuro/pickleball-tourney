import type { Player, PlayerAvailabilityStatus } from '../types';
import { DESTRUCTIVE_CONFIRMATIONS, STATUS_BADGE_CLASS } from './playerStatusPresentation';

interface PlayerAvailabilityControlsProps {
  players: Player[];
  onSetStatus: (playerId: string, status: PlayerAvailabilityStatus) => void;
  statusLabel: (status: PlayerAvailabilityStatus) => string;
}

// Mid-session availability actions for one player — reused by Standard
// Social Play's SessionControls and Dynamic Pairing Social's Resting
// Players view (both share the same PlayerAvailabilityStatus, see
// types.ts). Deliberately generic over `players`/`onSetStatus` /
// `statusLabel` rather than importing a specific mode's utils, so this
// component itself doesn't need to know which mode is using it — see
// utils/tournament.ts's availabilityStatusLabel and
// utils/dynamicPairingSocial.ts's dynamicPairingAvailabilityLabel for the
// two label functions callers pass in.
export function PlayerAvailabilityControls({ players, onSetStatus, statusLabel }: PlayerAvailabilityControlsProps) {
  if (players.length === 0) {
    return (
      <section className="card">
        <h2>Manage Player Availability</h2>
        <p className="empty-state">Add players to manage their availability.</p>
      </section>
    );
  }

  function handleSetStatus(player: Player, status: PlayerAvailabilityStatus) {
    const confirmMessage = DESTRUCTIVE_CONFIRMATIONS[status]?.(player.name);
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    onSetStatus(player.id, status);
  }

  return (
    <section className="card">
      <h2>Manage Player Availability</h2>
      <p className="hint">
        Handle real-world changes without losing a player's completed stats or history — resting/unavailable/left
        early/injured players are simply excluded from future rounds, never deleted.
      </p>
      <div className="player-list">
        {players.map((player) => {
          const status = player.availabilityStatus ?? 'available';
          return (
            <div key={player.id} className="player-row availability-row">
              <span className="player-row-name availability-row-name">{player.name}</span>
              <span className={STATUS_BADGE_CLASS[status]}>{statusLabel(status)}</span>
              <div className="availability-actions">
                {status !== 'available' && (
                  <button type="button" className="secondary" onClick={() => handleSetStatus(player, 'available')}>
                    Make available
                  </button>
                )}
                {status !== 'resting-this-round' && (
                  <button type="button" className="secondary" onClick={() => handleSetStatus(player, 'resting-this-round')}>
                    Rest this round
                  </button>
                )}
                {status !== 'late' && (
                  <button type="button" className="secondary" onClick={() => handleSetStatus(player, 'late')}>
                    Mark late
                  </button>
                )}
                {status !== 'unavailable' && (
                  <button type="button" className="secondary" onClick={() => handleSetStatus(player, 'unavailable')}>
                    Mark unavailable
                  </button>
                )}
                {status !== 'left-early' && (
                  <button type="button" className="danger" onClick={() => handleSetStatus(player, 'left-early')}>
                    Left early
                  </button>
                )}
                {status !== 'injured' && (
                  <button type="button" className="danger" onClick={() => handleSetStatus(player, 'injured')}>
                    Injured
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
