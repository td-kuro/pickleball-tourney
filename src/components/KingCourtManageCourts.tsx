import { useState } from 'react';
import type { KingCourtCycle, Player, PlayerAvailabilityStatus, SessionAdjustment } from '../types';
// canIncreaseCourts is pure arithmetic, no Player/Round coupling — see
// DynamicPairingRestingPlayers' identical import for why sharing just this
// one function doesn't pull Standard Social Play state into King Court.
import { availabilityStatusLabel, canIncreaseCourts, isPlayerAvailableForScheduling } from '../utils/tournament';
import { availableSubstitutes, playerHasRemainingGamesOnCourt } from '../utils/kingCourt';
import { CourtSelector } from './CourtSelector';
import { PlayerAvailabilityControls } from './PlayerAvailabilityControls';

const PLAYERS_PER_COURT = 5; // King Court's fixed court size.

interface KingCourtManageCourtsProps {
  players: Player[];
  currentCycle: KingCourtCycle;
  numberOfCourts: number;
  sessionAdjustments: SessionAdjustment[];
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onSubstitute: (courtNumber: number, outgoingId: string, incomingId: string) => void;
  onChangeCourts: (newCourts: number) => void;
  confirmError: string | null;
}

// King Court's "Manage Courts / Players" — deliberately the most manual of
// the three Social Play modes' mid-session controls, per the design brief:
// a cycle's 5-game rotation is fixed once generated, so this never
// reshuffles anything automatically. It only ever (1) marks availability,
// (2) warns when that leaves a real gap in games still being played this
// cycle, and (3) lets the organiser manually substitute a genuine
// replacement into that gap — see substitutePlayerInCycle in
// utils/kingCourt.ts. Court-count changes and any resulting "court doesn't
// have 5 players" problem show up here via confirmError (from
// useKingCourt.confirmMovementAndAdvance) — resolved with this panel and/or
// the existing per-player "move to court" override already in the Movement
// Preview UI.
export function KingCourtManageCourts({
  players,
  currentCycle,
  numberOfCourts,
  sessionAdjustments,
  onSetAvailability,
  onSubstitute,
  onChangeCourts,
  confirmError,
}: KingCourtManageCourtsProps) {
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [pendingCourts, setPendingCourts] = useState(numberOfCourts);
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const lastNotice = sessionAdjustments[sessionAdjustments.length - 1];

  // "Add a court" needs 5 available players to seed it — see
  // canIncreaseCourts's file comment. Raising numberOfCourts here just
  // updates the target; the organiser still has to place 5 players on the
  // new court number via the Movement Preview's per-player "move to court"
  // override before the next cycle can start (validateNextCycleAssignments
  // — surfaced as confirmError below — blocks it otherwise).
  const availableCount = players.filter(isPlayerAvailableForScheduling).length;
  const courtsCheck = canIncreaseCourts(pendingCourts, numberOfCourts, PLAYERS_PER_COURT, availableCount);

  function handleApplyCourts() {
    if (pendingCourts === numberOfCourts || !courtsCheck.ok) return;
    const message =
      pendingCourts > numberOfCourts
        ? `Change from ${numberOfCourts} court${numberOfCourts === 1 ? '' : 's'} to ${pendingCourts} courts? Seed the new court with 5 players via the Movement Preview's court override before the next cycle starts.`
        : `Change from ${numberOfCourts} court${numberOfCourts === 1 ? '' : 's'} to ${pendingCourts} court${pendingCourts === 1 ? '' : 's'}? Players on the removed court will need to be manually redistributed before the next cycle starts.`;
    if (!window.confirm(message)) {
      setPendingCourts(numberOfCourts);
      return;
    }
    onChangeCourts(pendingCourts);
  }

  const warnings = players
    .filter((p) => {
      const status = p.availabilityStatus ?? 'available';
      return status !== 'available' && status !== 'resting-this-round';
    })
    .flatMap((p) =>
      currentCycle.courts
        .filter((court) => playerHasRemainingGamesOnCourt(currentCycle, court.courtNumber, p.id))
        .map((court) => ({ player: p, courtNumber: court.courtNumber })),
    );

  const substitutes = availableSubstitutes(players, currentCycle);

  return (
    <>
      {confirmError && <p className="hint error">{confirmError}</p>}

      {lastNotice && (lastNotice.type === 'player-swapped' || lastNotice.type === 'court-count-changed') && !noticeDismissed && (
        <div className="session-adjustment-notice">
          <span className="hint">
            {lastNotice.type === 'player-swapped'
              ? 'A player substitution was made this cycle.'
              : `Court count changed to ${lastNotice.newValue} — takes effect at the next cycle boundary.`}
          </span>
          <button type="button" className="secondary" onClick={() => setNoticeDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="card">
        <h2>Manage Courts / Players</h2>

        <div className="form-row">
          <CourtSelector value={pendingCourts} onChange={setPendingCourts} label="Number of Courts" />
          <div className="session-controls-actions">
            <button
              type="button"
              className="secondary"
              onClick={handleApplyCourts}
              disabled={pendingCourts === numberOfCourts || !courtsCheck.ok}
            >
              Change Courts
            </button>
            <p className="hint">Takes effect at the next cycle boundary — the current cycle's games are never reshuffled.</p>
          </div>
          {!courtsCheck.ok && <p className="hint error">{courtsCheck.reason}</p>}
        </div>

        {warnings.length > 0 && (
          <div className="hint error">
            {warnings.map(({ player, courtNumber }) => (
              <p key={`${player.id}-${courtNumber}`}>
                Court {courtNumber} — {player.name} is marked {availabilityStatusLabel(player.availabilityStatus ?? 'available')} but
                still has games left this cycle. Substitute a replacement below, or resolve manually.
              </p>
            ))}
          </div>
        )}

        <SubstituteForm cycle={currentCycle} nameById={nameById} substitutes={substitutes} onSubstitute={onSubstitute} />
      </section>

      <PlayerAvailabilityControls players={players} onSetStatus={onSetAvailability} statusLabel={availabilityStatusLabel} />
    </>
  );
}

interface SubstituteFormProps {
  cycle: KingCourtCycle;
  nameById: Map<string, string>;
  substitutes: Player[];
  onSubstitute: (courtNumber: number, outgoingId: string, incomingId: string) => void;
}

function SubstituteForm({ cycle, nameById, substitutes, onSubstitute }: SubstituteFormProps) {
  const courts = [...cycle.courts].sort((a, b) => a.courtNumber - b.courtNumber);
  const [courtNumber, setCourtNumber] = useState(courts[0]?.courtNumber ?? 1);
  const currentCourt = courts.find((c) => c.courtNumber === courtNumber);
  const [outgoingId, setOutgoingId] = useState(currentCourt?.playerIds[0] ?? '');
  const [incomingId, setIncomingId] = useState(substitutes[0]?.id ?? '');

  function handleCourtChange(next: number) {
    setCourtNumber(next);
    const nextCourt = courts.find((c) => c.courtNumber === next);
    setOutgoingId(nextCourt?.playerIds[0] ?? '');
  }

  function handleSubstitute() {
    if (!outgoingId || !incomingId) return;
    onSubstitute(courtNumber, outgoingId, incomingId);
  }

  return (
    <div className="form-row">
      <span>Substitute a Player This Cycle</span>
      {substitutes.length === 0 ? (
        <p className="hint">
          No available replacement in the roster right now — every player is already on a court, or marked
          unavailable. If no replacement exists, resolve manually (e.g. play the court short-handed, or use the
          Movement Preview's per-player court override once this cycle finishes).
        </p>
      ) : (
        <>
          <div className="timing-grid">
            <label className="timing-field">
              Court
              <select value={courtNumber} onChange={(event) => handleCourtChange(Number(event.target.value))}>
                {courts.map((court) => (
                  <option key={court.courtNumber} value={court.courtNumber}>
                    Court {court.courtNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="timing-field">
              Outgoing player
              <select value={outgoingId} onChange={(event) => setOutgoingId(event.target.value)}>
                {(currentCourt?.playerIds ?? []).map((id) => (
                  <option key={id} value={id}>
                    {nameById.get(id) ?? 'Unknown player'}
                  </option>
                ))}
              </select>
            </label>
            <label className="timing-field">
              Incoming player
              <select value={incomingId} onChange={(event) => setIncomingId(event.target.value)}>
                {substitutes.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={handleSubstitute}>
              Substitute
            </button>
          </div>
        </>
      )}
    </div>
  );
}
