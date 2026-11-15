import { useState, type FormEvent } from 'react';
import type { PlayerTier, TierPlayer, TierPlayerStats, TierScoreMode } from '../types';
import { TIER_NAMES, TIERS } from '../utils/tierPairings';
import { DEFAULT_TIER, MAX_TIER_COURTS, parseTierPlayerLines, type NewTierPlayer, type TierResult } from '../utils/tierSession';
import { CourtNumberPicker } from './CourtNumberPicker';
import { TierScoreModePicker } from './TierScoreModePicker';
import { TierPill } from './TierCourtCard';

function TierPicker({ value, onChange, label }: { value: PlayerTier; onChange: (tier: PlayerTier) => void; label: string }) {
  return (
    <div className="tier-picker" role="group" aria-label={label}>
      {TIERS.map((tier) => (
        <button
          key={tier}
          type="button"
          className={value === tier ? `tier-picker-option active tier-pill-${tier.toLowerCase()}` : 'tier-picker-option'}
          onClick={() => onChange(tier)}
          aria-pressed={value === tier}
          title={`${tier} – ${TIER_NAMES[tier]}`}
        >
          {tier}
        </button>
      ))}
    </div>
  );
}

// Add one player (name + tier, Enter to add — the tier stays selected so a
// run of C players is quick), or paste many at once ("Name, A" per line).
export function TierAddPlayers({ onAddPlayers, started }: { onAddPlayers: (entries: NewTierPlayer[]) => void; started: boolean }) {
  const [name, setName] = useState('');
  const [tier, setTier] = useState<PlayerTier>(DEFAULT_TIER);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onAddPlayers([{ name, tier }]);
    setName('');
  }

  const parsed = parseTierPlayerLines(bulkText);

  return (
    <div className="tier-add">
      <form className="tier-add-row" onSubmit={handleAdd}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player name"
          aria-label="Player name"
        />
        <TierPicker value={tier} onChange={setTier} label="New player tier" />
        <button type="submit" className="cta-button" disabled={!name.trim()}>
          Add Player
        </button>
      </form>
      {started && <p className="hint">Players added now join the next generated round (or regenerate the current draft to include them straight away).</p>}
      <button type="button" className="secondary" onClick={() => setBulkOpen((v) => !v)} aria-expanded={bulkOpen}>
        {bulkOpen ? 'Hide quick add' : 'Add many players'}
      </button>
      {bulkOpen && (
        <div className="tier-bulk">
          <textarea
            rows={6}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'One player per line, optional tier:\nThai, A\nAlex - B\nKim (C)\nBen'}
            aria-label="Players to add, one per line"
          />
          <p className="hint">Lines without a tier get {DEFAULT_TIER} ({TIER_NAMES[DEFAULT_TIER]}). Tiers: A/Top, B/Inbetween, C/Lower.</p>
          <button
            type="button"
            className="cta-button"
            disabled={parsed.length === 0}
            onClick={() => {
              onAddPlayers(parsed);
              setBulkText('');
              setBulkOpen(false);
            }}
          >
            Add {parsed.length} player{parsed.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  );
}

interface TierPlayerBoardProps {
  players: TierPlayer[];
  stats?: Map<string, TierPlayerStats>;
  onSetTier: (id: string, tier: PlayerTier) => void;
  onSetAvailability: (id: string, available: boolean) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

// The roster in three columns — A Top / B Inbetween / C Lower — with a
// one-tap tier switch, availability toggle and remove on every player.
// Shared by Setup and the live Players screen.
export function TierPlayerBoard({ players, stats, onSetTier, onSetAvailability, onRename, onRemove }: TierPlayerBoardProps) {
  const visible = players.filter((p) => !p.removed);
  return (
    <div className="tier-board">
      {TIERS.map((tier) => {
        const column = visible.filter((p) => p.tier === tier);
        const availableCount = column.filter((p) => p.available).length;
        return (
          <section key={tier} className={`tier-column tier-column-${tier.toLowerCase()}`} aria-label={`${tier} – ${TIER_NAMES[tier]}`}>
            <h3>
              <TierPill tier={tier} long /> <span className="tier-column-count">{availableCount} available{column.length !== availableCount ? ` of ${column.length}` : ''}</span>
            </h3>
            {column.length === 0 && <p className="empty-state">No {TIER_NAMES[tier]} players.</p>}
            <ul className="tier-player-list">
              {column.map((p) => {
                const s = stats?.get(p.id);
                return (
                  <li key={p.id} className={p.available ? 'tier-player-row' : 'tier-player-row unavailable'}>
                    <input
                      key={p.name}
                      className="tier-name-input"
                      defaultValue={p.name}
                      aria-label={`Name for ${p.name}`}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== p.name) onRename(p.id, e.target.value);
                        else e.target.value = p.name;
                      }}
                    />
                    <TierPicker value={p.tier} onChange={(t) => onSetTier(p.id, t)} label={`Tier for ${p.name}`} />
                    <label className="tier-available-toggle">
                      <input type="checkbox" checked={p.available} onChange={(e) => onSetAvailability(p.id, e.target.checked)} />
                      {p.available ? 'In' : 'Out'}
                    </label>
                    <button type="button" className="tier-remove" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.name}`} title="Remove">
                      ×
                    </button>
                    {s && s.eligibleRounds > 0 && (
                      <span className="tier-player-meta">
                        Played {s.roundsPlayed} · Sat out {s.roundsSatOut}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface TierPairingsSetupProps {
  players: TierPlayer[];
  numberOfCourts: number;
  started: boolean;
  ended: boolean;
  startError: string | null;
  onAddPlayers: (entries: NewTierPlayer[]) => void;
  onSetTier: (id: string, tier: PlayerTier) => void;
  onSetAvailability: (id: string, available: boolean) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onRemoveAll: () => void;
  courtNumbers: number[];
  scoreMode: TierScoreMode;
  onSetScoreMode: (mode: TierScoreMode) => TierResult;
  onSetCourtNumbers: (courtNumbers: number[]) => TierResult;
  onStart: () => void;
  onGoToRounds: () => void;
}

export function TierPairingsSetup(props: TierPairingsSetupProps) {
  const { players, started, startError } = props;
  const visible = players.filter((p) => !p.removed);
  const available = visible.filter((p) => p.available).length;
  return (
    <>
      {props.ended && (
        <section className="card session-adjustment-notice" role="status">
          <p className="hint">
            This session has ended and is read-only. Use <strong>Reset Tier-Based Pairings</strong> to start a new
            session with the same players and courts.
          </p>
        </section>
      )}
      <section className="card">
        <h2>Courts</h2>
        <CourtNumberPicker value={props.courtNumbers} onChange={(nums) => void props.onSetCourtNumbers(nums)} disabled={props.ended} />
        <p className="hint">
          Pick the venue's numbered courts in use — e.g. 3 and 6. Matches fill them in order. Up to {MAX_TIER_COURTS}{' '}
          courts.
        </p>
      </section>

      <section className="card">
        <h2>Results</h2>
        <TierScoreModePicker value={props.scoreMode} onChange={(mode) => void props.onSetScoreMode(mode)} />
      </section>

      <section className="card">
        <div className="section-heading-row">
          <h2>Players ({visible.length})</h2>
        </div>
        <p className="hint">
          Doubles only. A (Top) and C (Lower) players are never in the same match; B (Inbetween) players can play with
          either. New players default to B.
        </p>
        <TierAddPlayers onAddPlayers={props.onAddPlayers} started={started} />
        <TierPlayerBoard
          players={players}
          onSetTier={props.onSetTier}
          onSetAvailability={props.onSetAvailability}
          onRename={props.onRename}
          onRemove={props.onRemove}
        />
        <p className="hint">
          {available} available of {visible.length} added.
        </p>
        {visible.length > 0 && !started && (
          <div className="section-footer-actions">
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (window.confirm('Remove all players?')) props.onRemoveAll();
              }}
            >
              Remove All Players
            </button>
          </div>
        )}
      </section>

      <section className="card start-matches-card">
        {!started ? (
          <>
            <button type="button" className="cta-button start-button" onClick={props.onStart} disabled={startError !== null}>
              Start Session
            </button>
            {startError && <p className="hint error">{startError}</p>}
          </>
        ) : (
          <button type="button" className="cta-button start-button" onClick={props.onGoToRounds}>
            {props.ended ? 'View Final Results' : 'Go to Current Round'}
          </button>
        )}
      </section>
    </>
  );
}
