import type { Player, Team } from '../types';
import { useLocalStorage } from './useLocalStorage';

const TEAMS_KEY = 'pickleball-tourney:teams';
const TEAM_PLAYERS_KEY = 'pickleball-tourney:teamPlayers';

function makeTeamId(): string {
  return `team-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function displayName(teamName: string, player1Name: string, player2Name: string): string {
  const trimmed = teamName.trim();
  return trimmed !== '' ? trimmed : `${player1Name} / ${player2Name}`;
}

// Manages Doubles fixed-team rosters, kept saved to localStorage — a
// Team-based parallel to usePlayers. `teamPlayers` is the backing
// Player[] for the two players embedded in each team (so all the existing
// name-lookup code in Leaderboard/AllRoundsView/computePlayerStats/ etc.
// keeps working unchanged — see App.tsx); it's a completely separate
// roster from usePlayers's. Every team here starts life as two entries in
// usePlayers's individual roster, promoted together via addTeamFromPlayers
// (see ParticipantList's "select 2 players to make a team" checkbox flow)
// — there's no standalone "declare a team directly" path any more.
export function useTeams() {
  const [teams, setTeams] = useLocalStorage<Team[]>(TEAMS_KEY, []);
  const [teamPlayers, setTeamPlayers] = useLocalStorage<Player[]>(TEAM_PLAYERS_KEY, []);

  // Promotes two already-added individual players (see usePlayers) into a
  // fixed team — see ParticipantList's "select 2 players to make a team"
  // flow. Keeps their existing ids/ratings rather than minting new
  // teamplayer- ids (isFixedTeamSide and friends key off team.playerIds
  // membership, not id prefix, so this is safe). Team rating is the
  // average of the two players' ratings if both are rated, else left
  // unrated — unlike addTeam, which always took an explicit rating since
  // it created brand new players that had none yet.
  function addTeamFromPlayers(player1: Player, player2: Player) {
    const rating =
      player1.rating != null && player2.rating != null ? (player1.rating + player2.rating) / 2 : undefined;
    const team: Team = {
      id: makeTeamId(),
      name: displayName('', player1.name, player2.name),
      playerIds: [player1.id, player2.id],
      rating,
      isFixedTeam: true,
    };
    setTeamPlayers([...teamPlayers, player1, player2]);
    setTeams([...teams, team]);
  }

  // Updates one player within a fixed team in place — used by Participants'
  // per-player name+rating fields (see ParticipantList), which show/edit
  // each player's own name and rating directly rather than a team name and
  // one shared team rating. team.rating stays a derived average of the two
  // players' ratings (undefined unless both are rated) so pairing/leaderboard
  // code that reads team.rating keeps working unchanged; team.name stays
  // derived as "P1 / P2" the same way addTeamFromPlayers sets it initially.
  function updateTeamPlayer(teamId: string, playerId: string, name: string, rating?: number) {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;

    const nextTeamPlayers = teamPlayers.map((player) => (player.id === playerId ? { ...player, name, rating } : player));
    setTeamPlayers(nextTeamPlayers);

    const [player1Id, player2Id] = team.playerIds;
    const player1 = nextTeamPlayers.find((player) => player.id === player1Id);
    const player2 = nextTeamPlayers.find((player) => player.id === player2Id);
    const derivedRating =
      player1?.rating != null && player2?.rating != null ? (player1.rating + player2.rating) / 2 : undefined;
    setTeams(
      teams.map((t) =>
        t.id === teamId ? { ...t, name: displayName('', player1?.name ?? '', player2?.name ?? ''), rating: derivedRating } : t,
      ),
    );
  }

  // Reverts a fixed team back into its two individual players — the undo
  // path for addTeamFromPlayers (see ParticipantList's "Split Team"
  // button). Keeps each player's existing id/name/rating; the caller (see
  // App.tsx's handleUnmakeTeam) is responsible for adding the returned
  // players back into usePlayers's roster. Returns null if the team or
  // either of its players can't be found (already removed elsewhere).
  function removeTeamKeepPlayers(id: string): [Player, Player] | null {
    const team = teams.find((t) => t.id === id);
    if (!team) return null;
    const [player1Id, player2Id] = team.playerIds;
    const player1 = teamPlayers.find((player) => player.id === player1Id);
    const player2 = teamPlayers.find((player) => player.id === player2Id);
    if (!player1 || !player2) return null;

    setTeams(teams.filter((t) => t.id !== id));
    setTeamPlayers(teamPlayers.filter((player) => player.id !== player1Id && player.id !== player2Id));
    return [player1, player2];
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

  return {
    teams,
    teamPlayers,
    addTeamFromPlayers,
    updateTeamPlayer,
    removeTeam,
    removeTeamKeepPlayers,
    removeAllTeams,
  };
}
