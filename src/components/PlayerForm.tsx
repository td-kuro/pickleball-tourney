import { useId, useState, type FormEvent } from 'react';

interface PlayerFormProps {
  onSubmit: (name: string, rating?: number) => void;
}

// Quick "add one player" form. Rating is optional — leave it blank for an
// unrated player. (Editing existing players happens inline in PlayerList,
// not here.)
export function PlayerForm({ onSubmit }: PlayerFormProps) {
  const [name, setName] = useState('');
  const [rating, setRating] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const nameFieldId = `${id}-name`;
  const ratingFieldId = `${id}-rating`;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter a player name.');
      return;
    }

    let parsedRating: number | undefined;
    const trimmedRating = rating.trim();
    if (trimmedRating !== '') {
      const parsed = parseFloat(trimmedRating);
      if (Number.isNaN(parsed) || parsed < 0) {
        setError('Rating must be a valid, non-negative number, or left blank.');
        return;
      }
      parsedRating = parsed;
    }

    setError(null);
    onSubmit(trimmedName, parsedRating);
    setName('');
    setRating('');
  }

  return (
    <form className="player-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor={nameFieldId}>Name</label>
        <input
          id={nameFieldId}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Player name"
          required
        />
      </div>
      <div className="form-row">
        <label htmlFor={ratingFieldId}>Rating (optional)</label>
        <input
          id={ratingFieldId}
          type="number"
          step="0.1"
          min="0"
          value={rating}
          onChange={(event) => setRating(event.target.value)}
          placeholder="Unrated"
        />
      </div>
      {error && <p className="hint error">{error}</p>}

      <div className="form-actions">
        <button type="submit">Add Player</button>
      </div>
    </form>
  );
}
