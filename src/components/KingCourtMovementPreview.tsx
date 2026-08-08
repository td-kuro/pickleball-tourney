import { useState } from 'react';
import type { KingCourtCourtCycle, KingCourtCycle, KingCourtMovementDirection } from '../types';

interface KingCourtMovementPreviewProps {
  cycle: KingCourtCycle;
  nameById: Map<string, string>;
  numberOfCourts: number;
  onSetManualTiebreakOrder: (courtNumber: number, orderedPlayerIds: string[]) => void;
  onSetManualMovementOverride: (courtNumber: number, playerId: string, toCourt: number) => void;
  onConfirm: () => void;
}

const MOVEMENT_ICON: Record<KingCourtMovementDirection, string> = { up: '⬆️', down: '⬇️', stay: '➖' };

// Shown once a cycle reaches 'awaiting-movement' (all 5 games scored on
// every court): each court's ranked results, movement direction, a manual
// tiebreak control for any wins+differential ties, a manual "move to a
// different court" override per player, and the single confirm action
// that advances every court at once.
export function KingCourtMovementPreview({
  cycle,
  nameById,
  numberOfCourts,
  onSetManualTiebreakOrder,
  onSetManualMovementOverride,
  onConfirm,
}: KingCourtMovementPreviewProps) {
  const courts = [...cycle.courts].sort((a, b) => b.courtNumber - a.courtNumber);
  const anyTied = courts.some((court) => court.standings.some((standing) => standing.tied));

  return (
    <section className="card">
      <h2>Cycle {cycle.cycleNumber} — Movement Preview</h2>
      <p className="hint">
        Review each court's results below, then confirm to move players and start Cycle {cycle.cycleNumber + 1}.
      </p>

      <div className="kc-movement-grid">
        {courts.map((court) => (
          <KingCourtMovementCourtCard
            key={court.courtNumber}
            court={court}
            nameById={nameById}
            numberOfCourts={numberOfCourts}
            onSetManualTiebreakOrder={(order) => onSetManualTiebreakOrder(court.courtNumber, order)}
            onSetManualMovementOverride={(playerId, toCourt) => onSetManualMovementOverride(court.courtNumber, playerId, toCourt)}
          />
        ))}
      </div>

      {anyTied && (
        <p className="hint error">Some courts have tied players (equal wins and point differential) — use the tiebreak
          controls below to set the order before confirming, if it matters for this movement.</p>
      )}

      <button type="button" className="cta-button start-button" onClick={onConfirm}>
        Move Players &amp; Start Next Cycle
      </button>
    </section>
  );
}

interface KingCourtMovementCourtCardProps {
  court: KingCourtCourtCycle;
  nameById: Map<string, string>;
  numberOfCourts: number;
  onSetManualTiebreakOrder: (orderedPlayerIds: string[]) => void;
  onSetManualMovementOverride: (playerId: string, toCourt: number) => void;
}

function KingCourtMovementCourtCard({
  court,
  nameById,
  numberOfCourts,
  onSetManualTiebreakOrder,
  onSetManualMovementOverride,
}: KingCourtMovementCourtCardProps) {
  const [tiebreakOrder, setTiebreakOrder] = useState<string[] | null>(null);
  const hasTie = court.standings.some((standing) => standing.tied);
  const order = tiebreakOrder ?? court.standings.map((standing) => standing.playerId);
  const movementByPlayer = new Map(court.movementPreview.map((movement) => [movement.playerId, movement]));
  const courtOptions = Array.from({ length: numberOfCourts }, (_, i) => numberOfCourts - i);

  function moveInTiebreak(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setTiebreakOrder(next);
  }

  function applyTiebreak() {
    onSetManualTiebreakOrder(order);
    setTiebreakOrder(null);
  }

  return (
    <div className="kc-movement-card">
      <h3>Court {court.courtNumber}</h3>
      <ul className="kc-movement-list">
        {court.standings.map((standing) => {
          const movement = movementByPlayer.get(standing.playerId);
          return (
            <li key={standing.playerId} className="kc-movement-row">
              <span className="kc-movement-icon">{MOVEMENT_ICON[standing.movementDirection]}</span>
              <span className="kc-movement-name">{nameById.get(standing.playerId) ?? 'Unknown player'}</span>
              <span className="kc-movement-record">
                {standing.wins}W–{standing.losses}L, {standing.pointDifferential > 0 ? '+' : ''}
                {standing.pointDifferential}
              </span>
              {standing.tied && <span className="kc-movement-tied">Tied</span>}
              {movement && (
                <select
                  className="kc-movement-select"
                  aria-label={`Move ${nameById.get(standing.playerId) ?? 'player'} to court`}
                  value={movement.toCourt}
                  onChange={(event) => onSetManualMovementOverride(standing.playerId, Number(event.target.value))}
                >
                  {courtOptions.map((c) => (
                    <option key={c} value={c}>
                      Court {c}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>

      {hasTie && (
        <div className="kc-tiebreak">
          <p className="hint">Manually order the tied players (equal wins and point differential):</p>
          <ul className="kc-tiebreak-list">
            {order.map((playerId, index) => (
              <li key={playerId} className="kc-tiebreak-row">
                <span>
                  {index + 1}. {nameById.get(playerId) ?? 'Unknown player'}
                </span>
                <div className="kc-tiebreak-buttons">
                  <button type="button" className="secondary" onClick={() => moveInTiebreak(index, -1)} disabled={index === 0}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => moveInTiebreak(index, 1)}
                    disabled={index === order.length - 1}
                  >
                    ↓
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="secondary" onClick={applyTiebreak}>
            Apply Tiebreak Order
          </button>
        </div>
      )}
    </div>
  );
}
