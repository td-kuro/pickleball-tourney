// Tier-Based Pairings — session operations. Every function takes a
// TierSession and returns a new one (or the same object when nothing
// changed), with no React or storage code, so the hook can persist to
// localStorage today and the same functions can sit behind Firestore later.
//
// Round lifecycle: draft → active → completed. Only completed rounds count
// toward history (see computeTierStats), so regenerating or discarding a
// draft/active round never leaks into partner/opponent/sit-out counts, and
// completing is idempotent by round id.
import type {
  PlayerTier,
  TierEvent,
  TierEventType,
  TierFinalStandings,
  TierMatchResult,
  TierPlayer,
  TierRound,
  TierScoreMode,
  TierSession,
  TierSettings,
} from '../types';
import { adjustCourtNumbers, cleanCourtNumbers, defaultCourtNumbers, formatCourtList, resolveCourtNumbers, sameCourtNumbers } from './courtNumbers';
import { buildFinalStandings, buildTierResult, describeResult, sameResult, type ResultInput } from './tierLeaderboard';
import {
  generateTierRound,
  makeTierId,
  matchCourtLabel,
  maxValidMatches,
  planTierSwap,
  tierRoundSignature,
  validateTierRound,
  type ArrangeOptions,
  type RandomSource,
} from './tierPairings';

export const DEFAULT_TIER: PlayerTier = 'B';
export const MAX_TIER_COURTS = 30;

export const DEFAULT_TIER_SCORE_MODE: TierScoreMode = 'win-loss-only';

export const DEFAULT_TIER_SETTINGS: TierSettings = {
  sessionName: '',
  numberOfCourts: 4,
  courtNumbers: defaultCourtNumbers(4),
  scoreMode: DEFAULT_TIER_SCORE_MODE,
};

// `numberOfCourts` alone (as older callers and tests pass it) selects
// Courts 1..N; `courtNumbers` wins when given.
export function createTierSession(settings: Partial<TierSettings> = {}): TierSession {
  const courtNumbers =
    cleanCourtNumbers(settings.courtNumbers) ?? defaultCourtNumbers(settings.numberOfCourts ?? DEFAULT_TIER_SETTINGS.numberOfCourts);
  return {
    version: 1,
    started: false,
    settings: { ...DEFAULT_TIER_SETTINGS, ...settings, courtNumbers, numberOfCourts: courtNumbers.length },
    players: [],
    rounds: [],
    events: [],
  };
}

const isScoreMode = (v: unknown): v is TierScoreMode => v === 'none' || v === 'win-loss-only' || v === 'full-score';

function withCourtNumbers(session: TierSession, courtNumbers: number[], applyToOpen = false): TierSession {
  const next = { ...session, settings: { ...session.settings, courtNumbers, numberOfCourts: courtNumbers.length } };
  return relabelOpenRound(next, applyToOpen);
}

// Puts the open round's matches on the selected courts, in order. A draft
// (not started) always follows the selection; a round in play only when the
// organiser explicitly reassigns it (`applyToActive`). Players never move —
// only the court each match is on. Completed rounds are never touched.
function relabelOpenRound(session: TierSession, applyToActive: boolean): TierSession {
  const open = session.rounds.find((r) => r.status !== 'completed');
  if (!open || (open.status === 'active' && !applyToActive)) return session;
  const nums = session.settings.courtNumbers;
  let changed = false;
  const matches = open.matches.map((m, i) => {
    const physical = nums[i];
    if (physical === undefined || physical === m.physicalCourt) return m;
    changed = true;
    return { ...m, physicalCourt: physical };
  });
  if (!changed) return session;
  return { ...session, rounds: session.rounds.map((r) => (r.id === open.id ? { ...r, matches } : r)) };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTier = (v: unknown): v is PlayerTier => v === 'A' || v === 'B' || v === 'C';
const isIdPair = (v: unknown): v is [string, string] => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string');

function normalizePlayer(raw: unknown): TierPlayer | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  const player: TierPlayer = {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Unnamed player',
    tier: isTier(raw.tier) ? raw.tier : DEFAULT_TIER,
    available: raw.available !== false,
  };
  if (typeof raw.joinedAtRound === 'number') player.joinedAtRound = raw.joinedAtRound;
  if (raw.removed === true) {
    player.removed = true;
    player.available = false;
  }
  return player;
}

