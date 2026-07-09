import { useState } from 'react';
import type { Player } from '../types';
import { PlayerForm } from './PlayerForm';

interface PlayerListProps {
  players: Player[];
  onUpdate: (id: string, name: string, rating: number) => void;
  onRemove: (id: string) => void;
}

// Displays players as cards. Clicking "Edit" swaps a card's contents
// for a PlayerForm so the same form component handles add and edit.
export function PlayerList({ players, onUpdate, onRemove }: PlayerListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (players.length === 0) {
    return <p className="empty-state">No players yet. Add your first player above.</p>;
  }

  return (
    <div className="player-list">
      {players.map((player) => (
        <div key={player.id} className="player-card">
          {editingId === player.id ? (
            <PlayerForm
              initialName={player.name}
              initialRating={player.rating}
              submitLabel="Save"
              onSubmit={(name, rating) => {
                onUpdate(player.id, name, rating);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              <div className="player-info">
                <span className="player-name">{player.name}</span>
                <span className="player-rating">Rating: {player.rating}</span>
              </div>
              <div className="player-actions">
                <button type="button" onClick={() => setEditingId(player.id)}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => onRemove(player.id)}>
                  Remove
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
