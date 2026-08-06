import { useId, useState, type FormEvent } from 'react';

interface TeamFormProps {
  onSubmit: (player1Name: string, player2Name: string, teamName: string, rating?: number) => void;
}

// Quick "add one fixed team" form: 2 required player names, an optional
// team name (auto-generated from the player names if left blank — see
// useTeams.addTeam), and an optional rating. (Editing existing teams
// happens inline in TeamList, not here — same pattern as PlayerForm.)
export function TeamForm({ onSubmit }: TeamFormProps) {
  const [teamName, setTeamName] = useState('');
  const [player1Name, setPlayer1Name] = useState('');
  const [player2Name, setPlayer2Name] = useState('');
  const [rating, setRating] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmedPlayer1 = player1Name.trim();
    const trimmedPlayer2 = player2Name.trim();
    if (!trimmedPlayer1 || !trimmedPlayer2) {
      setError('Enter both player names.');
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
    onSubmit(trimmedPlayer1, trimmedPlayer2, teamName.trim(), parsedRating);
    setTeamName('');
    setPlayer1Name('');
    setPlayer2Name('');
    setRating('');
  }

  return (
    <form className="player-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor={`${id}-team-name`}>Team name (optional)</label>
        <input
          id={`${id}-team-name`}
          type="text"
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="e.g. Thai / Alex"
        />
      </div>
      <div className="form-row">
        <label htmlFor={`${id}-player1`}>Player 1</label>
        <input
          id={`${id}-player1`}
          type="text"
          value={player1Name}
          onChange={(event) => setPlayer1Name(event.target.value)}
          placeholder="Player 1 name"
          required
        />
      </div>
      <div className="form-row">
        <label htmlFor={`${id}-player2`}>Player 2</label>
        <input
          id={`${id}-player2`}
          type="text"
          value={player2Name}
          onChange={(event) => setPlayer2Name(event.target.value)}
          placeholder="Player 2 name"
          required
        />
      </div>
      <div className="form-row">
        <label htmlFor={`${id}-rating`}>Rating (optional)</label>
        <input
          id={`${id}-rating`}
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
        <button type="submit">Add Team</button>
      </div>
    </form>
  );
}
