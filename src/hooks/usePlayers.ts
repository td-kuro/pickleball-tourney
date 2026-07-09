import type { Player } from '../types';
import { useLocalStorage } from './useLocalStorage';

const STORAGE_KEY = 'pickleball-tourney:players';

function makePlayerId(): string {
  return `player-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// Manages the player list and keeps it saved to localStorage.
export function usePlayers() {
  const [players, setPlayers] = useLocalStorage<Player[]>(STORAGE_KEY, []);

  function addPlayer(name: string, rating: number) {
    setPlayers([...players, { id: makePlayerId(), name, rating }]);
  }

  function updatePlayer(id: string, name: string, rating: number) {
    setPlayers(players.map((player) => (player.id === id ? { ...player, name, rating } : player)));
  }

  function removePlayer(id: string) {
    setPlayers(players.filter((player) => player.id !== id));
  }

  return { players, addPlayer, updatePlayer, removePlayer };
}
