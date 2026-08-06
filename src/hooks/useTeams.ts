import type { Player, Team } from '../types';
import { useLocalStorage } from './useLocalStorage';

const TEAMS_KEY = 'pickleball-tourney:teams';
const TEAM_PLAYERS_KEY = 'pickleball-tourney:teamPlayers';

function makeTeamId(): string {
  return `team-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function makeTeamPlayerId(salt = 0): string {
  return `teamplayer-${Date.now()}-${salt}-${Math.floor(Math.random() * 10000)}`;
}

function displayName(teamName: string, player1Name: string, player2Name: string): string {
  const trimmed = teamName.trim();
  return trimmed !== '' ? trimmed : `${player1Name} / ${player2Name}`;
}

// Manages Doubles "Add Team" (Fixed Teams) rosters, kept saved to
// localStorage — a Team-based parallel to usePlayers. `teamPlayers` is the
// backing Player[] for the two players embedded in each team (so all the
// existing name-lookup code in Leaderboard/AllRoundsView/computePlayerStats/
// etc. keeps working unchanged — see App.tsx, which passes this instead of
// usePlayers's list whenever Fixed Teams mode is active); it's a completely
// separate roster from usePlayers's, since "Add Team" doesn't build on top
// of a previously-added player list, it creates both players and the team
// together in one step.
export function useTeams() {
  const [teams, setTeams] = useLocalStorage<Team[]>(TEAMS_KEY, []);
  const [teamPlayers, setTeamPlayers] = useLocalStorage<Player[]>(TEAM_PLAYERS_KEY, []);

  function addTeam(player1Name: string, player2Name: string, teamName = '', rating?: number) {
    const player1: Player = { id: makeTeamPlayerId(0), name: player1Name };
    const player2: Player = { id: makeTeamPlayerId(1), name: player2Name };
    const team: Team = {
      id: makeTeamId(),
      name: displayName(teamName, player1Name, player2Name),
      playerIds: [player1.id, player2.id],
      rating,
      isFixedTeam: true,
    };
    setTeamPlayers([...teamPlayers, player1, player2]);
    setTeams([...teams, team]);
  }

  function updateTeam(id: string, player1Name: string, player2Name: string, teamName: string, rating?: number) {
    const team = teams.find((t) => t.id === id);
    if (!team) return;
    const [player1Id, player2Id] = team.playerIds;

    setTeamPlayers(
      teamPlayers.map((player) => {
        if (player.id === player1Id) return { ...player, name: player1Name };
        if (player.id === player2Id) return { ...player, name: player2Name };
        return player;
      }),
    );
    setTeams(
      teams.map((t) => (t.id === id ? { ...t, name: displayName(teamName, player1Name, player2Name), rating } : t)),
    );
  }

  function removeTeam(id: string) {
    const team = teams.find((t) => t.id === id);
    if (!team) return;
    setTeams(teams.filter((t) => t.id !== id));
    setTeamPlayers(teamPlayers.filter((player) => !team.playerIds.includes(player.id)));
  }

  // Clears every fixed team and its embedded players — the Add Team
  // equivalent of usePlayers.removeAllPlayers.
  function removeAllTeams() {
    setTeams([]);
    setTeamPlayers([]);
  }

  return { teams, teamPlayers, addTeam, updateTeam, removeTeam, removeAllTeams };
}
