import type { Player, Team } from '../types';
import { PlayerRow } from './PlayerList';
import { TeamRow } from './TeamList';

interface ParticipantListProps {
  players: Player[];
  teams: Team[];
  teamPlayers: Player[];
  onUpdatePlayer: (id: string, name: string, rating?: number) => void;
  onRemovePlayer: (id: string) => void;
  onUpdateTeam: (id: string, player1Name: string, player2Name: string, teamName: string, rating?: number) => void;
  onRemoveTeam: (id: string) => void;
}

// ids are minted as `<prefix>-<Date.now()>-...` (see usePlayers/useTeams),
// so the timestamp segment doubles as a stable "added in this order" key —
// letting individual players and fixed teams interleave in one list in the
// order they were actually added, without a separate participants store.
function idTimestamp(id: string): number {
  const value = Number(id.split('-')[1]);
  return Number.isNaN(value) ? 0 : value;
}

type ParticipantEntry = { kind: 'player'; player: Player } | { kind: 'team'; team: Team };

// The unified Doubles roster for Leaderboard/Social Play (see
// ParticipantSetup, RosterSetup): individual players and fixed teams shown
// together, in the order they were added, each badged "Player" or "Team" —
// see the spec example: "Thai — Player", "Ben / Sarah — Team". Reuses
// PlayerRow/TeamRow directly (same inline-edit-on-blur rows Add
// Player/Add Team already use elsewhere) rather than duplicating their
// editing logic.
export function ParticipantList({
  players,
  teams,
  teamPlayers,
  onUpdatePlayer,
  onRemovePlayer,
  onUpdateTeam,
  onRemoveTeam,
}: ParticipantListProps) {
  if (players.length === 0 && teams.length === 0) {
    return <p className="empty-state">No participants yet. Add a player or a team below.</p>;
  }

  const playerNameById = new Map(teamPlayers.map((p) => [p.id, p.name]));

  const entries: ParticipantEntry[] = [
    ...players.map((player): ParticipantEntry => ({ kind: 'player', player })),
    ...teams.map((team): ParticipantEntry => ({ kind: 'team', team })),
  ].sort((a, b) => {
    const idA = a.kind === 'player' ? a.player.id : a.team.id;
    const idB = b.kind === 'player' ? b.player.id : b.team.id;
    return idTimestamp(idA) - idTimestamp(idB);
  });

  return (
    <div className="player-list">
      {entries.map((entry, index) =>
        entry.kind === 'player' ? (
          <PlayerRow
            key={entry.player.id}
            index={index}
            player={entry.player}
            onUpdate={onUpdatePlayer}
            onRemove={onRemovePlayer}
            badge="Player"
          />
        ) : (
          <TeamRow
            key={entry.team.id}
            index={index}
            team={entry.team}
            player1Name={playerNameById.get(entry.team.playerIds[0]) ?? ''}
            player2Name={playerNameById.get(entry.team.playerIds[1]) ?? ''}
            onUpdate={onUpdateTeam}
            onRemove={onRemoveTeam}
            badge="Team"
          />
        ),
      )}
    </div>
  );
}