function normalizeRound(raw: unknown): TierRound | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.roundNumber !== 'number' || !Array.isArray(raw.matches)) return null;
  if (raw.status !== 'draft' && raw.status !== 'active' && raw.status !== 'completed') return null;
  const matches = raw.matches;
  if (!matches.every((m) => isObject(m) && typeof m.id === 'string' && typeof m.courtNumber === 'number' && isIdPair(m.teamAPlayerIds) && isIdPair(m.teamBPlayerIds))) {
    return null;
  }
  const cleanMatches = matches.map((m) => {
    const match = { ...(m as unknown as TierRound['matches'][number]) };
    // Older saves: a "Court N" text label becomes physical court N.
    const legacy = match as unknown as { courtId?: unknown; courtName?: unknown };
    if (typeof match.physicalCourt !== 'number' && typeof legacy.courtName === 'string') {
      const n = /^Court (\d+)$/.exec(legacy.courtName.trim());
      if (n) match.physicalCourt = Number(n[1]);
    }
    delete legacy.courtId;
    delete legacy.courtName;
    if (typeof match.physicalCourt !== 'number' || !Number.isInteger(match.physicalCourt) || match.physicalCourt < 1) delete match.physicalCourt;
    if (match.result !== undefined && !isValidResult(match.result)) delete match.result;
    return match;
  });
  const resting = Array.isArray(raw.restingPlayerIds) ? raw.restingPlayerIds.filter((x): x is string => typeof x === 'string') : [];
  const playerTiers: Record<string, PlayerTier> = {};
  if (isObject(raw.playerTiers)) for (const [id, t] of Object.entries(raw.playerTiers)) if (isTier(t)) playerTiers[id] = t;
  return {
    ...(raw as unknown as TierRound),
    matches: cleanMatches,
    restingPlayerIds: resting,
    playerTiers,
    courtsAtGeneration: typeof raw.courtsAtGeneration === 'number' ? raw.courtsAtGeneration : matches.length,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    regenerationCount: typeof raw.regenerationCount === 'number' ? raw.regenerationCount : 0,
    manuallyAdjusted: raw.manuallyAdjusted === true,
  };
}

function isValidResult(r: unknown): r is TierMatchResult {
  if (!isObject(r) || (r.winner !== 'A' && r.winner !== 'B') || typeof r.recordedAt !== 'number') return false;
  if (r.recordingMode === 'win-loss-only') return r.scoreA === undefined && r.scoreB === undefined;
  if (r.recordingMode !== 'full-score') return false;
  const a = r.scoreA;
  const b = r.scoreB;
  return typeof a === 'number' && typeof b === 'number' && a !== b && (a > b ? 'A' : 'B') === r.winner;
}

function clampCourts(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(MAX_TIER_COURTS, Math.floor(value)));
}

// Accepts whatever was saved (an older build, a hand-edited or partly
// corrupted value) and repairs it field by field: unusable players/rounds
// are dropped individually, everything valid is kept exactly as saved, and
// a reload never crashes on a missing field.
export function normalizeTierSession(raw: unknown): TierSession {
  const base = createTierSession();
  if (!isObject(raw)) return base;
  const settings = isObject(raw.settings) ? raw.settings : {};
  const players = Array.isArray(raw.players) ? raw.players.map(normalizePlayer).filter((p): p is TierPlayer => p !== null) : [];
  const seenIds = new Set<string>();
  const uniquePlayers = players.filter((p) => !seenIds.has(p.id) && seenIds.add(p.id));
  const rounds = Array.isArray(raw.rounds) ? raw.rounds.map(normalizeRound).filter((r): r is TierRound => r !== null) : [];
  // At most one open round may exist; keep the newest if a bad save left more.
  const openRounds = rounds.filter((r) => r.status !== 'completed').sort((a, b) => b.roundNumber - a.roundNumber);
  const keptRounds = rounds.filter((r) => r.status === 'completed' || r === openRounds[0]);
  const started = raw.started === true;
  const courtNumbers = resolveCourtNumbers(settings.courtNumbers, clampCourts(settings.numberOfCourts, base.settings.numberOfCourts));
  const session: TierSession = {
    version: 1,
    started,
    settings: {
      sessionName: typeof settings.sessionName === 'string' ? settings.sessionName : base.settings.sessionName,
      numberOfCourts: courtNumbers.length,
      courtNumbers,
      // Sessions saved before scoring existed were played without scores.
      scoreMode: isScoreMode(settings.scoreMode) ? settings.scoreMode : started ? 'none' : DEFAULT_TIER_SCORE_MODE,
    },
    players: uniquePlayers,
    rounds: keptRounds,
    events: Array.isArray(raw.events) ? (raw.events.filter((e) => isObject(e) && typeof e.type === 'string') as unknown as TierEvent[]) : [],
  };
  if (typeof raw.endedAt === 'number') {
    session.endedAt = raw.endedAt;
    if (isObject(raw.finalStandings) && Array.isArray(raw.finalStandings.standings)) {
      session.finalStandings = raw.finalStandings as unknown as TierFinalStandings;
    }
  }
  return session;
}

export interface TierContext {
  rng?: RandomSource;
  now?: number;
  arrangeOptions?: ArrangeOptions;
}

function ctxNow(ctx: TierContext): number {
  return ctx.now ?? Date.now();
}

