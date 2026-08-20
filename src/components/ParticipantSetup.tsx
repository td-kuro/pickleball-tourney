import type { Player, Team, TournamentSettings } from '../types';
import { maxPlayersForRound, playersNeededPerMatch } from '../utils/tournament';
import { ParticipantList } from './ParticipantList';

interface ParticipantSetupProps {
  settings: TournamentSettings;
  players: Player[];
  onAddPlayersBulk: (count: number) => void;
  onUpdatePlayer: (id: string, name: string, rating?: number) => void;
  onRemovePlayer: (id: string) => void;
  teams: Team[];
  teamPlayers: Player[];
  onMakeTeam: (player1Id: string, player2Id: string) => void;
  onUpdateTeamPlayer: (teamId: string, playerId: string, name: string, rating?: number) => void;
  onRemoveTeam: (id: string) => void;
  onUnmakeTeam: (id: string) => void;
  onRemoveAllParticipants: () => void;
}

// Doubles roster setup for every tournament/social format (Leaderboard,
// Social Play, and Pools & Knockout alike — see RosterSetup): individual
// players and fixed teams live together in one Participants list, since a
// mixed roster is a first-class setup everywhere. There's no separate Add
// Player/Add Team form — "+ Add Player" below adds one "Player N" slot
// immediately (via onAddPlayersBulk(1), same auto-naming as the old bulk
// generator), since every row is already editable in place (see
// ParticipantList/PlayerRow) — typing a name into a modal first would just
// be a redundant extra step. A team is made by checking two player rows in
// ParticipantList and confirming (see onMakeTeam / useTeams.
// addTeamFromPlayers). See utils/pairing.ts's generateMixedDoublesRound and
// utils/poolsKnockout.ts's formTeams (which combines fixed teams with
// auto-paired individuals the same way Leaderboard/Social does), and
// ParticipantList for how both kinds show up together below.
export function ParticipantSetup({
  settings,
  players,
  onAddPlayersBulk,
  onUpdatePlayer,
  onRemovePlayer,
  teams,
  teamPlayers,
  onMakeTeam,
  onUpdateTeamPlayer,
  onRemoveTeam,
  onUnmakeTeam,
  onRemoveAllParticipants,
}: ParticipantSetupProps) {
  const isPoolsKnockout = settings.playMode === 'tournament' && settings.tournamentFormat === 'pools-knockout';
  const perCourt = playersNeededPerMatch(settings.matchType);
  const maxPlayers = maxPlayersForRound(settings);
  const totalParticipants = players.length + teams.length * 2;

  function handleRemoveAll() {
    if (window.confirm('Are you sure you want to remove all participants (players and teams)?')) {
      onRemoveAllParticipants();
    }
  }

  return (
    <section className="card">
      <div className="section-heading-row">
        <h2>Participants ({players.length + teams.length})</h2>
        <button type="button" className="secondary" onClick={() => onAddPlayersBulk(1)}>
          + Add Player
        </button>
      </div>
      <p className="hint">
        {isPoolsKnockout
          ? 'Individual players are automatically paired into teams when the tournament starts.'
          : 'Individual players get grouped into temporary teams each round.'}{' '}
        Check any two players below to lock them together as a fixed team.
      </p>

      <ParticipantList
        players={players}
        teams={teams}
        teamPlayers={teamPlayers}
        onUpdatePlayer={onUpdatePlayer}
        onRemovePlayer={onRemovePlayer}
        onUpdateTeamPlayer={onUpdateTeamPlayer}
        onRemoveTeam={onRemoveTeam}
        onUnmakeTeam={onUnmakeTeam}
        onMakeTeam={onMakeTeam}
      />
      <p className="hint">
        {settings.courts} court{settings.courts === 1 ? '' : 's'} × {perCourt} players per court = up to {maxPlayers}{' '}
        players per round ({totalParticipants} player{totalParticipants === 1 ? '' : 's'} total — {players.length}{' '}
        individual, {teams.length} team{teams.length === 1 ? '' : 's'}).
      </p>
      {(players.length > 0 || teams.length > 0) && (
        <div className="section-footer-actions">
          <button type="button" className="danger" onClick={handleRemoveAll}>
            Remove All Participants
          </button>
        </div>
      )}
    </section>
  );
}
