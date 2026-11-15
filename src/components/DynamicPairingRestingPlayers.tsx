import { useState } from 'react';
import type {
  AddPlayerMidSessionResult,
  DynamicPairingRound,
  DynamicPairingTeam,
  MidSessionJoinTiming,
  Player,
  PlayerAvailabilityStatus,
  SessionAdjustment,
} from '../types';
import {
  calculateDynamicPairingStats,
  dynamicPairingAvailabilityLabel,
  isDynamicPairingFixedTeamSide,
  isPlayerAvailable,
  playedDynamicPairingRounds,
} from '../utils/dynamicPairingSocial';
// canIncreaseCourts is pure arithmetic (newCourts/currentCourts/perCourt/
// availableCount in, ok/reason out) with no Player/Round coupling, so
// reusing it here doesn't pull Standard Social Play state into this mode —
// see utils/tournament.ts's file comment on why this one function is
// shared rather than duplicated.
import { canIncreaseCourts } from '../utils/tournament';
import { AddPlayerMidSessionButton, type AddPlayerMidSessionFields } from './AddPlayerMidSessionModal';
import { CourtNumberChangeControl } from './CourtNumberChangeControl';
import { PlayerAvailabilityControls } from './PlayerAvailabilityControls';
import { SwapPlayerModal } from './SwapPlayerModal';

const PLAYERS_PER_COURT = 4; // Dynamic Pairing Social is doubles-only.

interface DynamicPairingRestingPlayersProps {
  players: Player[];
  teams: DynamicPairingTeam[];
  rounds: DynamicPairingRound[];
  currentRound: DynamicPairingRound | undefined;
  numberOfCourts: number;
  // Physical court numbers in use (numberOfCourts long).
  courtNumbers: number[];
  sessionAdjustments: SessionAdjustment[];
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onChangeCourtNumbers: (courtNumbers: number[], applyToCurrent: boolean) => void;
  onSwap: (activePlayerId: string, restingPlayerId: string) => { ok: boolean; reason?: string };
  onAddPlayerMidSession: (fields: AddPlayerMidSessionFields, joinTiming: MidSessionJoinTiming) => AddPlayerMidSessionResult;
}

// Rest fairness at a glance — see selectRestingPlayers in
// utils/dynamicPairingSocial.ts for the rules this reflects (fewest total
// rests first, then most consecutive rounds played, then didn't rest last
// round). Deliberately not sorted by ranking — this view is about rest
// history only, independent of how competitive a player is. Excludes
// pre-generated-but-'upcoming' rounds (see playedDynamicPairingRounds) —
// a planned-but-not-yet-played rest shouldn't count until it actually
// happens. Also this mode's home for mid-session Session Controls (court
// count, availability, swap) — see README's "Mid-session player and court
// changes"; folded in here rather than a separate tab since this is
// already the natural "who's resting" home per the design brief's
// suggested layout.
export function DynamicPairingRestingPlayers({
  players,
  teams,
  rounds,
  currentRound,
  numberOfCourts,
  courtNumbers,
  sessionAdjustments,
  onSetAvailability,
  onChangeCourtNumbers,
  onSwap,
  onAddPlayerMidSession,
}: DynamicPairingRestingPlayersProps) {
  const [swapOpen, setSwapOpen] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  if (players.length === 0) {
    return (
      <section className="card">
        <h2>Resting Players</h2>
        <p className="empty-state">Add players to see rest history.</p>
      </section>
    );
  }

  const statsById = new Map(
    calculateDynamicPairingStats(players, playedDynamicPairingRounds(rounds)).map((s) => [s.playerId, s]),
  );
  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const lastNotice = sessionAdjustments[sessionAdjustments.length - 1];

  // See SessionControls' identical check — 12 players / 2 courts with 4
  // resting can go to 3 (needs 12, has 12); 10 players / 2 courts with 2
  // resting can't (needs 12, has 10).
  const availableCount = players.filter(isPlayerAvailable).length;

  // Excludes fixed-team sides (can't be split by a swap — see
  // planDynamicPairingSwap) and, on the resting side, any
  // fixed-team member whose partner isn't also resting (swapping them in
  // alone would split the team just the same).
  const activeOptions = currentRound
    ? currentRound.courts
        .filter((court) => court.score1 == null && court.score2 == null)
        .flatMap((court) =>
          [court.team1PlayerIds, court.team2PlayerIds]
            .filter((side) => !isDynamicPairingFixedTeamSide(side, teams))
            .flat(),
        )
        .map((id) => ({ id, label: playerNameById.get(id) ?? 'Unknown player' }))
    : [];
  const restingOptions = currentRound
    ? currentRound.restingPlayerIds
        .filter((id) => {
          const team = teams.find((t) => t.playerIds.includes(id));
          if (!team) return true;
          const partnerId = team.playerIds.find((pid) => pid !== id);
          return partnerId != null && currentRound.restingPlayerIds.includes(partnerId);
        })
        .map((id) => ({ id, label: playerNameById.get(id) ?? 'Unknown player' }))
    : [];

  return (
    <>
      {(lastNotice?.type === 'future-rounds-regenerated' || lastNotice?.type === 'player-added-mid-session') &&
        !noticeDismissed && (
        <div className="session-adjustment-notice">
          <span className="hint">{lastNotice.note ?? 'Future rounds were regenerated due to player/court changes.'}</span>
          <button type="button" className="secondary" onClick={() => setNoticeDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="card">
        <h2>Session Controls</h2>
        <CourtNumberChangeControl
          courtNumbers={courtNumbers}
          checkCount={(count) => canIncreaseCourts(count, numberOfCourts, PLAYERS_PER_COURT, availableCount)}
          currentRoundQuestion={(countChanged) =>
            currentRound && !countChanged ? 'Also move the current round to the new courts? Players stay in the same matches.' : null
          }
          onApply={(nums, applyToCurrent) => {
            onChangeCourtNumbers(nums, applyToCurrent);
            setNoticeDismissed(false);
          }}
        />
        <div className="form-actions">
          <button type="button" className="secondary" onClick={() => setSwapOpen(true)} disabled={!currentRound}>
            Swap Active Player with Resting Player
          </button>
          <AddPlayerMidSessionButton
            onAdd={onAddPlayerMidSession}
            offerCurrentRoundJoin={!!currentRound}
            restingListLabel="resting list"
            showGender
          />
        </div>
      </section>

      <PlayerAvailabilityControls players={players} onSetStatus={onSetAvailability} statusLabel={dynamicPairingAvailabilityLabel} />

      <section className="card">
        <h2>Resting Players</h2>
        <p className="hint">
          Rest counts are global across the whole session and independent of ranking — a resting player receives no
          win, loss, points, or point differential for that round.
        </p>
        <div className="leaderboard-scroll">
          <table className="leaderboard-table stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Total Rests</th>
                <th>Last Rested (Round)</th>
                <th>Consecutive Rounds Played</th>
                <th>Availability</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const stats = statsById.get(player.id);
                return (
                  <tr key={player.id}>
                    <td>{player.name}</td>
                    <td>{stats?.totalRests ?? 0}</td>
                    <td>{stats?.lastRestRound ?? '—'}</td>
                    <td>{stats?.consecutiveRoundsPlayed ?? 0}</td>
                    <td>{dynamicPairingAvailabilityLabel(player.availabilityStatus ?? 'available')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {swapOpen && (
        <SwapPlayerModal activeOptions={activeOptions} byeOptions={restingOptions} onSwap={onSwap} onClose={() => setSwapOpen(false)} />
      )}
    </>
  );
}
