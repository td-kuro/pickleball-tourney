// The one fair bye/rest selector every round generator uses — Standard
// Social Play and Tournament Leaderboard (individuals, fixed teams, or
// both — see utils/tournament.ts and utils/pairing.ts) and Dynamic Pairing
// Social (entrants — see utils/dynamicPairingSocial.ts). A leaf module with
// no imports beyond types, so each mode can share it without coupling to
// any other mode's logic. See README's "Bye fairness".
//
// Rules, in priority order:
//   1. Only eligible (available) candidates are passed in.
//   2. Fewest byes first — nobody gets a 2nd bye until every eligible
//      candidate has had one, a 3rd until everyone has had two, and so on.
//   3. Never a bye in consecutive rounds when anyone else could take it
//      without breaking rule 2.
//   4. Then whoever's last bye was longest ago.
//   5. Then a stable tiebreak (so a re-render never reshuffles anything).
//
// A candidate is an *entrant*: an individual player (size 1) or a fixed
// team (size 2, both players sit out together and it counts as one bye for
// the team). Mixing sizes is what made the old greedy walk unfair — filling
// slots in fairness order and skipping (or overshooting with) a team that
// didn't fit exactly handed byes to the wrong people, including back-to-back
// ones. Instead, every exact way to fill the slots (k teams + the rest
// individuals, taking the most-due of each kind) is scored and the best
// kept.

export interface ByeCandidate {
  id: string;
  // Physical players this candidate takes out of play: 1 for an
  // individual, 2 for a fixed team.
  size: number;
  // Recorded byes plus any late-return normalisation
  // (Player.byeCountAdjustment) — the number fairness is judged on.
  byeCount: number;
  lastByeRound?: number;
  restedLastRound: boolean;
}

export interface ByeSelectionResult {
  restingIds: string[];
  // Candidates resting again straight after a bye — only ever non-empty
  // when rules 2/3 left no alternative (player/court count, team sizes).
  consecutiveIds: string[];
  // Physical players rested beyond `requiredSlots` — only when no exact fit
  // exists at all (e.g. only fixed teams left and an odd slot count).
  overshoot: number;
}

export const CONSECUTIVE_BYE_NOTE = 'Consecutive bye unavoidable due to player/court count.';

export function compareByePriority(
  a: ByeCandidate,
  b: ByeCandidate,
  tiebreak: (a: ByeCandidate, b: ByeCandidate) => number = () => 0,
): number {
  if (a.byeCount !== b.byeCount) return a.byeCount - b.byeCount;
  if (a.restedLastRound !== b.restedLastRound) return a.restedLastRound ? 1 : -1;
  const lastA = a.lastByeRound ?? -1;
  const lastB = b.lastByeRound ?? -1;
  if (lastA !== lastB) return lastA - lastB;
  return tiebreak(a, b);
}

