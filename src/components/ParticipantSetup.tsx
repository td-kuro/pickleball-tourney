import { useState, type FormEvent } from 'react';
import type { Player, Team, TournamentSettings } from '../types';
import { maxPlayersForRound, playersNeededPerMatch } from '../utils/tournament';
import { ParticipantList } from './ParticipantList';
import { PlayerForm } from './PlayerForm';
import { TeamForm } from './TeamForm';

interface ParticipantSetupProps {
  settings: TournamentSettings;
  players: Player[];
  onAddPlayer: (name: string, rating?: number) => void;
  onAddPlayersBulk: (count: number) => void;
  onUpdatePlayer: (id: string, name: string, rating?: number) => void;
  onRemovePlayer: (id: string) => void;
  teams: Team[];
  teamPlayers: Player[];
  onAddTeam: (player1Name: string, player2Name: string, teamName: string, rating?: number) => void;
  onUpdateTeam: (id: string, player1Name: string, player2Name: string, teamName: string, rating?: number) => void;
  onRemoveTeam: (id: string) => void;
  onRemoveAllParticipants: () => void;
}

// Doubles + Leaderboard/Social Play roster setup: Add Player and Add Team
// shown together (rather than RosterSetup's older Pools & Knockout-only
// exclusive toggle), since a mixed roster — some fixed teams, some
// individual players — is a first-class setup here. Individual players get
// grouped into temporary teams each round; fixed teams stay together. See
// utils/pairing.ts's generateMixedDoublesRound, and ParticipantList for how
// both kinds show up together below.
export function ParticipantSetup({
  settings,
  players,
  onAddPlayer,
  onAddPlayersBulk,
  onUpdatePlayer,
  onRemovePlayer,
  teams,
  teamPlayers,
  onAddTeam,
  onUpdateTeam,
  onRemoveTeam,
  onRemoveAllParticipants,
}: ParticipantSetupProps) {
  const [bulkCount, setBulkCount] = useState('');
  const bulkCountValue = parseInt(bulkCount, 10);
  const perCourt = playersNeededPerMatch(settings.matchType);
  const maxPlayers = maxPlayersForRound(settings);
  const totalParticipants = players.length + teams.length * 2;

  function handleGenerateSlots(event: FormEvent) {
    event.preventDefault();
    if (Number.isNaN(bulkCountValue) || bulkCountValue < 1) return;
    onAddPlayersBulk(bulkCountValue);
    setBulkCount('');
  }

  function handleRemoveAll() {
    if (window.confirm('Are you sure you want to remove all participants (players and teams)?')) {
      onRemoveAllParticipants();
    }
  }

  return (
    <div className="setup-grid">
      <section className="card">
        <h2>Add Player</h2>
        <p className="hint">Individual players get grouped into temporary teams each round.</p>
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

        <h2 className="participant-setup-team-heading">Add Team</h2>
        <p className="hint">A fixed team of 2 players who stay paired together every round.</p>
        <TeamForm onSubmit={onAddTeam} />
      </section>

      <section className="card">
        <div className="section-heading-row">
          <h2>Participants ({players.length + teams.length})</h2>
          {(players.length > 0 || teams.length > 0) && (
            <button type="button" className="danger" onClick={handleRemoveAll}>
              Remove All Participants
            </button>
          )}
        </div>
        <ParticipantList
          players={players}
          teams={teams}
          teamPlayers={teamPlayers}
          onUpdatePlayer={onUpdatePlayer}
          onRemovePlayer={onRemovePlayer}
          onUpdateTeam={onUpdateTeam}
          onRemoveTeam={onRemoveTeam}
        />
        <p className="hint">
          {settings.courts} court{settings.courts === 1 ? '' : 's'} × {perCourt} players per court = up to {maxPlayers}{' '}
          players per round ({totalParticipants} player{totalParticipants === 1 ? '' : 's'} total — {players.length}{' '}
          individual, {teams.length} team{teams.length === 1 ? '' : 's'}).
        </p>
      </section>
    </div>
  );
}
