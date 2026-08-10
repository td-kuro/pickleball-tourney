import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { Player, Team } from '../types';

interface TeamListProps {
  teams: Team[];
  teamPlayers: Player[];
  onUpdate: (id: string, player1Name: string, player2Name: string, teamName: string, rating?: number) => void;
  onRemove: (id: string) => void;
}

// Every fixed team is directly editable, same philosophy as PlayerList:
// team name, both player names, and rating are all inline inputs saved on
// blur, no separate "Edit" mode.
export function TeamList({ teams, teamPlayers, onUpdate, onRemove }: TeamListProps) {
  if (teams.length === 0) {
    return <p className="empty-state">No teams yet. Add a team below.</p>;
  }

  const playerNameById = new Map(teamPlayers.map((player) => [player.id, player.name]));

  return (
    <div className="player-list">
      {teams.map((team, index) => (
        <TeamRow
          key={team.id}
          index={index}
          team={team}
          player1Name={playerNameById.get(team.playerIds[0]) ?? ''}
          player2Name={playerNameById.get(team.playerIds[1]) ?? ''}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

interface TeamRowProps {
  index: number;
  team: Team;
  player1Name: string;
  player2Name: string;
  onUpdate: (id: string, player1Name: string, player2Name: string, teamName: string, rating?: number) => void;
  onRemove: (id: string) => void;
  // See PlayerRow's `badge` — same purpose, for ParticipantList's merged
  // Player/Team list.
  badge?: string;
}

export function TeamRow({ index, team, player1Name, player2Name, onUpdate, onRemove, badge }: TeamRowProps) {
  const [teamName, setTeamName] = useState(team.name);
  const [player1, setPlayer1] = useState(player1Name);
  const [player2, setPlayer2] = useState(player2Name);
  const [rating, setRating] = useState(team.rating != null ? String(team.rating) : '');

  function commit(nextTeamName: string, nextPlayer1: string, nextPlayer2: string, nextRating: string) {
    const trimmedRating = nextRating.trim();
    let parsedRating: number | undefined = team.rating;
    if (trimmedRating === '') {
      parsedRating = undefined;
    } else {
      const parsed = parseFloat(trimmedRating);
      if (!Number.isNaN(parsed) && parsed >= 0) parsedRating = parsed;
    }
    onUpdate(team.id, nextPlayer1, nextPlayer2, nextTeamName, parsedRating);
  }

  function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur();
  }

  const missingName = player1.trim() === '' || player2.trim() === '';

  return (
    <div className={missingName ? 'player-row player-row-invalid' : 'player-row'}>
      <span className="player-row-index">{index + 1}</span>
      {badge && <span className="participant-badge participant-badge-team">{badge}</span>}
      <input
        type="text"
        className="player-row-name"
        value={teamName}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setTeamName(event.target.value)}
        onBlur={() => commit(teamName, player1, player2, rating)}
        onKeyDown={blurOnEnter}
        placeholder={player1 && player2 ? `${player1} / ${player2}` : `Team ${index + 1}`}
        aria-label={`Team ${index + 1} name`}
      />
      <input
        type="text"
        className="player-row-name"
        value={player1}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setPlayer1(event.target.value)}
        onBlur={() => commit(teamName, player1, player2, rating)}
        onKeyDown={blurOnEnter}
        placeholder="Player 1"
        aria-label={`Team ${index + 1} player 1 name`}
      />
      <input
        type="text"
        className="player-row-name"
        value={player2}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setPlayer2(event.target.value)}
        onBlur={() => commit(teamName, player1, player2, rating)}
        onKeyDown={blurOnEnter}
        placeholder="Player 2"
        aria-label={`Team ${index + 1} player 2 name`}
      />
      <input
        type="number"
        className="player-row-rating"
        step="0.1"
        min="0"
        value={rating}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setRating(event.target.value)}
        onBlur={() => commit(teamName, player1, player2, rating)}
        onKeyDown={blurOnEnter}
        placeholder="Unrated"
        aria-label={`Team ${index + 1} rating`}
      />
      <button type="button" className="danger" onClick={() => onRemove(team.id)}>
        Remove
      </button>
    </div>
  );
}
