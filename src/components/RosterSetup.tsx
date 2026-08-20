import type { Player, Team, TournamentSettings } from '../types';
import { maxPlayersForRound, playersNeededPerMatch } from '../utils/tournament';
import { ParticipantSetup } from './ParticipantSetup';
import { PlayerList } from './PlayerList';

interface RosterSetupProps {
  settings: TournamentSettings;
  players: Player[];
  onAddPlayersBulk: (count: number) => void;
  onUpdatePlayer: (id: string, name: string, rating?: number) => void;
  onRemovePlayer: (id: string) => void;
  onRemoveAllPlayers: () => void;
  teams: Team[];
  teamPlayers: Player[];
  onMakeTeam: (player1Id: string, player2Id: string) => void;
  onUpdateTeamPlayer: (teamId: string, playerId: string, name: string, rating?: number) => void;
  onRemoveTeam: (id: string) => void;
  onUnmakeTeam: (id: string) => void;
  onRemoveAllTeams: () => void;
}

// Setup field 6 (see App.tsx). Two shapes, depending on Match Type:
// - Singles: Add Player only — teams aren't used in Singles at all.
// - Doubles: the unified Participants setup (see ParticipantSetup) — Add
//   Player and Add Team together, since a mixed roster (some fixed teams,
//   some individual players) is fully supported for every Doubles format,
//   including Pools & Knockout (see utils/pairing.ts's
//   generateMixedDoublesRound and utils/poolsKnockout.ts's formTeams,
//   which both combine declared fixed teams with auto-paired individual
//   players the same way).
// usePlayers and useTeams are always separate localStorage-backed hooks
// either way, so switching Match Type never loses either roster; whichever
// isn't currently relevant just isn't shown. Neither shape has a separate
// Add Player/Add Team form — every "+" button below adds one slot
// immediately (onAddPlayersBulk(1) / onAddTeamsBulk(1), same auto-naming
// as generating many at once), since every row is already editable in
// place.
export function RosterSetup({
  settings,
  players,
  onAddPlayersBulk,
  onUpdatePlayer,
  onRemovePlayer,
  onRemoveAllPlayers,
  teams,
  teamPlayers,
  onMakeTeam,
  onUpdateTeamPlayer,
  onRemoveTeam,
  onUnmakeTeam,
  onRemoveAllTeams,
}: RosterSetupProps) {
  function handleRemoveAllPlayers() {
    if (window.confirm('Are you sure you want to remove all players?')) {
      onRemoveAllPlayers();
    }
  }

  if (settings.matchType === 'doubles') {
    return (
      <ParticipantSetup
        settings={settings}
        players={players}
        onAddPlayersBulk={onAddPlayersBulk}
        onUpdatePlayer={onUpdatePlayer}
        onRemovePlayer={onRemovePlayer}
        teams={teams}
        teamPlayers={teamPlayers}
        onMakeTeam={onMakeTeam}
        onUpdateTeamPlayer={onUpdateTeamPlayer}
        onRemoveTeam={onRemoveTeam}
        onUnmakeTeam={onUnmakeTeam}
        onRemoveAllParticipants={() => {
          onRemoveAllPlayers();
          onRemoveAllTeams();
        }}
      />
    );
  }

  const perCourt = playersNeededPerMatch(settings.matchType);
  const maxPlayers = maxPlayersForRound(settings);

  return (
    <section className="card">
      <div className="section-heading-row">
        <h2>Players ({players.length})</h2>
        <button type="button" className="secondary" onClick={() => onAddPlayersBulk(1)}>
          + Add Player
        </button>
      </div>
      <PlayerList players={players} onUpdate={onUpdatePlayer} onRemove={onRemovePlayer} />
      <p className="hint">
        {settings.courts} court{settings.courts === 1 ? '' : 's'} × {perCourt} players per court = up to{' '}
        {maxPlayers} players per round ({players.length} player{players.length === 1 ? '' : 's'} added).
      </p>
      {players.length > 0 && (
        <div className="section-footer-actions">
          <button type="button" className="danger" onClick={handleRemoveAllPlayers}>
            Remove All Players
          </button>
        </div>
      )}
    </section>
  );
}
