import { useMemo } from 'react';
import type { PlayerTier, TierSession } from '../types';
import { computeTierStats } from '../utils/tierPairings';
import {
  addTierPlayers,
  advanceTierRound,
  canStartTierSession,
  createTierSession,
  generateNextTierRound,
  normalizeTierSession,
  openTierRound,
  openTierRoundIssues,
  regenerateTierRound,
  removeAllTierPlayers,
  removeTierPlayer,
  renameTierPlayer,
  resetTierSession,
  setTierCourts,
  setTierPlayerAvailability,
  setTierPlayerTier,
  startTierRound,
  startTierSession,
  swapTierPlayers,
  type NewTierPlayer,
  type TierResult,
} from '../utils/tierSession';
import { useLocalStorage } from './useLocalStorage';

// One key holding the whole session (settings, roster, rounds, event log) so
// every change is saved atomically — a reload can never see a round without
// the roster change that produced it. The same object maps directly onto a
// single Firestore document later.
const SESSION_KEY = 'pickleball-tourney:tier:session';

// If the saved value can't be parsed, keep a copy under a backup key before
// anything overwrites it — a corrupted save is never silently destroyed.
// (Values that parse but are partly invalid are repaired field by field by
// normalizeTierSession instead.)
function backUpUnreadableSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (raw === null) return;
    try {
      JSON.parse(raw);
    } catch {
      window.localStorage.setItem(`${SESSION_KEY}:unreadable-backup-${Date.now()}`, raw);
    }
  } catch {
    // storage unavailable (private mode etc.) — nothing to protect
  }
}
// Module load happens before any component reads the key.
if (typeof window !== 'undefined') backUpUnreadableSession();

// Tier-Based Pairings' own state, separate from every other mode. All logic
// lives in utils/tierSession.ts and utils/tierPairings.ts; this hook only
// persists the result. Saved rounds are never regenerated on load or on
// view changes, so refreshing shows exactly the same assignments.
export function useTierPairings() {
  const [stored, setStored] = useLocalStorage<TierSession>(SESSION_KEY, createTierSession());
  const session = useMemo(() => normalizeTierSession(stored), [stored]);
  const stats = useMemo(() => computeTierStats(session.players, session.rounds), [session.players, session.rounds]);
  const currentRound = openTierRound(session);
  const issues = useMemo(() => openTierRoundIssues(session), [session]);

  function apply(op: (s: TierSession) => TierResult): TierResult {
    const result = op(session);
    if (result.ok && result.session !== session) setStored(result.session);
    return result;
  }

  function update(op: (s: TierSession) => TierSession) {
    const next = op(session);
    if (next !== session) setStored(next);
  }

  return {
    session,
    settings: session.settings,
    players: session.players,
    rounds: session.rounds,
    events: session.events,
    started: session.started,
    stats,
    currentRound,
    issues,
    addPlayers: (entries: NewTierPlayer[]) => update((s) => addTierPlayers(s, entries)),
    renamePlayer: (id: string, name: string) => update((s) => renameTierPlayer(s, id, name)),
    setTier: (id: string, tier: PlayerTier) => update((s) => setTierPlayerTier(s, id, tier)),
    setAvailability: (id: string, available: boolean) => update((s) => setTierPlayerAvailability(s, id, available)),
    removePlayer: (id: string) => apply((s) => removeTierPlayer(s, id)),
    removeAllPlayers: () => update(removeAllTierPlayers),
    setCourts: (courts: number) => update((s) => setTierCourts(s, courts)),
    startSession: () => apply((s) => startTierSession(s)),
    startError: (() => {
      if (session.started) return null;
      const check = canStartTierSession(session);
      return check.ok ? null : check.reason;
    })(),
    generateNext: () => apply((s) => generateNextTierRound(s)),
    startRound: (roundId: string) => apply((s) => startTierRound(s, roundId)),
    nextRound: (roundId: string) => apply((s) => advanceTierRound(s, roundId)),
    regenerateRound: (roundId: string, allowActive: boolean) => apply((s) => regenerateTierRound(s, roundId, { allowActive })),
    swapPlayers: (roundId: string, a: string, b: string) => apply((s) => swapTierPlayers(s, roundId, a, b)),
    reset: () => update(resetTierSession),
  };
}

export type TierPairingsApi = ReturnType<typeof useTierPairings>;
