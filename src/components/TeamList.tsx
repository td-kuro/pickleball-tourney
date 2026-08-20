import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { Player, Team } from '../types';

interface TeamPlayersListProps {
  teams: Team[];
  teamPlayers: Player[];
  onUpdatePlayer: (teamId: string, playerId: string, name: string, rating?: number) => void;
  onRemove: (id: string) => void;
}

// A flat "Teams (N)" roster of fixed teams only (Pools & Knockout's
// fixed-teams roster — see RosterSetup's useFixedTeams branch). No team
// name field and no shared team-level rating input — each player's own
// name and rating is editable in place (see TeamPlayersRow), same as the
// mixed Participants roster (ParticipantList), which reuses TeamPlayersRow
// directly with its onUnmakeTeam prop added — this component omits that
// prop since there's no individual-player pool here to revert a team into.
export function TeamPlayersList({ teams, teamPlayers, onUpdatePlayer, onRemove }: TeamPlayersListProps) {
  if (teams.length === 0) {
    return <p className="empty-state">No teams yet. Add a team above.</p>;
  }

  const playerById = new Map(teamPlayers.map((player) => [player.id, player]));

  return (
    <div className="player-list">
      {teams.map((team, index) => (
        <TeamPlayersRow
          key={team.id}
          index={index}
          team={team}
          player1={playerById.get(team.playerIds[0])}
          player2={playerById.get(team.playerIds[1])}
          onUpdatePlayer={onUpdatePlayer}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

interface TeamPlayersRowProps {
  index: number;
  team: Team;
  player1: Player | undefined;
  player2: Player | undefined;
  onUpdatePlayer: (teamId: string, playerId: string, name: string, rating?: number) => void;
  onRemove: (id: string) => void;
  // Only ParticipantList passes this — "Split Team", reverting the team
  // back into two individual players (see useTeams.removeTeamKeepPlayers).
  // Omitted here, so the button doesn't render.
  onUnmakeTeam?: (id: string) => void;
  badge?: string;
}

// One fixed team's row: each player's own name and rating, editable in
// place (team.name/team.rating are derived from these — see
// useTeams.updateTeamPlayer), plus "Split Team" (when onUnmakeTeam is
// given) and "Remove" (delete the team and both players entirely).
export function TeamPlayersRow({ index, team, player1, player2, onUpdatePlayer, onRemove, onUnmakeTeam, badge }: TeamPlayersRowProps) {
  const [name1, setName1] = useState(player1?.name ?? '');
  const [rating1, setRating1] = useState(player1?.rating != null ? String(player1.rating) : '');
  const [name2, setName2] = useState(player2?.name ?? '');
  const [rating2, setRating2] = useState(player2?.rating != null ? String(player2.rating) : '');

  function commit(playerId: string | undefined, name: string, ratingText: string) {
    if (!playerId) return;
    const trimmed = ratingText.trim();
    let rating: number | undefined;
    if (trimmed !== '') {
      const parsed = parseFloat(trimmed);
      if (!Number.isNaN(parsed) && parsed >= 0) rating = parsed;
    }
    onUpdatePlayer(team.id, playerId, name, rating);
  }

  function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur();
  }

  const missingName = name1.trim() === '' || name2.trim() === '';

  return (
    <div className={missingName ? 'player-row player-row-invalid' : 'player-row'}>
      <span className="player-row-index">{index + 1}</span>
      {badge && <span className="participant-badge participant-badge-team">{badge}</span>}
      <input
        type="text"
        className="player-row-name"
        value={name1}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setName1(event.target.value)}
        onBlur={() => commit(player1?.id, name1, rating1)}
        onKeyDown={blurOnEnter}
        placeholder="Player 1"
        aria-label={`Team ${index + 1} player 1 name`}
      />
      <input
        type="number"
        className="player-row-rating"
        step="0.1"
        min="0"
        value={rating1}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setRating1(event.target.value)}
        onBlur={() => commit(player1?.id, name1, rating1)}
        onKeyDown={blurOnEnter}
        placeholder="Unrated"
        aria-label={`Team ${index + 1} player 1 rating`}
      />
      <input
        type="text"
        className="player-row-name"
        value={name2}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setName2(event.target.value)}
        onBlur={() => commit(player2?.id, name2, rating2)}
        onKeyDown={blurOnEnter}
        placeholder="Player 2"
        aria-label={`Team ${index + 1} player 2 name`}
      />
      <input
        type="number"
        className="player-row-rating"
        step="0.1"
        min="0"
        value={rating2}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setRating2(event.target.value)}
        onBlur={() => commit(player2?.id, name2, rating2)}
        onKeyDown={blurOnEnter}
        placeholder="Unrated"
        aria-label={`Team ${index + 1} player 2 rating`}
      />
      {onUnmakeTeam && (
        <button type="button" className="secondary" onClick={() => onUnmakeTeam(team.id)}>
          Split Team
        </button>
      )}
      <button type="button" className="danger" onClick={() => onRemove(team.id)}>
        Remove
      </button>
    </div>
  );
}
