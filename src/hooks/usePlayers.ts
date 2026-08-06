import type { Player } from '../types';
import { useLocalStorage } from './useLocalStorage';

const STORAGE_KEY = 'pickleball-tourney:players';

function makePlayerId(salt = 0): string {
  return `player-${Date.now()}-${salt}-${Math.floor(Math.random() * 10000)}`;
}

// Manages the player list and keeps it saved to localStorage.
export function usePlayers() {
  const [players, setPlayers] = useLocalStorage<Player[]>(STORAGE_KEY, []);

  function addPlayer(name: string, rating?: number) {
    setPlayers([...players, { id: makePlayerId(), name, rating }]);
  }

  // Quickly generates `count` empty player slots (named "Player N") so the
  // user can fill in names/ratings afterward instead of adding one by one.
  function addPlayersBulk(count: number) {
    const startNumber = players.length + 1;
    const newPlayers: Player[] = Array.from({ length: count }, (_, i) => ({
      id: makePlayerId(i),
      name: `Player ${startNumber + i}`,
      rating: undefined,
    }));
    setPlayers([...players, ...newPlayers]);
  }

  function updatePlayer(id: string, name: string, rating?: number) {
    setPlayers(players.map((player) => (player.id === id ? { ...player, name, rating } : player)));
  }

  function removePlayer(id: string) {
    setPlayers(players.filter((player) => player.id !== id));
  }

  // Clears the entire roster — names, ratings, IDs, and any unfilled
  // generated slots — without touching tournament settings.
  function removeAllPlayers() {
    setPlayers([]);
  }

  return { players, addPlayer, addPlayersBulk, updatePlayer, removePlayer, removeAllPlayers };
}
