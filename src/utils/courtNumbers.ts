// Physical court numbers, shared by every mode.
//
// Two separate concepts, never mixed:
//  - the ACTIVE COURT COUNT (how many matches a round can hold) — what every
//    matchmaking engine works with, unchanged; and
//  - the PHYSICAL COURT NUMBERS painted on the venue's courts (e.g. 3 and 6)
//    — a sorted list of the courts in use, purely for assignment/display.
//
// Engines keep numbering matches by position (1..count) because some modes'
// rules depend on that order (King Court promotion/relegation, Dynamic
// Pairing court movement). Each generated round stores the selection that
// applied when it was generated (`courtNumbers`), so position i of that
// round is played on physical court courtNumbers[i - 1] — and history keeps
// its real courts even after the selection changes. Rounds saved before
// this existed have no snapshot and fall back to their position number.

export const DEFAULT_VENUE_COURTS = 6;
export const MAX_COURT_NUMBER = 99;

export function defaultCourtNumbers(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => i + 1);
}

function isCourtNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_COURT_NUMBER;
}

// Sorted, unique, valid court numbers — or null when nothing usable is left.
export function cleanCourtNumbers(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const nums = [...new Set(raw.filter(isCourtNumber))].sort((a, b) => a - b);
  return nums.length > 0 ? nums : null;
}

// The selection for a mode's settings: the saved list when it is usable and
// agrees with the saved count; otherwise Courts 1..count (older saves, or a
// count changed by code that doesn't know about numbers yet).
export function resolveCourtNumbers(raw: unknown, count: number): number[] {
  const nums = cleanCourtNumbers(raw);
  if (nums && nums.length === count) return nums;
  return defaultCourtNumbers(Math.max(1, count));
}

// Physical court for match position `position` (1-based) of a round whose
// snapshot is `snapshot`.
export function physicalCourt(snapshot: readonly number[] | undefined, position: number): number {
  return snapshot?.[position - 1] ?? position;
}

export function courtLabel(snapshot: readonly number[] | undefined, position: number): string {
  return `Court ${physicalCourt(snapshot, position)}`;
}

export function formatCourtList(nums: readonly number[]): string {
  return nums.map((n) => `Court ${n}`).join(', ');
}

export function sameCourtNumbers(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

// Toggling a court in the picker. Returns null when the change isn't
// allowed (deselecting the last active court, or an invalid number).
export function toggleCourtNumber(selection: readonly number[], n: number): number[] | null {
  if (!isCourtNumber(n)) return null;
  if (selection.includes(n)) {
    if (selection.length <= 1) return null;
    return selection.filter((x) => x !== n);
  }
  return [...selection, n].sort((a, b) => a - b);
}

export function parseCourtNumber(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return isCourtNumber(n) ? n : null;
}

// Reaching a new court COUNT without the organiser picking numbers (older
// controls, defaults): keep the current selection, add the lowest unused
// numbers, or drop the highest ones.
export function adjustCourtNumbers(current: readonly number[], count: number): number[] {
  const nums = (cleanCourtNumbers(current) ?? []).slice(0, Math.max(0, count));
  for (let n = 1; nums.length < count && n <= MAX_COURT_NUMBER; n++) if (!nums.includes(n)) nums.push(n);
  return nums.sort((a, b) => a - b);
}

// Records physical court numbers on saved rounds. Upcoming (not yet
// played) rounds always follow the current selection; the round in play is
// stamped once and then left alone unless the organiser explicitly
// reassigns it (`reassignOpen`); completed rounds are never touched.
// Returns the same array when nothing changed (safe inside effects).
export function stampCourtNumbers<T extends { status: string; courtNumbers?: number[] }>(
  rounds: T[],
  courtNumbers: number[],
  statuses: { upcoming: readonly string[]; open: readonly string[] },
  reassignOpen = false,
): T[] {
  let changed = false;
  const next = rounds.map((r) => {
    const restamp = statuses.upcoming.includes(r.status) || (statuses.open.includes(r.status) && (reassignOpen || !r.courtNumbers));
    if (!restamp || sameCourtNumbers(r.courtNumbers, courtNumbers)) return r;
    changed = true;
    return { ...r, courtNumbers: [...courtNumbers] };
  });
  return changed ? next : rounds;
}