function withEvent(
  session: TierSession,
  ctx: TierContext,
  type: TierEventType,
  message: string,
  extra: Partial<TierEvent> = {},
): TierSession {
  const event: TierEvent = { id: makeTierId('tier-event', ctx.rng ?? Math.random), type, at: ctxNow(ctx), message, ...extra };
  return { ...session, events: [...session.events, event] };
}

// The one round that isn't completed yet (draft or active), if any.
export function openTierRound(session: TierSession): TierRound | undefined {
  return session.rounds.find((r) => r.status !== 'completed');
}

export function completedTierRoundCount(session: TierSession): number {
  return session.rounds.filter((r) => r.status === 'completed').length;
}

function nextRoundNumber(session: TierSession): number {
  return session.rounds.reduce((max, r) => Math.max(max, r.roundNumber), 0) + 1;
}

export function tierPlayerName(session: TierSession, id: string): string {
  return session.players.find((p) => p.id === id)?.name ?? 'Unknown player';
}

export function activeTierPlayers(session: TierSession): TierPlayer[] {
  return session.players.filter((p) => !p.removed);
}

// --- Roster -----------------------------------------------------------------

export interface NewTierPlayer {
  name: string;
  tier?: PlayerTier;
}

const TIER_WORDS: Record<string, PlayerTier> = {
  a: 'A',
  top: 'A',
  b: 'B',
  inbetween: 'B',
  'in-between': 'B',
  mid: 'B',
  middle: 'B',
  c: 'C',
  lower: 'C',
  low: 'C',
};

// Quick-add text: one player per line, with an optional tier after a comma,
// tab, dash, colon, or in brackets — "Thai, A", "Alex - B", "Kim (C)",
// "Sarah: top". A line with no recognisable tier gets the default tier.
export function parseTierPlayerLines(text: string, defaultTier: PlayerTier = DEFAULT_TIER): NewTierPlayer[] {
  const out: NewTierPlayer[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const bracket = line.match(/^(.*?)[\s]*[([]\s*([A-Za-z-]+)\s*[)\]]\s*$/);
    const separated = line.match(/^(.*?)\s*(?:,|\t|\s-\s|:)\s*([A-Za-z-]+)\s*$/);
    const match = bracket ?? separated;
    const tier = match ? TIER_WORDS[match[2].toLowerCase()] : undefined;
    if (match && tier && match[1].trim()) out.push({ name: match[1].trim(), tier });
    else out.push({ name: line, tier: defaultTier });
  }
  return out;
}

