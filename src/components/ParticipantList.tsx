import { useState } from 'react';
import type { Player, Team } from '../types';
import { PlayerRow } from './PlayerList';
import { TeamPlayersRow } from './TeamList';

interface ParticipantListProps {
  players: Player[];
  teams: Team[];
  teamPlayers: Player[];
  onUpdatePlayer: (id: string, name: string, rating?: number) => void;
  onRemovePlayer: (id: string) => void;
  onUpdateTeamPlayer: (teamId: string, playerId: string, name: string, rating?: number) => void;
  onRemoveTeam: (id: string) => void;
  onUnmakeTeam: (id: string) => void;
  // Promotes the two currently-selected individual players into a fixed
  // team — see useTeams.addTeamFromPlayers. Only individual players are
  // selectable (checkbox on PlayerRow); team rows can't be re-teamed.
  onMakeTeam: (player1Id: string, player2Id: string) => void;
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
// PlayerRow for individual players and TeamList's TeamPlayersRow for team
// rows (with onUnmakeTeam given — Pools & Knockout's plain fixed-teams
// roster reuses the same row without it, see TeamList.TeamPlayersList).
// Team creation lives here too: check two player checkboxes and confirm in
// the bar that appears, rather than a separate Add Team form — see
// onMakeTeam.
export function ParticipantList({
  players,
  teams,
  teamPlayers,
  onUpdatePlayer,
  onRemovePlayer,
  onUpdateTeamPlayer,
  onRemoveTeam,
  onUnmakeTeam,
  onMakeTeam,
}: ParticipantListProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (players.length === 0 && teams.length === 0) {
    return <p className="empty-state">No participants yet. Add a player above.</p>;
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id);
      if (current.length >= 2) return [current[1], id];
      return [...current, id];
    });
  }

  function handleMakeTeam() {
    if (selectedIds.length !== 2) return;
    onMakeTeam(selectedIds[0], selectedIds[1]);
    setSelectedIds([]);
  }

  const playerById = new Map(teamPlayers.map((p) => [p.id, p]));

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
      {selectedIds.length === 2 && (
        <div className="make-team-bar">
          <span>2 players selected</span>
          <button type="button" onClick={handleMakeTeam}>
            Make Team
          </button>
          <button type="button" className="secondary" onClick={() => setSelectedIds([])}>
            Cancel
          </button>
        </div>
      )}
      {entries.map((entry, index) =>
        entry.kind === 'player' ? (
          <PlayerRow
            key={entry.player.id}
            index={index}
            player={entry.player}
            onUpdate={onUpdatePlayer}
            onRemove={onRemovePlayer}
            badge="Player"
            selectable
            selected={selectedIds.includes(entry.player.id)}
            onToggleSelect={toggleSelect}
          />
        ) : (
          <TeamPlayersRow
            key={entry.team.id}
            index={index}
            team={entry.team}
            player1={playerById.get(entry.team.playerIds[0])}
            player2={playerById.get(entry.team.playerIds[1])}
            onUpdatePlayer={onUpdateTeamPlayer}
            onRemove={onRemoveTeam}
            onUnmakeTeam={onUnmakeTeam}
            badge="Team"
          />
        ),
      )}
    </div>
  );
}
