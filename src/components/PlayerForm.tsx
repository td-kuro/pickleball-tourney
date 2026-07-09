import { useId, useState, type FormEvent } from 'react';

interface PlayerFormProps {
  initialName?: string;
  initialRating?: number;
  submitLabel: string;
  onSubmit: (name: string, rating: number) => void;
  onCancel?: () => void;
}

// A single form used both for adding a new player and editing an
// existing one (PlayerList passes initialName/initialRating when editing).
export function PlayerForm({
  initialName = '',
  initialRating = 3.5,
  submitLabel,
  onSubmit,
  onCancel,
}: PlayerFormProps) {
  const [name, setName] = useState(initialName);
  const [rating, setRating] = useState(String(initialRating));
  // Multiple PlayerForm instances can be on screen at once (the "add" form
  // plus a card being edited), so ids must be unique per instance.
  const id = useId();
  const nameFieldId = `${id}-name`;
  const ratingFieldId = `${id}-rating`;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    const parsedRating = parseFloat(rating);
    if (!trimmedName || Number.isNaN(parsedRating)) return;

    onSubmit(trimmedName, parsedRating);

    if (!onCancel) {
      // Reset the form after adding a new player (edit mode unmounts instead).
      setName('');
      setRating(String(initialRating));
    }
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
        <label htmlFor={ratingFieldId}>Rating</label>
        <input
          id={ratingFieldId}
          type="number"
          step="0.1"
          min="0"
          value={rating}
          onChange={(event) => setRating(event.target.value)}
          placeholder="e.g. 3.5"
          required
        />
      </div>
      <div className="form-actions">
        <button type="submit">{submitLabel}</button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