// Lexicographic score of one candidate selection — lower is fairer.
function scoreSelection(resting: ByeCandidate[], active: ByeCandidate[], rankOf: Map<string, number>): number[] {
  const minActive = active.length > 0 ? Math.min(...active.map((c) => c.byeCount)) : Infinity;
  // Rule 2: how far each rester's count sits above someone still playing.
  const countBreach = resting.reduce((sum, c) => sum + Math.max(0, c.byeCount - minActive), 0);
  // Rule 3.
  const consecutive = resting.filter((c) => c.restedLastRound).length;
  // Rules 4–5, via each candidate's position in the priority order.
  const rankSum = resting.reduce((sum, c) => sum + (rankOf.get(c.id) ?? 0), 0);
  return [countBreach, consecutive, rankSum];
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

export function selectFairByes(
  candidates: ByeCandidate[],
  requiredSlots: number,
  tiebreak?: (a: ByeCandidate, b: ByeCandidate) => number,
): ByeSelectionResult {
  if (requiredSlots <= 0) return { restingIds: [], consecutiveIds: [], overshoot: 0 };

  const sorted = [...candidates].sort((a, b) => compareByePriority(a, b, tiebreak));
  const rankOf = new Map(sorted.map((c, i) => [c.id, i]));
  const singles = sorted.filter((c) => c.size === 1);
  const multis = sorted.filter((c) => c.size !== 1);

  // Exact fills: the k most-due multi-player entrants plus the most-due
  // individuals for whatever's left. Within one kind, taking the most-due
  // is always at least as fair, so only k varies.
  let best: { resting: ByeCandidate[]; score: number[] } | null = null;
  let multiSlots = 0;
  for (let k = 0; k <= multis.length; k++) {
    if (k > 0) multiSlots += multis[k - 1].size;
    const need = requiredSlots - multiSlots;
    if (need < 0) break;
    if (need > singles.length) continue;
    const resting = [...multis.slice(0, k), ...singles.slice(0, need)];
    const restingSet = new Set(resting.map((c) => c.id));
    const active = sorted.filter((c) => !restingSet.has(c.id));
    const score = scoreSelection(resting, active, rankOf);
    if (!best || lexLess(score, best.score)) best = { resting, score };
  }

  let resting: ByeCandidate[];
  if (best) {
    resting = best.resting;
  } else {
    // No exact fit (e.g. only fixed teams left for an odd slot count):
    // walk the priority order, overshooting by as little as possible.
    resting = [];
    let filled = 0;
    for (const c of sorted) {
      if (filled >= requiredSlots) break;
      resting.push(c);
      filled += c.size;
    }
  }

  const restingSlots = resting.reduce((sum, c) => sum + c.size, 0);
  return {
    restingIds: resting.map((c) => c.id),
    consecutiveIds: resting.filter((c) => c.restedLastRound).map((c) => c.id),
    overshoot: Math.max(0, restingSlots - requiredSlots),
  };
}

// Bye history per entrant id, from rounds in play order. `byeIdsOf`
// returns one round's resting entrant ids.
export function byeHistory<R>(rounds: R[], byeIdsOf: (round: R) => string[]): Map<string, { count: number; lastRound: number }> {
  const history = new Map<string, { count: number; lastRound: number }>();
  rounds.forEach((round, index) => {
    for (const id of new Set(byeIdsOf(round))) {
      const entry = history.get(id) ?? { count: 0, lastRound: 0 };
      history.set(id, { count: entry.count + 1, lastRound: index + 1 });
    }
  });
  return history;
}

// --- Validation ------------------------------------------------------------
// Audits a sequence of rounds (in play order) for unfair bye scheduling:
//   - the same entrant on a bye in consecutive rounds, unless the round
//     records that it was unavoidable (CONSECUTIVE_BYE_NOTE);
//   - an entrant reaching 2 byes while another eligible entrant has none;
//   - an entrant reaching 3+ byes while another eligible entrant has 1 or
//     fewer.
// Each round lists who rested and who was eligible (resting + playing).
// `adjustments` are the per-entrant late-return normalisations (see
// Player.byeCountAdjustment) in force.
export interface ByeAuditRound {
  roundNumber: number;
  restingIds: string[];
  eligibleIds: string[];
  byeNote?: string;
}

export interface ByeAuditIssue {
  roundNumber: number;
  message: string;
}

export function auditByeFairness(
  rounds: ByeAuditRound[],
  adjustments: Map<string, number> = new Map(),
  nameOf: (id: string) => string = (id) => id,
): ByeAuditIssue[] {
  const issues: ByeAuditIssue[] = [];
  const counts = new Map<string, number>();
  let previousResting = new Set<string>();
  for (const round of rounds) {
    const push = (message: string) => issues.push({ roundNumber: round.roundNumber, message: `Round ${round.roundNumber}: ${message}` });
    if (round.byeNote !== CONSECUTIVE_BYE_NOTE) {
      for (const id of round.restingIds) {
        if (previousResting.has(id)) push(`${nameOf(id)} has a bye in consecutive rounds.`);
      }
    }
    for (const id of new Set(round.restingIds)) counts.set(id, (counts.get(id) ?? 0) + 1);
    const effective = (id: string) => (counts.get(id) ?? 0) + (adjustments.get(id) ?? 0);
    const eligible = [...new Set(round.eligibleIds)];
    if (eligible.length > 0) {
      const min = Math.min(...eligible.map(effective));
      for (const id of round.restingIds) {
        const c = effective(id);
        if (c >= 2 && min === 0) push(`${nameOf(id)} has ${c} byes while another eligible player/team has none.`);
        else if (c >= 3 && min <= 1) push(`${nameOf(id)} has ${c} byes while another eligible player/team has ${min}.`);
      }
    }
    previousResting = new Set(round.restingIds);
  }
  return issues;
}
