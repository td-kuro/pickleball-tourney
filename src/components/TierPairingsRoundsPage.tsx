import { useEffect, useMemo, useRef, useState } from 'react';
import type { TierPlayer, TierPlayerStats, TierRound, TierScoreMode } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { ResultInput } from '../utils/tierLeaderboard';
import { matchCourtLabel, planTierSwap, validateTierRound } from '../utils/tierPairings';
import { scoreModeLabel, type TierResult } from '../utils/tierSession';
import { TierCourtCard, TierPill } from './TierCourtCard';
import { CourtNumberChangeControl } from './CourtNumberChangeControl';
import { TierScoreModePicker } from './TierScoreModePicker';
import { TierResultEntry } from './TierResultEntry';

interface TierPairingsRoundsPageProps {
  round: TierRound | undefined;
  players: TierPlayer[];
  stats: Map<string, TierPlayerStats>;
  numberOfCourts: number;
  issues: string[];
  scoreMode: TierScoreMode;
  courtNumbers: number[];
  ended: boolean;
  onStartRound: (roundId: string) => TierResult;
  onNextRound: (roundId: string, allowMissingResults?: boolean) => TierResult;
  onRecordResult: (roundId: string, matchId: string, input: ResultInput, correction: boolean) => TierResult;
  onClearResult: (roundId: string, matchId: string, correction: boolean) => TierResult;
  onEndSession: (allowMissingResults?: boolean) => TierResult;
  onSetScoreMode: (mode: TierScoreMode) => TierResult;
  onSetCourtNumbers: (courtNumbers: number[], applyToOpen: boolean) => TierResult;
  onShowLeaderboard: () => void;
  onRegenerate: (roundId: string, allowActive: boolean) => TierResult;
  onSwap: (roundId: string, a: string, b: string) => TierResult;
  onManagePlayers: () => void;
  onFlash: (messages: string[]) => void;
}

const ROUND_ACTION_GUARD_MS = 800;

function statusLabel(round: TierRound): string {
  return round.status === 'draft' ? 'Draft — not started' : round.status === 'active' ? 'In play' : 'Completed';
}

