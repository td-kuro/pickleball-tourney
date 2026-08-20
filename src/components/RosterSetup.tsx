import type { Player, Team, TournamentSettings } from '../types';
import { isFixedTeamsMode, maxPlayersForRound, playersNeededPerMatch } from '../utils/tournament';
import { ParticipantSetup } from './ParticipantSetup';
import { PlayerList } from './PlayerList';
import { TeamPlayersList } from './TeamList';

interface RosterSetupProps {
  settings: TournamentSettings;
  players: Player[];
  onAddPlayersBulk: (count: number) => void;
  onUpdatePlayer: (id: string, name: string, rating?: number) => void;
  onRemovePlayer: (id: string) => void;
  onRemoveAllPlayers: () => void;
  teams: Team[];
  teamPlayers: Player[];
  onAddTeamsBulk: (count: number) => void;
  onMakeTeam: (player1Id: string, player2Id: string) => void;
  onUpdateTeamPlayer: (teamId: string, playerId: string, name: string, rating?: number) => void;
  onRemoveTeam: (id: string) => void;
  onUnmakeTeam: (id: string) => void;
  onRemoveAllTeams: () => void;
}

// Setup field 6 (see App.tsx). Three shapes, depending on Match Type and
// Tournament Format:
// - Singles: Add Player only — teams aren't used in Singles at all.
// - Doubles + Pools & Knockout: the original exclusive Add Player
//   (auto-paired) OR Add Team (declared) roster — Pools & Knockout still
//   needs one roster shape for its bracket, decided by TournamentSetup's
//   Doubles Setup toggle (settings.doublesPairingMode).
// - Doubles + Leaderboard/Social Play: the unified Participants setup (see
//   ParticipantSetup) — Add Player and Add Team together, since a mixed
//   roster (some fixed teams, some individual players) is fully supported
//   there (see utils/pairing.ts's generateMixedDoublesRound).
// usePlayers and useTeams are always separate localStorage-backed hooks
// either way, so switching Match Type/Tournament Format never loses either
// roster; whichever isn't currently relevant just isn't shown. None of the
// three shapes has a separate Add Player/Add Team form any more — every
// "+" button below adds one slot immediately (onAddPlayersBulk(1) /
// onAddTeamsBulk(1), same auto-naming as generating many at once), since
// every row is already editable in place.
export function RosterSetup({
  settings,
  players,
  onAddPlayersBulk,
  onUpdatePlayer,
  onRemovePlayer,
  onRemoveAllPlayers,
  teams,
  teamPlayers,
  onAddTeamsBulk,
  onMakeTeam,
  onUpdateTeamPlayer,
  onRemoveTeam,
  onUnmakeTeam,
  onRemoveAllTeams,
}: RosterSetupProps) {
  const isPoolsKnockout = settings.playMode === 'tournament' && settings.tournamentFormat === 'pools-knockout';
  const useFixedTeams = isFixedTeamsMode(settings);

  function handleRemoveAllPlayers() {
    if (window.confirm('Are you sure you want to remove all players?')) {
      onRemoveAllPlayers();
    }
  }

  function handleRemoveAllTeams() {
    if (window.confirm('Are you sure you want to remove all teams?')) {
      onRemoveAllTeams();
    }
  }

  if (settings.matchType === 'doubles' && !isPoolsKnockout) {
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

  if (useFixedTeams) {
    const perCourt = 2; // a doubles court seats 2 fixed teams
    return (
      <section className="card">
        <div className="section-heading-row">
          <h2>Teams ({teams.length})</h2>
          <div className="participant-header-actions">
            <button type="button" className="secondary" onClick={() => onAddTeamsBulk(1)}>
              + Add Team
            </button>
            {teams.length > 0 && (
              <button type="button" className="danger" onClick={handleRemoveAllTeams}>
                Remove All Teams
              </button>
            )}
          </div>
        </div>
        <TeamPlayersList teams={teams} teamPlayers={teamPlayers} onUpdatePlayer={onUpdateTeamPlayer} onRemove={onRemoveTeam} />
        <p className="hint">
          {settings.courts} court{settings.courts === 1 ? '' : 's'} × {perCourt} teams per court = up to{' '}
          {settings.courts * perCourt} teams per round ({teams.length} team{teams.length === 1 ? '' : 's'} added).
        </p>
      </section>
    );
  }

  const perCourt = playersNeededPerMatch(settings.matchType);
  const maxPlayers = maxPlayersForRound(settings);

  return (
    <section className="card">
      <div className="section-heading-row">
        <h2>Players ({players.length})</h2>
        <div className="participant-header-actions">
          <button type="button" className="secondary" onClick={() => onAddPlayersBulk(1)}>
            + Add Player
          </button>
          {players.length > 0 && (
            <button type="button" className="danger" onClick={handleRemoveAllPlayers}>
              Remove All Players
            </button>
          )}
        </div>
      </div>
      <PlayerList players={players} onUpdate={onUpdatePlayer} onRemove={onRemovePlayer} />
      <p className="hint">
        {settings.courts} court{settings.courts === 1 ? '' : 's'} × {perCourt} players per court = up to{' '}
        {maxPlayers} players per round ({players.length} player{players.length === 1 ? '' : 's'} added).
      </p>
    </section>
  );
}
