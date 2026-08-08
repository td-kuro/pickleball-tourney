import { useState, type FormEvent } from 'react';
import type { KingCourtCourtCycle } from '../types';
import { getKingCourtGameWinner } from '../utils/kingCourt';

interface KingCourtGameCardProps {
  court: KingCourtCourtCycle;
  gameNumber: number;
  nameById: Map<string, string>;
  onSetScore: (team1Score: number, team2Score: number) => void;
}

// One court's score-entry card for the cycle's current game — the King
// Court equivalent of CurrentRoundView's ScoredMatchCard. Give this
// component a `key` that changes with the game/cycle number where it's
// rendered (see KingCourtView) so its local score-input state doesn't
// leak between games.
export function KingCourtGameCard({ court, gameNumber, nameById, onSetScore }: KingCourtGameCardProps) {
  const game = court.games.find((g) => g.gameNumber === gameNumber);
  const [team1Score, setTeam1Score] = useState(game?.team1Score != null ? String(game.team1Score) : '');
  const [team2Score, setTeam2Score] = useState(game?.team2Score != null ? String(game.team2Score) : '');
  const [error, setError] = useState<string | null>(null);

  if (!game) return null;

  const winner = getKingCourtGameWinner(game);

  function teamLabel(ids: string[]): string {
    return ids.map((id) => nameById.get(id) ?? 'Unknown player').join(' & ');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsed1 = Number(team1Score);
    const parsed2 = Number(team2Score);
    if (team1Score.trim() === '' || team2Score.trim() === '' || Number.isNaN(parsed1) || Number.isNaN(parsed2)) {
      setError('Enter a valid score for both teams.');
      return;
    }
    if (parsed1 < 0 || parsed2 < 0) {
      setError('Scores cannot be negative.');
      return;
    }

    setError(null);
    onSetScore(parsed1, parsed2);
  }

  return (
    <form className="match-card" onSubmit={handleSubmit}>
      <div className="match-header">
        Court {court.courtNumber} — Game {gameNumber} of 5
      </div>
      <p className="hint kc-resting-hint">Resting: {nameById.get(game.restingPlayerId) ?? 'Unknown player'}</p>

      <div className="match-teams">
        <div className={winner === 1 ? 'match-team winner' : 'match-team'}>
          <span className="match-team-name">{teamLabel(game.team1PlayerIds)}</span>
          <input
            type="number"
            min={0}
            value={team1Score}
            onChange={(event) => setTeam1Score(event.target.value)}
            aria-label={`${teamLabel(game.team1PlayerIds)} score`}
          />
        </div>
        <div className="match-vs">vs</div>
        <div className={winner === 2 ? 'match-team winner' : 'match-team'}>
          <span className="match-team-name">{teamLabel(game.team2PlayerIds)}</span>
          <input
            type="number"
            min={0}
            value={team2Score}
            onChange={(event) => setTeam2Score(event.target.value)}
            aria-label={`${teamLabel(game.team2PlayerIds)} score`}
          />
        </div>
      </div>

      {error && <p className="hint error">{error}</p>}
      {winner && (
        <p className="hint winner-hint">Winner: {winner === 1 ? teamLabel(game.team1PlayerIds) : teamLabel(game.team2PlayerIds)}</p>
      )}

      <button type="submit" className="secondary">
        Save Score
      </button>
    </form>
  );
}