// Current Round: large court cards (tier beside every name), who's sitting
// out with their sit-out counts, and the round controls. Reads the saved
// round as-is — nothing is generated for display.
//
// Swap: tap a name (court or sitting out), tap a second name, check the
// preview, Confirm. The preview runs the same validation as the swap itself,
// so an A/C mix or an unavailable player is refused before confirming.
export function TierPairingsRoundsPage(props: TierPairingsRoundsPageProps) {
  const { round, players, stats, numberOfCourts, issues, scoreMode } = props;
  // The selection is tied to the round it was made in, so Next Round /
  // Regenerate (a new key) clears a half-made swap without an effect.
  const roundKey = round ? `${round.id}:${round.regenerationCount}:${round.status}` : '';
  const [selection, setSelection] = useState<{ key: string; ids: string[] }>({ key: roundKey, ids: [] });
  const selected = selection.key === roundKey ? selection.ids : [];
  const setSelected = (update: string[] | ((prev: string[]) => string[])) =>
    setSelection((prev) => {
      const prevIds = prev.key === roundKey ? prev.ids : [];
      return { key: roundKey, ids: typeof update === 'function' ? update(prevIds) : update };
    });
  const [largeDisplay, setLargeDisplay] = useLocalStorage<boolean>('pickleball-tourney:tier:largeDisplay', false);
  // Round actions swap places on screen (Start Round becomes Next Round,
  // Next Round becomes the new round's Start Round), so a fast double-click
  // would trigger the second action by accident. Ignore round actions for a
  // moment after one runs.
  const lastRoundAction = useRef(0);
  function guarded(action: () => void) {
    const t = Date.now();
    if (t - lastRoundAction.current < ROUND_ACTION_GUARD_MS) return;
    lastRoundAction.current = t;
    action();
  }
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection((prev) => ({ ...prev, ids: [] }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (props.ended) {
    return (
      <section className="card">
        <h2>Session Ended</h2>
        <p className="hint">This session is finished and read-only. All completed rounds and results are kept in All Rounds.</p>
        <button type="button" className="cta-button" onClick={props.onShowLeaderboard}>
          View Final Results
        </button>
      </section>
    );
  }

  if (!round) {
    return (
      <section className="card">
        <h2>Current Round</h2>
        <p className="empty-state">No round is open. Check that enough players are available, then generate the next round from Players.</p>
      </section>
    );
  }
  const openRound = round;

  const preview = selected.length === 2 ? planTierSwap(openRound, selected[0], selected[1], players) : null;
  const liveTier = (id: string) => playersById.get(id)?.tier ?? openRound.playerTiers[id] ?? 'B';
  const roundIssues = validateTierRound(openRound, players, numberOfCourts);
  const invalidCourts = new Set(
    openRound.matches
      .filter((m) => {
        const label = matchCourtLabel(m);
        return roundIssues.some((i) => i.startsWith(`${label} `) || i.includes(`${label}.`));
      })
      .map((m) => m.id),
  );
  const scoring = scoreMode !== 'none';
  const recorded = openRound.matches.filter((m) => m.result).length;

  function pick(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [id];
      return [...prev, id];
    });
  }

  function report(result: TierResult, success?: string) {
    if (!result.ok) props.onFlash([result.reason]);
    else if (result.message) props.onFlash([result.message]);
    else if (success) props.onFlash([success]);
  }

  function handleRegenerate() {
    const isActive = openRound.status === 'active';
    if (isActive && !window.confirm(`Round ${openRound.roundNumber} has already started. Regenerate it anyway? Players will need to move to new courts.`)) return;
    if (!isActive && openRound.manuallyAdjusted && !window.confirm('This round has manual swaps. Regenerating replaces them. Continue?')) return;
    report(props.onRegenerate(openRound.id, isActive), `Round ${openRound.roundNumber} regenerated.`);
  }

  // Next Round / End Session with unrecorded matches: ask, then carry on
  // with those matches left unrecorded (never counted as a loss).
  // Returns whether the action went ahead.
  function withMissingCheck(run: (allowMissing: boolean) => TierResult, what: string): boolean {
    const first = run(false);
    if (first.ok || first.missingResults === undefined) {
      report(first);
      return first.ok;
    }
    const n = first.missingResults;
    if (!window.confirm(`${n} match${n === 1 ? ' has' : 'es have'} no result. ${what} anyway? ${n === 1 ? 'It stays' : 'They stay'} unrecorded — not counted as a loss.`)) return false;
    const second = run(true);
    report(second);
    return second.ok;
  }

  function handleEndSession() {
    if (!window.confirm('End this session? The final leaderboard will be shown and the session becomes read-only.')) return;
    if (withMissingCheck((allow) => props.onEndSession(allow), 'End the session')) props.onShowLeaderboard();
  }

  function handleScoreMode(mode: TierScoreMode) {
    if (mode === scoreMode) return;
    if (!window.confirm(`Switch score recording to ${scoreModeLabel(mode)}? Results already recorded are kept.`)) return;
    report(props.onSetScoreMode(mode));
  }

  function handleConfirmSwap() {
    if (!preview?.ok) return;
    const result = props.onSwap(openRound.id, selected[0], selected[1]);
    report(result);
    if (result.ok) setSelected([]);
  }

  const restingSorted = [...openRound.restingPlayerIds].sort((a, b) => (playersById.get(a)?.name ?? '').localeCompare(playersById.get(b)?.name ?? ''));
  const info = openRound.arrangement;
  const nameOf = (id: string) => playersById.get(id)?.name ?? 'Unknown';

  return (
    <div className={largeDisplay ? 'tier-round-page large-display' : 'tier-round-page'}>
      <section className="card">
        <div className="section-heading-row">
          <h2>
            Round {openRound.roundNumber}{' '}
            <span className={openRound.status === 'active' ? 'mode-badge social' : 'mode-badge tournament'}>{statusLabel(openRound)}</span>
          </h2>
          <div className="tier-round-actions">
            {openRound.status === 'draft' ? (
              <button type="button" className="cta-button" onClick={() => guarded(() => report(props.onStartRound(openRound.id)))}>
                Start Round
              </button>
            ) : (
              <button
                type="button"
                className="cta-button tier-next-button"
                onClick={() => guarded(() => withMissingCheck((allow) => props.onNextRound(openRound.id, allow), 'Move to the next round'))}
              >
                Next Round
              </button>
            )}
            <button type="button" className="secondary" onClick={() => guarded(handleRegenerate)}>
              Regenerate Round
            </button>
            <button type="button" className="secondary" onClick={() => setLargeDisplay(!largeDisplay)} aria-pressed={largeDisplay}>
              {largeDisplay ? 'Normal view' : 'Big screen'}
            </button>
          </div>
        </div>

        {info && (
          <p className="hint">
            {openRound.matches.length} of {numberOfCourts} court{numberOfCourts === 1 ? '' : 's'} in use
            {openRound.matches.length > 0 && ` (${openRound.matches.map(matchCourtLabel).join(', ')})`}
            {info.tierLimitedSitOuts > 0
              ? ` — the most the A/C rule allows (${info.tierLimitedSitOuts} extra sit out${info.tierLimitedSitOuts === 1 ? 's' : ''} because of tier mix).`
              : openRound.matches.length < numberOfCourts
                ? ' — not enough players for more.'
                : '.'}{' '}
            {info.method === 'exhaustive' ? 'Pairings: best of every arrangement.' : 'Pairings: best found by search.'}
            {openRound.regenerationCount > 0 && ` Regenerated ${openRound.regenerationCount}×.`}
            {openRound.manuallyAdjusted && ' Includes manual swaps.'}
          </p>
        )}
        {scoring && (
          <p className={recorded < openRound.matches.length && openRound.status === 'active' ? 'hint tier-results-progress pending' : 'hint tier-results-progress'}>
            Scoring: {scoreModeLabel(scoreMode)} —{' '}
            {openRound.status === 'draft'
              ? 'start the round to record results.'
              : `${recorded} of ${openRound.matches.length} results recorded.`}
          </p>
        )}

        {issues.length > 0 && (
          <div className="session-adjustment-notice tier-issues" role="alert">
            <div>
              {issues.map((issue) => (
                <p key={issue} className="hint">
                  {issue}
                </p>
              ))}
              <p className="hint">
                {openRound.status === 'draft'
                  ? 'Regenerate Round to apply the latest players, tiers and courts, or swap players by tapping names.'
                  : 'The round in play is not changed automatically — swap players, or regenerate if needed.'}
              </p>
            </div>
          </div>
        )}

        <p className="hint tier-swap-hint">
          {selected.length === 0 && 'Tap two players (on a court or sitting out) to swap them.'}
          {selected.length === 1 && `Selected ${nameOf(selected[0])} — tap another player to swap with. Esc to cancel.`}
        </p>

        {preview && (
          <div className={preview.ok ? 'tier-swap-preview' : 'tier-swap-preview invalid'} role="status">
            {preview.ok ? (
              <>
                <p className="tier-swap-summary">Swap {preview.summary}</p>
                <div className="tier-swap-diff">
                  <div>
                    <strong>Before</strong>
                    {preview.before.map((line) => (
                      <p key={line} className="hint">
                        {line}
                      </p>
                    ))}
                  </div>
                  <div>
                    <strong>After</strong>
                    {preview.after.map((line) => (
                      <p key={line} className="hint">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="hint error">{preview.reason}</p>
            )}
            <div className="tier-swap-actions">
              {preview.ok && (
                <button type="button" className="cta-button" onClick={handleConfirmSwap}>
                  Confirm Swap
                </button>
              )}
              <button type="button" className="secondary" onClick={() => setSelected([])}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="tier-court-grid">
          {openRound.matches.map((match) => (
            <TierCourtCard
              key={match.id}
              match={match}
              playersById={playersById}
              tierOf={liveTier}
              onPlayerClick={pick}
              selectedIds={selected}
              invalid={invalidCourts.has(match.id)}
              needsResult={scoring && openRound.status === 'active' && !match.result}
              footer={
                openRound.status === 'active' && (scoring || match.result) ? (
                  <TierResultEntry
                    key={`${match.id}:${match.result?.recordedAt ?? 'none'}:${scoreMode}`}
                    match={match}
                    scoreMode={scoreMode}
                    nameOf={nameOf}
                    locked={false}
                    onRecord={(input, correction) => props.onRecordResult(openRound.id, match.id, input, correction)}
                    onClear={(correction) => props.onClearResult(openRound.id, match.id, correction)}
                  />
                ) : undefined
              }
            />
          ))}
        </div>

        <h3 className="tier-sitting-heading">Sitting Out ({restingSorted.length})</h3>
        {restingSorted.length === 0 ? (
          <p className="empty-state">Everyone available is playing this round.</p>
        ) : (
          <ul className="tier-resting-list">
            {restingSorted.map((id) => {
              const s = stats.get(id);
              const runIfRested = (s?.consecutiveSitOuts ?? 0) + 1;
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={selected.includes(id) ? 'tier-resting-chip selected' : 'tier-resting-chip'}
                    onClick={() => pick(id)}
                    aria-pressed={selected.includes(id)}
                  >
                    <span className="tier-player-name">{nameOf(id)}</span>
                    <TierPill tier={liveTier(id)} />
                    <span className="tier-resting-meta">
                      Sat out {s?.roundsSatOut ?? 0}× before
                      {runIfRested > 1 && <strong className="tier-consecutive"> · {runIfRested} in a row</strong>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card tier-controls">
        <h2>Session Controls</h2>
        <TierScoreModePicker value={scoreMode} onChange={handleScoreMode} />
        <CourtNumberChangeControl
          courtNumbers={props.courtNumbers}
          currentRoundQuestion={(countChanged) =>
            openRound.status === 'active' && !countChanged
              ? `Also move Round ${openRound.roundNumber} (in play) to the new courts? Players stay in the same matches.`
              : null
          }
          onApply={(nums, applyToOpen) => report(props.onSetCourtNumbers(nums, applyToOpen))}
        />
        <p className="hint">
          A draft round moves to the new courts straight away; a different number of courts applies from the next
          generated round (or Regenerate Round). Completed rounds keep their courts.
        </p>
        <div className="tier-controls-row">
          <button type="button" className="secondary" onClick={props.onManagePlayers}>
            Manage Players, Tiers & Availability
          </button>
          <button type="button" className="secondary" onClick={props.onShowLeaderboard}>
            Leaderboard
          </button>
          {/* Not guarded: it never takes another button's place, and it confirms first. */}
          <button type="button" className="danger tier-end-session" onClick={handleEndSession}>
            End Session
          </button>
        </div>
      </section>
    </div>
  );
}
