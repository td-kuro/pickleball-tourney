import { useState } from 'react';
import type { DynamicPairingRound, Player, PlayerAvailabilityStatus, SessionAdjustment } from '../types';
import {
  calculateDynamicPairingStats,
  dynamicPairingAvailabilityLabel,
  playedDynamicPairingRounds,
} from '../utils/dynamicPairingSocial';
import { CourtSelector } from './CourtSelector';
import { PlayerAvailabilityControls } from './PlayerAvailabilityControls';
import { SwapPlayerModal } from './SwapPlayerModal';

interface DynamicPairingRestingPlayersProps {
  players: Player[];
  rounds: DynamicPairingRound[];
  currentRound: DynamicPairingRound | undefined;
  numberOfCourts: number;
  sessionAdjustments: SessionAdjustment[];
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onChangeCourts: (newCourts: number) => void;
  onSwap: (activePlayerId: string, restingPlayerId: string) => { ok: boolean; reason?: string };
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
  rounds,
  currentRound,
  numberOfCourts,
  sessionAdjustments,
  onSetAvailability,
  onChangeCourts,
  onSwap,
}: DynamicPairingRestingPlayersProps) {
  const [pendingCourts, setPendingCourts] = useState(numberOfCourts);
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

  function handleApplyCourts() {
    if (pendingCourts === numberOfCourts) return;
    const message =
      pendingCourts > numberOfCourts
        ? `Change from ${numberOfCourts} court${numberOfCourts === 1 ? '' : 's'} to ${pendingCourts} courts? This will apply from the next round.`
        : `Change from ${numberOfCourts} court${numberOfCourts === 1 ? '' : 's'} to ${pendingCourts} court${pendingCourts === 1 ? '' : 's'}? More players may rest from the next round.`;
    if (!window.confirm(message)) {
      setPendingCourts(numberOfCourts);
      return;
    }
    onChangeCourts(pendingCourts);
    setNoticeDismissed(false);
  }

  const activeOptions = currentRound
    ? currentRound.courts
        .filter((court) => court.score1 == null && court.score2 == null)
        .flatMap((court) => court.playerIds)
        .map((id) => ({ id, label: playerNameById.get(id) ?? 'Unknown player' }))
    : [];
  const restingOptions = currentRound
    ? currentRound.restingPlayerIds.map((id) => ({ id, label: playerNameById.get(id) ?? 'Unknown player' }))
    : [];

  return (
    <>
      {lastNotice?.type === 'future-rounds-regenerated' && !noticeDismissed && (
        <div className="session-adjustment-notice">
          <span className="hint">Future rounds were regenerated due to player/court changes.</span>
          <button type="button" className="secondary" onClick={() => setNoticeDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="card">
        <h2>Session Controls</h2>
        <div className="form-row">
          <CourtSelector value={pendingCourts} onChange={setPendingCourts} label="Number of Courts" />
          <div className="session-controls-actions">
            <button type="button" className="secondary" onClick={handleApplyCourts} disabled={pendingCourts === numberOfCourts}>
              Change Courts
            </button>
            <p className="hint">
              Applies to the still-upcoming pre-generated grading rounds; Round 4+ picks up the new count automatically.
              Locked/completed rounds are never changed.
            </p>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={() => setSwapOpen(true)} disabled={!currentRound}>
            Swap Active Player with Resting Player
          </button>
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
