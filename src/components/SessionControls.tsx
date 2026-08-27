import { useState } from 'react';
import type { AddPlayerMidSessionResult, MidSessionJoinTiming, Player, PlayerAvailabilityStatus, Round, SessionAdjustment, Team } from '../types';
import { availabilityStatusLabel, canIncreaseCourts, countAvailableForScheduling, isFixedTeamSide } from '../utils/tournament';
import { AddPlayerMidSessionButton, type AddPlayerMidSessionFields } from './AddPlayerMidSessionModal';
import { CourtSelector } from './CourtSelector';
import { PlayerAvailabilityControls } from './PlayerAvailabilityControls';
import { SwapPlayerModal } from './SwapPlayerModal';

interface SessionControlsProps {
  // Individual players only (not fixed-team members embedded in `teams`) —
  // mid-session availability/swap is deliberately scoped to individual
  // players, see isFixedTeamSide below.
  players: Player[];
  teams: Team[];
  // The players embedded in `teams` (see App.tsx's teamPlayers) — needed
  // alongside `players`/`teams` only for the court-capacity check below
  // (countAvailableForScheduling), which counts a fixed team as 2.
  teamPlayers: Player[];
  playersPerCourt: number;
  currentRound: Round | undefined;
  courts: number;
  sessionAdjustments: SessionAdjustment[];
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onChangeCourts: (newCourts: number, regenerateCurrent: boolean) => void;
  onSwap: (activePlayerId: string, byePlayerId: string) => { ok: boolean; reason?: string };
  onAddPlayerMidSession: (fields: AddPlayerMidSessionFields, joinTiming: MidSessionJoinTiming) => AddPlayerMidSessionResult;
}

// Organiser control area for a live Standard Social Play session — see
// README's "Mid-session player and court changes". Deliberately its own
// section below Current Round/Bye rather than folded into either: match
// cards stay uncluttered (see SwapPlayerModal's file comment), and this
// still reads as one clear "manage the session" home, matching the design
// brief's suggested Current Round / Bye / Session Controls / Player Stats
// layout.
export function SessionControls({
  players,
  teams,
  teamPlayers,
  playersPerCourt,
  currentRound,
  courts,
  sessionAdjustments,
  onSetAvailability,
  onChangeCourts,
  onSwap,
  onAddPlayerMidSession,
}: SessionControlsProps) {
  const [pendingCourts, setPendingCourts] = useState(courts);
  const [swapOpen, setSwapOpen] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  const currentRoundHasScores = currentRound?.matches.some((m) => m.scoreA != null || m.scoreB != null) ?? false;
  const lastNotice = sessionAdjustments[sessionAdjustments.length - 1];

  // "Add a court" needs enough *available* players to actually fill it —
  // e.g. 12 players / 2 courts with 4 on bye can go to 3 courts (needs 12,
  // has 12); 10 players / 2 courts with 2 on bye can't (needs 12, has 10).
  // See README's "Mid-session player and court changes".
  const availableCount = countAvailableForScheduling(players, teams, teamPlayers);
  const courtsCheck = canIncreaseCourts(pendingCourts, courts, playersPerCourt, availableCount);

  function handleApplyCourts() {
    if (pendingCourts === courts || !courtsCheck.ok) return;
    const message =
      pendingCourts > courts
        ? `Change from ${courts} court${courts === 1 ? '' : 's'} to ${pendingCourts} courts? This will apply from the next round.`
        : `Change from ${courts} court${courts === 1 ? '' : 's'} to ${pendingCourts} court${pendingCourts === 1 ? '' : 's'}? More players may sit out from the next round.`;
    if (!window.confirm(message)) {
      setPendingCourts(courts);
      return;
    }
    let regenerateCurrent = false;
    if (!currentRoundHasScores && currentRound) {
      regenerateCurrent = window.confirm('Apply this to the current round too? It has no scores entered yet.');
    }
    onChangeCourts(pendingCourts, regenerateCurrent);
    setNoticeDismissed(false);
  }

  // Only individual (non-fixed-team) players are eligible for a swap — see
  // isFixedTeamSide and canSwapPlayerInRound's file comment in
  // utils/tournament.ts.
  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const activeOptions = currentRound
    ? currentRound.matches
        .filter((match) => match.scoreA == null && match.scoreB == null)
        .flatMap((match) => [match.teamA, match.teamB])
        .filter((side) => !isFixedTeamSide(side.playerIds, teams))
        .flatMap((side) => side.playerIds)
        .map((id) => ({ id, label: playerNameById.get(id) ?? 'Unknown player' }))
    : [];
  const byeOptions = currentRound
    ? currentRound.byePlayerIds
        .filter((id) => !teams.some((team) => team.playerIds.includes(id)))
        .map((id) => ({ id, label: playerNameById.get(id) ?? 'Unknown player' }))
    : [];

  return (
    <>
      {(lastNotice?.type === 'future-rounds-regenerated' || lastNotice?.type === 'player-added-mid-session') &&
        !noticeDismissed && (
        <div className="session-adjustment-notice">
          <span className="hint">
            {lastNotice.note ?? 'Future rounds were regenerated due to player/court changes.'}
          </span>
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
            <button
              type="button"
              className="secondary"
              onClick={handleApplyCourts}
              disabled={pendingCourts === courts || !courtsCheck.ok}
            >
              Change Courts
            </button>
            <p className="hint">Applies from the next round by default; completed and locked rounds are never changed.</p>
          </div>
          {!courtsCheck.ok && <p className="hint error">{courtsCheck.reason}</p>}
        </div>

        <div className="form-row">
          <span>Byes / Sitting Out This Round</span>
          {!currentRound || currentRound.byePlayerIds.length === 0 ? (
            <p className="empty-state">No one is sitting out this round.</p>
          ) : (
            <ul className="bye-list">
              {currentRound.byePlayerIds.map((id) => (
                <li key={id} className="bye-chip">
                  {playerNameById.get(id) ?? 'Unknown player'}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="secondary" onClick={() => setSwapOpen(true)} disabled={!currentRound}>
            Swap Active Player with Bye Player
          </button>
          <AddPlayerMidSessionButton onAdd={onAddPlayerMidSession} offerCurrentRoundJoin={!!currentRound} />
        </div>
      </section>

      <PlayerAvailabilityControls players={players} onSetStatus={onSetAvailability} statusLabel={availabilityStatusLabel} />

      {swapOpen && (
        <SwapPlayerModal
          activeOptions={activeOptions}
          byeOptions={byeOptions}
          onSwap={onSwap}
          onClose={() => setSwapOpen(false)}
        />
      )}
    </>
  );
}
