import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { Player } from '../types';

interface PlayerListProps {
  players: Player[];
  onUpdate: (id: string, name: string, rating?: number) => void;
  onRemove: (id: string) => void;
}

// Every player row is directly editable (name + rating inputs, saved on
// blur) rather than a separate "Edit" mode — this is what lets bulk-
// generated player slots be filled in on the spot.
export function PlayerList({ players, onUpdate, onRemove }: PlayerListProps) {
  if (players.length === 0) {
    return <p className="empty-state">No players yet. Add a player or generate player slots below.</p>;
  }

  return (
    <div className="player-list">
      {players.map((player, index) => (
        <PlayerRow key={player.id} index={index} player={player} onUpdate={onUpdate} onRemove={onRemove} />
      ))}
    </div>
  );
}

interface PlayerRowProps {
  index: number;
  player: Player;
  onUpdate: (id: string, name: string, rating?: number) => void;
  onRemove: (id: string) => void;
}

function PlayerRow({ index, player, onUpdate, onRemove }: PlayerRowProps) {
  const [name, setName] = useState(player.name);
  const [rating, setRating] = useState(player.rating != null ? String(player.rating) : '');

  function commitName() {
    if (name !== player.name) {
      onUpdate(player.id, name, player.rating);
    }
  }

  function commitRating() {
    const trimmed = rating.trim();
    if (trimmed === '') {
      if (player.rating !== undefined) onUpdate(player.id, player.name, undefined);
      return;
    }
    const parsed = parseFloat(trimmed);
    if (Number.isNaN(parsed) || parsed < 0) {
      // Invalid entry: revert to the last saved value.
      setRating(player.rating != null ? String(player.rating) : '');
      return;
    }
    if (parsed !== player.rating) {
      onUpdate(player.id, player.name, parsed);
    }
  }

  function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  }

  const missingName = player.name.trim() === '';

  return (
    <div className={missingName ? 'player-row player-row-invalid' : 'player-row'}>
      <span className="player-row-index">{index + 1}</span>
      <input
        type="text"
        className="player-row-name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
        onBlur={commitName}
        onKeyDown={blurOnEnter}
        placeholder={`Player ${index + 1}`}
        aria-label={`Player ${index + 1} name`}
      />
      <input
        type="number"
        className="player-row-rating"
        step="0.1"
        min="0"
        value={rating}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setRating(event.target.value)}
        onBlur={commitRating}
        onKeyDown={blurOnEnter}
        placeholder="Unrated"
        aria-label={`Player ${index + 1} rating`}
      />
      <button type="button" className="danger" onClick={() => onRemove(player.id)}>
        Remove
      </button>
    </div>
  );
}