export function addTierPlayers(session: TierSession, entries: NewTierPlayer[], ctx: TierContext = {}): TierSession {
  if (ended(session)) return session;
  const rng = ctx.rng ?? Math.random;
  // The first round generated after they were added.
  const joinedAtRound = session.started ? nextRoundNumber(session) : undefined;
  let next = session;
  const added: TierPlayer[] = [];
  const takenIds = new Set(session.players.map((p) => p.id));
  const takenNames = new Set(session.players.map((p) => p.name.trim().toLowerCase()));
  entries.forEach((entry) => {
    const base = entry.name.trim().replace(/\s+/g, ' ');
    if (!base) return; // blank names are rejected
    // Two players with the same name would be indistinguishable on court
    // cards and in swaps, so later ones get " 2", " 3", ...
    let name = base;
    for (let n = 2; takenNames.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    takenNames.add(name.toLowerCase());
    let id = makeTierId('tier-player', rng);
    for (let n = 2; takenIds.has(id); n++) id = `${makeTierId('tier-player', rng)}-${n}`;
    takenIds.add(id);
    added.push({
      id,
      name,
      tier: entry.tier ?? DEFAULT_TIER,
      available: true,
      ...(joinedAtRound !== undefined ? { joinedAtRound } : {}),
    });
  });
  if (added.length === 0) return session;
  next = { ...next, players: [...next.players, ...added] };
  if (session.started) {
    for (const p of added) next = withEvent(next, ctx, 'player-added', `${p.name} (${p.tier}) joined the session.`, { playerId: p.id });
  }
  return next;
}

export function renameTierPlayer(session: TierSession, playerId: string, name: string): TierSession {
  if (ended(session)) return session;
  const base = name.trim().replace(/\s+/g, ' ');
  const player = session.players.find((p) => p.id === playerId);
  if (!base || !player || base === player.name) return session;
  const taken = new Set(session.players.filter((p) => p.id !== playerId).map((p) => p.name.trim().toLowerCase()));
  let unique = base;
  for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${base} ${n}`;
  return { ...session, players: session.players.map((p) => (p.id === playerId ? { ...p, name: unique } : p)) };
}

// Live tier change: saved immediately and used by every round generated
// from now on. Completed rounds keep the tier they were played at (their
// playerTiers snapshot), history is untouched, and the open round is never
// rewritten automatically — the UI offers Regenerate Round instead.
export function setTierPlayerTier(session: TierSession, playerId: string, tier: PlayerTier, ctx: TierContext = {}): TierSession {
  if (ended(session)) return session;
  const player = session.players.find((p) => p.id === playerId);
  if (!player || player.tier === tier) return session;
  const next = { ...session, players: session.players.map((p) => (p.id === playerId ? { ...p, tier } : p)) };
  if (!session.started) return next;
  return withEvent(next, ctx, 'tier-changed', `${player.name} moved from ${player.tier} to ${tier}.`, { playerId });
}

export function setTierPlayerAvailability(session: TierSession, playerId: string, available: boolean, ctx: TierContext = {}): TierSession {
  if (ended(session)) return session;
  const player = session.players.find((p) => p.id === playerId);
  if (!player || player.available === available || player.removed) return session;
  let next = { ...session, players: session.players.map((p) => (p.id === playerId ? { ...p, available } : p)) };
  // Someone sitting out the open round who leaves is no longer sitting out
  // it — otherwise completing the round would record a sit-out for a round
  // they weren't there for. (A player on a court stays there: the organiser
  // swaps them out, and if they finish the game it counts as played.)
  const open = openTierRound(session);
  if (!available && open?.restingPlayerIds.includes(playerId)) {
    next = {
      ...next,
      rounds: next.rounds.map((r) => (r.id === open.id ? { ...r, restingPlayerIds: r.restingPlayerIds.filter((id) => id !== playerId) } : r)),
    };
  }
  if (!session.started) return next;
  return withEvent(next, ctx, 'availability-changed', `${player.name} is ${available ? 'available again' : 'unavailable'}.`, { playerId });
}

function playerAppearsIn(round: TierRound, playerId: string): boolean {
  return round.restingPlayerIds.includes(playerId) || round.matches.some((m) => [...m.teamAPlayerIds, ...m.teamBPlayerIds].includes(playerId));
}

export type TierResult =
  | { ok: true; session: TierSession; message?: string }
  // missingResults: the action needs the organiser to confirm continuing
  // with that many unrecorded matches (pass allowMissingResults).
  | { ok: false; reason: string; missingResults?: number };

export const SESSION_ENDED_REASON = 'This session has ended. Reset to start a new one.';

function ended(session: TierSession): boolean {
  return session.endedAt !== undefined;
}

// A player who never appeared in a round is deleted outright. Anyone with
// history is kept as `removed` (hidden, never assigned) so old rounds still
// show their name. A player on a court in the open round must be swapped
// out first.
export function removeTierPlayer(session: TierSession, playerId: string, ctx: TierContext = {}): TierResult {
  if (ended(session)) return { ok: false, reason: SESSION_ENDED_REASON };
  const player = session.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: 'Player not found.' };
  const open = openTierRound(session);
  if (open && open.matches.some((m) => [...m.teamAPlayerIds, ...m.teamBPlayerIds].includes(playerId))) {
    return { ok: false, reason: `${player.name} is on a court in Round ${open.roundNumber}. Swap them out or regenerate the round first.` };
  }
  const rounds = open
    ? session.rounds.map((r) => (r.id === open.id ? { ...r, restingPlayerIds: r.restingPlayerIds.filter((id) => id !== playerId) } : r))
    : session.rounds;
  const hasHistory = rounds.some((r) => playerAppearsIn(r, playerId));
  const players = hasHistory
    ? session.players.map((p) => (p.id === playerId ? { ...p, removed: true, available: false } : p))
    : session.players.filter((p) => p.id !== playerId);
  const next = { ...session, players, rounds };
  return {
    ok: true,
    session: session.started ? withEvent(next, ctx, 'player-removed', `${player.name} was removed.`, { playerId }) : next,
  };
}

export function removeAllTierPlayers(session: TierSession): TierSession {
  if (session.started) return session;
  return { ...session, players: [] };
}

export function setTierCourts(session: TierSession, courts: number, ctx: TierContext = {}): TierSession {
  if (ended(session)) return session;
  const value = clampCourts(courts, session.settings.numberOfCourts);
  if (value === session.settings.numberOfCourts) return session;
  const result = setTierCourtNumbers(session, adjustCourtNumbers(session.settings.courtNumbers, value), ctx);
  return result.ok ? result.session : session;
}

// --- Courts -----------------------------------------------------------------

// Court Number Selection: which physical courts are in use. The court COUNT
// (how many matches a round holds) is simply how many are selected. Future
// rounds use the new selection; a draft round is moved onto the new courts
// straight away (no player moves); a round in play only with
// `applyToOpen`; completed rounds keep the courts they were played on.
export function setTierCourtNumbers(session: TierSession, courtNumbers: number[], ctx: TierContext & { applyToOpen?: boolean } = {}): TierResult {
  if (ended(session)) return { ok: false, reason: SESSION_ENDED_REASON };
  const nums = cleanCourtNumbers(courtNumbers);
  if (!nums) return { ok: false, reason: 'Select at least one court.' };
  if (nums.length !== courtNumbers.length) return { ok: false, reason: 'Each court number can only be selected once.' };
  if (nums.length > MAX_TIER_COURTS) return { ok: false, reason: `At most ${MAX_TIER_COURTS} courts.` };
  if (sameCourtNumbers(nums, session.settings.courtNumbers)) return { ok: true, session: ctx.applyToOpen ? relabelOpenRound(session, true) : session };
  const next = withCourtNumbers(session, nums, ctx.applyToOpen === true);
  if (!session.started) return { ok: true, session: next };
  return {
    ok: true,
    session: withEvent(
      next,
      ctx,
      'courts-changed',
      `Courts changed from ${formatCourtList(session.settings.courtNumbers)} to ${formatCourtList(nums)}. The next generated round uses ${nums.length} court${nums.length === 1 ? '' : 's'}.`,
    ),
  };
}

// --- Scoring ------------------------------------------------------------------

export function setTierScoreMode(session: TierSession, mode: TierScoreMode, ctx: TierContext = {}): TierResult {
  if (ended(session)) return { ok: false, reason: SESSION_ENDED_REASON };
  if (!isScoreMode(mode)) return { ok: false, reason: 'Unknown score mode.' };
  if (session.settings.scoreMode === mode) return { ok: true, session };
  const next = { ...session, settings: { ...session.settings, scoreMode: mode } };
  return {
    ok: true,
    session: session.started ? withEvent(next, ctx, 'score-mode-changed', `Score recording changed to ${scoreModeLabel(mode)}. Results already recorded are kept.`) : next,
  };
}

export function scoreModeLabel(mode: TierScoreMode): string {
  return mode === 'none' ? 'No Scoring' : mode === 'win-loss-only' ? 'Win/Loss Only' : 'Full Score';
}

function findMatch(session: TierSession, roundId: string, matchId: string) {
  const round = session.rounds.find((r) => r.id === roundId);
  const match = round?.matches.find((m) => m.id === matchId);
  return { round, match };
}

function replaceMatchResult(session: TierSession, roundId: string, matchId: string, result: TierMatchResult | undefined): TierSession {
  return {
    ...session,
    rounds: session.rounds.map((r) =>
      r.id !== roundId
        ? r
        : {
            ...r,
            matches: r.matches.map((m) => {
              if (m.id !== matchId) return m;
              const { result: _old, ...rest } = m;
              void _old;
              return result ? { ...rest, result } : rest;
            }),
          },
    ),
  };
}

// Records (or edits) a result. Results go on the round in play; a
// completed round is locked and only changes through an explicit
// correction (`correction: true`), which is logged with the old result.
// Submitting the same result again is a no-op. Standings are derived from
// these results, so an edit replaces — never adds to — the old one.
export function recordTierResult(
  session: TierSession,
  roundId: string,
  matchId: string,
  input: ResultInput,
  ctx: TierContext & { correction?: boolean } = {},
): TierResult {
  if (ended(session)) return { ok: false, reason: SESSION_ENDED_REASON };
  const { round, match } = findMatch(session, roundId, matchId);
  if (!round || !match) return { ok: false, reason: 'Match not found.' };
  if (round.status === 'draft') return { ok: false, reason: 'Start the round before recording results.' };
  if (round.status === 'completed' && !ctx.correction) return { ok: false, reason: `Round ${round.roundNumber} is completed. Use Correct Result to change it.` };
  if (match.teamAPlayerIds.length !== 2 || match.teamBPlayerIds.length !== 2) return { ok: false, reason: 'Each side needs exactly two players.' };
  const built = buildTierResult(session.settings.scoreMode, input);
  if (!built.ok) return built;
  if (sameResult(match.result, built.result)) return { ok: true, session };
  const result: TierMatchResult = { ...built.result, recordedAt: ctxNow(ctx) };
  const next = replaceMatchResult(session, roundId, matchId, result);
  const nameOf = (id: string) => tierPlayerName(session, id);
  const text = describeResult({ ...match, result }, nameOf);
  const isChange = match.result !== undefined;
  return {
    ok: true,
    session: withEvent(
      next,
      ctx,
      isChange || round.status === 'completed' ? 'result-corrected' : 'result-recorded',
      `Round ${round.roundNumber}, ${matchCourtLabel(match)}: ${text}${isChange ? ` (was: ${describeResult(match, nameOf)})` : ''}.`,
      { roundNumber: round.roundNumber, matchId, ...(match.result ? { previousResult: match.result } : {}) },
    ),
  };
}

export function clearTierResult(session: TierSession, roundId: string, matchId: string, ctx: TierContext & { correction?: boolean } = {}): TierResult {
  if (ended(session)) return { ok: false, reason: SESSION_ENDED_REASON };
  const { round, match } = findMatch(session, roundId, matchId);
  if (!round || !match) return { ok: false, reason: 'Match not found.' };
  if (!match.result) return { ok: true, session };
  if (round.status === 'completed' && !ctx.correction) return { ok: false, reason: `Round ${round.roundNumber} is completed. Use Correct Result to change it.` };
  const next = replaceMatchResult(session, roundId, matchId, undefined);
  return {
    ok: true,
    session: withEvent(next, ctx, 'result-cleared', `Round ${round.roundNumber}, ${matchCourtLabel(match)}: result cleared (was: ${describeResult(match, (id) => tierPlayerName(session, id))}).`, {
      roundNumber: round.roundNumber,
      matchId,
      previousResult: match.result,
    }),
  };
}

function missingResults(session: TierSession, round: TierRound): number {
  if (session.settings.scoreMode === 'none') return 0;
  return round.matches.filter((m) => !m.result).length;
}

// --- End Session ----------------------------------------------------------------

// Ends the session: the round in play is completed (asking first if results
// are missing — pass allowMissingResults), an unplayed draft is discarded,
// and the standings are frozen. Idempotent: ending twice changes nothing.
// An ended session is read-only.
export function endTierSession(session: TierSession, ctx: TierContext & { allowMissingResults?: boolean } = {}): TierResult {
  if (ended(session)) return { ok: true, session };
  if (!session.started) return { ok: false, reason: 'The session has not started.' };
  const open = openTierRound(session);
  let next = session;
  if (open?.status === 'active') {
    const missing = missingResults(session, open);
    if (missing > 0 && !ctx.allowMissingResults) {
      return { ok: false, reason: `${missing} match${missing === 1 ? ' has' : 'es have'} no result in Round ${open.roundNumber}.`, missingResults: missing };
    }
    next = { ...next, rounds: next.rounds.map((r) => (r.id === open.id ? { ...r, status: 'completed' as const, completedAt: ctxNow(ctx) } : r)) };
    next = withEvent(next, ctx, 'round-completed', `Round ${open.roundNumber} completed.`, { roundNumber: open.roundNumber });
  } else if (open?.status === 'draft') {
    next = { ...next, rounds: next.rounds.filter((r) => r.id !== open.id) };
    next = withEvent(next, ctx, 'round-regenerated', `Round ${open.roundNumber} was not played and has been discarded.`, {
      roundNumber: open.roundNumber,
      discarded: { matches: open.matches, restingPlayerIds: open.restingPlayerIds },
    });
  }
  const endedAt = ctxNow(ctx);
  const finalStandings = buildFinalStandings(next.players, next.rounds, next.settings.scoreMode, endedAt);
  next = { ...next, endedAt, finalStandings };
  const winners = finalStandings.winnerIds.map((id) => tierPlayerName(next, id));
  return {
    ok: true,
    session: withEvent(
      next,
      ctx,
      'session-ended',
      winners.length === 0 ? 'Session ended.' : `Session ended. ${winners.length > 1 ? 'Joint winners' : 'Winner'}: ${winners.join(', ')}.`,
    ),
  };
}

export function setTierSessionName(session: TierSession, sessionName: string): TierSession {
  return { ...session, settings: { ...session.settings, sessionName } };
}

// --- Rounds -----------------------------------------------------------------

export function canStartTierSession(session: TierSession): { ok: true } | { ok: false; reason: string } {
  const eligible = session.players.filter((p) => p.available && !p.removed);
  if (eligible.length < 4) return { ok: false, reason: 'Add at least 4 available players to start.' };
  const count = (tier: PlayerTier) => eligible.filter((p) => p.tier === tier).length;
  if (maxValidMatches(count('A'), count('B'), count('C'), session.settings.numberOfCourts) === 0) {
    return { ok: false, reason: 'No valid match is possible yet — Top (A) and Lower (C) players cannot share a court. Add Inbetween (B) players or more of one tier.' };
  }
  return { ok: true };
}

function generateInto(session: TierSession, roundNumber: number, ctx: TierContext): TierRound {
  return generateTierRound({
    players: session.players,
    rounds: session.rounds.filter((r) => r.status === 'completed'),
    numberOfCourts: session.settings.numberOfCourts,
    courtNumbers: session.settings.courtNumbers,
    roundNumber,
    rng: ctx.rng ?? Math.random,
    nowMs: ctxNow(ctx),
    arrangeOptions: ctx.arrangeOptions,
  });
}

function roundSummary(round: TierRound): string {
  return `${round.matches.length} court${round.matches.length === 1 ? '' : 's'}, ${round.restingPlayerIds.length} sitting out`;
}

export function startTierSession(session: TierSession, ctx: TierContext = {}): TierResult {
  if (ended(session)) return { ok: false, reason: SESSION_ENDED_REASON };
  if (session.started) return { ok: false, reason: 'The session has already started.' };
  const check = canStartTierSession(session);
  if (!check.ok) return check;
  const round = generateInto(session, 1, ctx);
  let next: TierSession = { ...session, started: true, rounds: [round] };
  next = withEvent(next, ctx, 'session-started', `Session started with ${session.players.filter((p) => p.available).length} players on ${session.settings.numberOfCourts} courts.`);
  next = withEvent(next, ctx, 'round-generated', `Round 1 generated: ${roundSummary(round)}.`, { roundNumber: 1 });
  return { ok: true, session: next };
}

// Generates the next draft round. Refuses while a round is still open so a
// double click can never create two rounds.
export function generateNextTierRound(session: TierSession, ctx: TierContext = {}): TierResult {
  if (ended(session)) return { ok: false, reason: SESSION_ENDED_REASON };
  if (!session.started) return { ok: false, reason: 'Start the session first.' };
  const open = openTierRound(session);
  if (open) return { ok: false, reason: `Round ${open.roundNumber} is still open.` };
  const roundNumber = nextRoundNumber(session);
  const round = generateInto(session, roundNumber, ctx);
  if (round.matches.length === 0) return { ok: false, reason: 'No valid match can be formed from the available players.' };
  const next = withEvent({ ...session, rounds: [...session.rounds, round] }, ctx, 'round-generated', `Round ${roundNumber} generated: ${roundSummary(round)}.`, { roundNumber });
  return { ok: true, session: next };
}

export function startTierRound(session: TierSession, roundId: string, ctx: TierContext = {}): TierResult {
  if (ended(session)) return { ok: false, reason: SESSION_ENDED_REASON };
  const round = session.rounds.find((r) => r.id === roundId);
  if (!round) return { ok: false, reason: 'Round not found.' };
  if (round.status !== 'draft') return { ok: true, session }; // already started/completed — idempotent
  const started: TierRound = { ...round, status: 'active', startedAt: ctxNow(ctx) };
  const next = { ...session, rounds: session.rounds.map((r) => (r.id === roundId ? started : r)) };
  return { ok: true, session: withEvent(next, ctx, 'round-started', `Round ${round.roundNumber} started.`, { roundNumber: round.roundNumber }) };
}

// Next Round: completes the given active round (recording its participation
// and encounters exactly once, by virtue of history being derived from
// completed rounds) and generates the following draft. Keyed by round id,
// so repeated clicks are harmless: once the round is completed and its
// successor exists, nothing else happens.
// With scoring on, a round with unrecorded matches needs the organiser's
// go-ahead (allowMissingResults); those matches simply stay unrecorded —
// never a loss or a draw.
export function advanceTierRound(session: TierSession, roundId: string, ctx: TierContext & { allowMissingResults?: boolean } = {}): TierResult {
  if (ended(session)) return { ok: false, reason: SESSION_ENDED_REASON };
  const round = session.rounds.find((r) => r.id === roundId);
  if (!round) return { ok: false, reason: 'Round not found.' };
  let next = session;
  if (round.status === 'draft') return { ok: false, reason: `Start Round ${round.roundNumber} before moving to the next round.` };
  if (round.status === 'active') {
    const missing = missingResults(session, round);
    if (missing > 0 && !ctx.allowMissingResults) {
      return { ok: false, reason: `${missing} match${missing === 1 ? ' has' : 'es have'} no result yet.`, missingResults: missing };
    }
    const completed: TierRound = { ...round, status: 'completed', completedAt: ctxNow(ctx) };
    next = { ...next, rounds: next.rounds.map((r) => (r.id === roundId ? completed : r)) };
    next = withEvent(next, ctx, 'round-completed', `Round ${round.roundNumber} completed.`, { roundNumber: round.roundNumber });
  }
  if (openTierRound(next)) return { ok: true, session: next };
  const generated = generateNextTierRound(next, ctx);
  if (!generated.ok) return { ok: true, session: next, message: generated.reason };
  return generated;
}

const REGENERATE_ATTEMPTS = 12;

// Replaces the open round's assignments with a fresh arrangement. Eligibility
// and history are recomputed from completed rounds only, so the discarded
// assignments have no effect; they are kept in the event log for audit.
// An active round needs `allowActive` (the UI confirms first). Retries with
// new random draws until the result differs from the discarded round, when
// any different valid arrangement exists.
export function regenerateTierRound(session: TierSession, roundId: string, ctx: TierContext & { allowActive?: boolean } = {}): TierResult {
  if (ended(session)) return { ok: false, reason: SESSION_ENDED_REASON };
  const round = session.rounds.find((r) => r.id === roundId);
  if (!round) return { ok: false, reason: 'Round not found.' };
  if (round.status === 'completed') return { ok: false, reason: 'Completed rounds are never regenerated.' };
  if (round.matches.some((m) => m.result)) {
    return { ok: false, reason: `Round ${round.roundNumber} already has results. Clear them before regenerating, so no result is lost by accident.` };
  }
  if (round.status === 'active' && !ctx.allowActive) return { ok: false, reason: `Round ${round.roundNumber} has already started.` };
  const oldSignature = tierRoundSignature(round);
  let fresh = generateInto(session, round.roundNumber, ctx);
  let different = tierRoundSignature(fresh) !== oldSignature;
  for (let i = 1; i < REGENERATE_ATTEMPTS && !different; i++) {
    fresh = generateInto(session, round.roundNumber, ctx);
    different = tierRoundSignature(fresh) !== oldSignature;
  }
  if (fresh.matches.length === 0) return { ok: false, reason: 'No valid match can be formed from the available players.' };
  // No undefined-valued keys: they vanish in JSON and Firestore rejects them.
  const replacement: TierRound = {
    ...fresh,
    id: round.id,
    status: round.status,
    ...(round.startedAt !== undefined ? { startedAt: round.startedAt } : {}),
    regenerationCount: round.regenerationCount + 1,
  };
  const next = { ...session, rounds: session.rounds.map((r) => (r.id === roundId ? replacement : r)) };
  return {
    ok: true,
    session: withEvent(next, ctx, 'round-regenerated', `Round ${round.roundNumber} regenerated: ${roundSummary(replacement)}.`, {
      roundNumber: round.roundNumber,
      discarded: { matches: round.matches, restingPlayerIds: round.restingPlayerIds },
    }),
    message: different ? undefined : 'No different valid arrangement exists for these players — the round is unchanged.',
  };
}

export function swapTierPlayers(session: TierSession, roundId: string, playerAId: string, playerBId: string, ctx: TierContext = {}): TierResult {
  if (ended(session)) return { ok: false, reason: SESSION_ENDED_REASON };
  const round = session.rounds.find((r) => r.id === roundId);
  if (!round) return { ok: false, reason: 'Round not found.' };
  const plan = planTierSwap(round, playerAId, playerBId, session.players);
  if (!plan.ok) return plan;
  const next = { ...session, rounds: session.rounds.map((r) => (r.id === roundId ? plan.round : r)) };
  return {
    ok: true,
    session: withEvent(next, ctx, 'swap', `Round ${round.roundNumber}: swapped ${plan.summary}.`, { roundNumber: round.roundNumber }),
    message: `Swapped ${plan.summary}.`,
  };
}

// Warnings for the open round against the roster as it is now — e.g. a tier
// change that makes a saved court mix A and C, someone marked unavailable
// while assigned, fewer courts than matches, or an available player who
// isn't in the round at all (added or reactivated after it was generated).
export function openTierRoundIssues(session: TierSession): string[] {
  const open = openTierRound(session);
  if (!open) return [];
  const issues = validateTierRound(open, session.players, session.settings.numberOfCourts);
  // Only a draft can still take them; an in-play round just plays on and
  // they join from the next round.
  const missing = open.status === 'draft' ? session.players.filter((p) => p.available && !p.removed && !playerAppearsIn(open, p.id)) : [];
  if (missing.length > 0) {
    issues.push(`${missing.map((p) => p.name).join(', ')} ${missing.length === 1 ? 'is' : 'are'} available but not in this round.`);
  }
  const inUse = new Set(session.settings.courtNumbers);
  const offCourts = open.matches.filter((m) => m.physicalCourt !== undefined && !inUse.has(m.physicalCourt));
  if (offCourts.length > 0) {
    issues.push(`${offCourts.map(matchCourtLabel).join(', ')} ${offCourts.length === 1 ? 'is' : 'are'} no longer in use but still has a match this round.`);
  }
  const changedTier = Object.entries(open.playerTiers).filter(([id, tier]) => {
    const p = session.players.find((x) => x.id === id);
    return p && p.tier !== tier;
  });
  if (changedTier.length > 0) {
    issues.push(`Tier changed since this round was generated: ${changedTier.map(([id]) => tierPlayerName(session, id)).join(', ')}.`);
  }
  return issues;
}

// Clears rounds, history and the event log. Keeps the roster (tiers and
// availability included) and courts, so the next session starts quickly;
// players removed mid-session are dropped for good.
export function resetTierSession(session: TierSession): TierSession {
  const players = session.players
    .filter((p) => !p.removed)
    .map((p) => {
      const { joinedAtRound: _joined, ...rest } = p;
      void _joined;
      return rest;
    });
  // createTierSession builds a fresh object, so endedAt/finalStandings go.
  return { ...createTierSession(session.settings), players };
}
