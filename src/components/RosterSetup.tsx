import { useState, type FormEvent } from 'react';
import type { Player, Team, TournamentSettings } from '../types';
import { isFixedTeamsMode, maxPlayersForRound, playersNeededPerMatch } from '../utils/tournament';
import { PlayerForm } from './PlayerForm';
import { PlayerList } from './PlayerList';
import { TeamForm } from './TeamForm';
import { TeamList } from './TeamList';

interface RosterSetupProps {
  settings: TournamentSettings;
  players: Player[];
  onAddPlayer: (name: string, rating?: number) => void;
  onAddPlayersBulk: (count: number) => void;
  onUpdatePlayer: (id: string, name: string, rating?: number) => void;
  onRemovePlayer: (id: string) => void;
  onRemoveAllPlayers: () => void;
  teams: Team[];
  teamPlayers: Player[];
  onAddTeam: (player1Name: string, player2Name: string, teamName: string, rating?: number) => void;
  onUpdateTeam: (id: string, player1Name: string, player2Name: string, teamName: string, rating?: number) => void;
  onRemoveTeam: (id: string) => void;
  onRemoveAllTeams: () => void;
}

// Setup field 6 (see App.tsx): picks between the "Add Player" roster
// (Singles, or Doubles + Rotating Players) and the "Add Team" roster
// (Doubles + Fixed Teams) — see TournamentSetup's Doubles Setup toggle,
// which is what actually decides settings.doublesPairingMode. The two
// rosters are otherwise completely independent (separate localStorage-
// backed hooks — usePlayers and useTeams), so switching modes never loses
// either one; whichever isn't currently active is just not shown.
export function RosterSetup({
  settings,
  players,
  onAddPlayer,
  onAddPlayersBulk,
  onUpdatePlayer,
  onRemovePlayer,
  onRemoveAllPlayers,
  teams,
  teamPlayers,
  onAddTeam,
  onUpdateTeam,
  onRemoveTeam,
  onRemoveAllTeams,
}: RosterSetupProps) {
  const [bulkCount, setBulkCount] = useState('');
  const bulkCountValue = parseInt(bulkCount, 10);
  const useFixedTeams = isFixedTeamsMode(settings);

  function handleGenerateSlots(event: FormEvent) {
    event.preventDefault();
    if (Number.isNaN(bulkCountValue) || bulkCountValue < 1) return;
    onAddPlayersBulk(bulkCountValue);
    setBulkCount('');
  }

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

  if (useFixedTeams) {
    const perCourt = 2; // a doubles court seats 2 fixed teams
    return (
      <div className="setup-grid">
        <section className="card">
          <h2>Add Team</h2>
          <p className="hint">Fixed pairings stay together where possible, for the whole tournament/session.</p>
          <TeamForm onSubmit={onAddTeam} />
        </section>

        <section className="card">
          <div className="section-heading-row">
            <h2>Teams ({teams.length})</h2>
            {teams.length > 0 && (
              <button type="button" className="danger" onClick={handleRemoveAllTeams}>
                Remove All Teams
              </button>
            )}
          </div>
          <TeamList teams={teams} teamPlayers={teamPlayers} onUpdate={onUpdateTeam} onRemove={onRemoveTeam} />
          <p className="hint">
            {settings.courts} court{settings.courts === 1 ? '' : 's'} × {perCourt} teams per court = up to{' '}
            {settings.courts * perCourt} teams per round ({teams.length} team{teams.length === 1 ? '' : 's'} added).
          </p>
        </section>
      </div>
    );
  }

  const perCourt = playersNeededPerMatch(settings.matchType);
  const maxPlayers = maxPlayersForRound(settings);

  return (
    <div className="setup-grid">
      <section className="card">
        <h2>Add Player</h2>
        {settings.matchType === 'doubles' && (
          <p className="hint">Players rotate partners and opponents automatically every round.</p>
        )}
        <PlayerForm onSubmit={onAddPlayer} />

        <div className="bulk-add">
          <p className="bulk-add-label">Or generate multiple player slots</p>
          <form className="bulk-add-form" onSubmit={handleGenerateSlots}>
            <input
              type="number"
              min={1}
              value={bulkCount}
              onChange={(event) => setBulkCount(event.target.value)}
              placeholder="e.g. 12"
              aria-label="Number of players to generate"
            />
            <button type="submit" className="secondary" disabled={Number.isNaN(bulkCountValue) || bulkCountValue < 1}>
              Generate Player Slots
            </button>
          </form>
        </div>
      </section>

      <section className="card">
        <div className="section-heading-row">
          <h2>Players ({players.length})</h2>
          {players.length > 0 && (
            <button type="button" className="danger" onClick={handleRemoveAllPlayers}>
              Remove All Players
            </button>
          )}
        </div>
        <PlayerList players={players} onUpdate={onUpdatePlayer} onRemove={onRemovePlayer} />
        <p className="hint">
          {settings.courts} court{settings.courts === 1 ? '' : 's'} × {perCourt} players per court = up to{' '}
          {maxPlayers} players per round ({players.length} player{players.length === 1 ? '' : 's'} added).
        </p>
      </section>
    </div>
  );
}
