import type { Player, PlayerAvailabilityStatus } from '../types';
import { useLocalStorage } from './useLocalStorage';

const STORAGE_KEY = 'pickleball-tourney:players';

function makePlayerId(salt = 0): string {
  return `player-${Date.now()}-${salt}-${Math.floor(Math.random() * 10000)}`;
}

// Manages the player list and keeps it saved to localStorage.
export function usePlayers() {
  const [players, setPlayers] = useLocalStorage<Player[]>(STORAGE_KEY, []);

  // Quickly generates `count` empty player slots (named "Player N") so the
  // user can fill in names/ratings afterward instead of adding one by one —
  // also how a single "+ Add Player" click adds one slot (count=1); every
  // roster screen edits name/rating in place afterward, so there's no
  // separate single-player add form anywhere any more.
  function addPlayersBulk(count: number) {
    const startNumber = players.length + 1;
    const newPlayers: Player[] = Array.from({ length: count }, (_, i) => ({
      id: makePlayerId(i),
      name: `Player ${startNumber + i}`,
      rating: undefined,
    }));
    setPlayers([...players, ...newPlayers]);
  }

  // Adds one or more already-built Player records in a single update — used
  // when reverting a fixed team back to individual players (see App.tsx's
  // handleUnmakeTeam), where the players already have real ids/names/
  // ratings to preserve rather than minting new ones via addPlayer.
  function addExistingPlayers(newPlayers: Player[]) {
    setPlayers([...players, ...newPlayers]);
  }

  function updatePlayer(id: string, name: string, rating?: number) {
    setPlayers(players.map((player) => (player.id === id ? { ...player, name, rating } : player)));
  }

  // Mid-session availability change (Standard Social Play + King Court —
  // see PlayerAvailabilityStatus in types.ts). Deliberately its own setter,
  // separate from updatePlayer: it's the one field callers change *during*
  // an active session rather than only at Setup, and future round/cycle
  // generation reads it to exclude the player — see
  // isPlayerAvailableForScheduling in utils/tournament.ts.
  function setAvailabilityStatus(id: string, status: PlayerAvailabilityStatus) {
    setPlayers(players.map((player) => (player.id === id ? { ...player, availabilityStatus: status } : player)));
  }

  function removePlayer(id: string) {
    setPlayers(players.filter((player) => player.id !== id));
  }

  // Removes several players in one update — needed anywhere more than one
  // id is removed in the same handler (e.g. App.tsx's handleMakeTeam,
  // dropping both players it just promoted into a team). Two sequential
  // removePlayer calls would each filter the same stale `players` snapshot
  // and the second call's setPlayers would clobber the first's removal.
  function removePlayers(ids: string[]) {
    setPlayers(players.filter((player) => !ids.includes(player.id)));
  }

  // Clears the entire roster — names, ratings, IDs, and any unfilled
  // generated slots — without touching tournament settings.
  function removeAllPlayers() {
    setPlayers([]);
  }

  return {
    players,
    addPlayersBulk,
    addExistingPlayers,
    updatePlayer,
    setAvailabilityStatus,
    removePlayer,
    removePlayers,
    removeAllPlayers,
  };
}
