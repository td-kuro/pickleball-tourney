// Tier-Based Pairings — results and leaderboard (pure). Results live on
// each match (TierMatch.result); every number here is derived from them, so
// editing or clearing a result can never double-count. Nothing in this file
// is read by the pairing engine: scoring decides standings, never pairings.
import type { TierFinalStandings, TierMatch, TierMatchResult, TierPlayer, TierRound, TierScoreMode, TierStanding } from '../types';

export const MAX_GAME_SCORE = 99;

export type ResultInput = { winner: 'A' | 'B' } | { scoreA: number; scoreB: number };

export type ResultCheck = { ok: true; result: Omit<TierMatchResult, 'recordedAt'> } | { ok: false; reason: string };

// Turns what the organiser entered into a result, under the session's
// score mode. Win/Loss never gets invented scores; Full Score needs two
// different whole numbers (a tie cannot pick a winner).
export function buildTierResult(mode: TierScoreMode, input: ResultInput): ResultCheck {
  if (mode === 'none') return { ok: false, reason: 'This session is set to No Scoring.' };
  if (mode === 'win-loss-only') {
    if (!('winner' in input) || (input.winner !== 'A' && input.winner !== 'B')) return { ok: false, reason: 'Pick the winning side.' };
    return { ok: true, result: { recordingMode: 'win-loss-only', winner: input.winner } };
  }
  if (!('scoreA' in input)) return { ok: false, reason: 'Enter a score for both teams.' };
  const { scoreA, scoreB } = input;
  for (const s of [scoreA, scoreB]) {
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0) return { ok: false, reason: 'Scores must be whole numbers of 0 or more.' };
    if (s > MAX_GAME_SCORE) return { ok: false, reason: `Scores above ${MAX_GAME_SCORE} aren't allowed.` };
  }
  if (scoreA === scoreB) return { ok: false, reason: 'A tied score has no winner — check the score.' };
  return { ok: true, result: { recordingMode: 'full-score', winner: scoreA > scoreB ? 'A' : 'B', scoreA, scoreB } };
}

export function sameResult(a: TierMatchResult | undefined, b: Omit<TierMatchResult, 'recordedAt'> | undefined): boolean {
  if (!a || !b) return a === b;
  return a.recordingMode === b.recordingMode && a.winner === b.winner && a.scoreA === b.scoreA && a.scoreB === b.scoreB;
}

export function describeResult(match: TierMatch, nameOf: (id: string) => string): string {
  const r = match.result;
  if (!r) return 'No result';
  const team = (ids: readonly string[]) => ids.map(nameOf).join(' / ');
  const winners = team(r.winner === 'A' ? match.teamAPlayerIds : match.teamBPlayerIds);
  if (r.recordingMode === 'full-score' && r.scoreA !== undefined && r.scoreB !== undefined) {
    const [w, l] = r.winner === 'A' ? [r.scoreA, r.scoreB] : [r.scoreB, r.scoreA];
    return `${winners} won ${w}–${l}`;
  }
  return `${winners} won`;
}

// Rounds whose recorded results count: completed rounds plus the round in
// play (a recorded result is a fact as soon as it is entered). Drafts
// haven't been played, so they never have results.
export function resultRounds(rounds: TierRound[]): TierRound[] {
  return rounds.filter((r) => r.status === 'completed' || r.status === 'active');
}

export function unrecordedMatchCount(rounds: TierRound[]): number {
  return resultRounds(rounds).reduce((n, r) => n + r.matches.filter((m) => !m.result).length, 0);
}

interface Tally {
  gamesPlayed: number;
  recorded: number;
  wins: number;
  losses: number;
  pf: number;
  pa: number;
  allScored: boolean;
  sitOuts: number;
}

// Compares win percentages exactly (cross-multiplied, no floating error).
function compareWinPct(a: Tally, b: Tally): number {
  return b.wins * a.recorded - a.wins * b.recorded;
}

// Head-to-head between two players: wins each took in matches where they
// were on opposite sides. Only meaningful when they actually met.
function headToHead(rounds: TierRound[], x: string, y: string): number {
  let xWins = 0;
  let yWins = 0;
  for (const round of resultRounds(rounds)) {
    for (const m of round.matches) {
      if (!m.result) continue;
      const xSide = m.teamAPlayerIds.includes(x) ? 'A' : m.teamBPlayerIds.includes(x) ? 'B' : null;
      const ySide = m.teamAPlayerIds.includes(y) ? 'A' : m.teamBPlayerIds.includes(y) ? 'B' : null;
      if (!xSide || !ySide || xSide === ySide) continue;
      if (m.result.winner === xSide) xWins++;
      else yWins++;
    }
  }
  return yWins - xWins; // negative: x ahead
}

// The leaderboard. Ranking (players with at least one recorded result):
//   1. win percentage (games played vary, so this is the primary measure);
//   2. most wins;
//   3. point differential — only within a tie group where every player has
//      a full score for every recorded game (otherwise not comparable);
//   4. head-to-head — only for a two-player tie where they actually met;
//   5. otherwise the players share the rank (never broken at random).
// Players with no recorded result are listed unranked, never as 0%.
export function computeTierLeaderboard(players: TierPlayer[], rounds: TierRound[]): TierStanding[] {
  const tallies = new Map<string, Tally>();
  const get = (id: string) => {
    let t = tallies.get(id);
    if (!t) {
      t = { gamesPlayed: 0, recorded: 0, wins: 0, losses: 0, pf: 0, pa: 0, allScored: true, sitOuts: 0 };
      tallies.set(id, t);
    }
    return t;
  };
  for (const p of players) get(p.id);
  for (const round of resultRounds(rounds)) {
    // Sit-outs and games played count completed rounds only, matching the
    // participation stats elsewhere.
    if (round.status === 'completed') for (const id of round.restingPlayerIds) get(id).sitOuts++;
    for (const m of round.matches) {
      for (const side of ['A', 'B'] as const) {
        const ids = side === 'A' ? m.teamAPlayerIds : m.teamBPlayerIds;
        for (const id of ids) {
          const t = get(id);
          if (round.status === 'completed') t.gamesPlayed++;
          if (!m.result) continue;
          if (round.status === 'active') t.gamesPlayed++; // a recorded game in play counts as played
          t.recorded++;
          if (m.result.winner === side) t.wins++;
          else t.losses++;
          if (m.result.recordingMode === 'full-score' && m.result.scoreA !== undefined && m.result.scoreB !== undefined) {
            t.pf += side === 'A' ? m.result.scoreA : m.result.scoreB;
            t.pa += side === 'A' ? m.result.scoreB : m.result.scoreA;
          } else {
            t.allScored = false;
          }
        }
      }
    }
  }

  const shown = players.filter((p) => !p.removed || (tallies.get(p.id)?.gamesPlayed ?? 0) > 0);
  const lines: TierStanding[] = shown.map((p) => {
    const t = tallies.get(p.id)!;
    const scored = t.recorded > 0 && t.allScored;
    return {
      playerId: p.id,
      name: p.name,
      tier: p.tier,
      gamesPlayed: t.gamesPlayed,
      recordedGames: t.recorded,
      wins: t.wins,
      losses: t.losses,
      winPct: t.recorded > 0 ? t.wins / t.recorded : null,
      ...(scored ? { pointsFor: t.pf, pointsAgainst: t.pa, pointDiff: t.pf - t.pa } : {}),
      sitOuts: t.sitOuts,
      rank: null,
    };
  });

  const ranked = lines.filter((l) => l.recordedGames > 0);
  const unranked = lines.filter((l) => l.recordedGames === 0).sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.name.localeCompare(b.name));
  const T = (l: TierStanding) => tallies.get(l.playerId)!;

  // Sort by the strict keys first, then resolve each group of equals.
  ranked.sort((a, b) => compareWinPct(T(a), T(b)) || b.wins - a.wins || a.name.localeCompare(b.name));
  const groups: TierStanding[][] = [];
  for (const l of ranked) {
    const last = groups[groups.length - 1];
    if (last && compareWinPct(T(last[0]), T(l)) === 0 && last[0].wins === l.wins) last.push(l);
    else groups.push([l]);
  }

  let position = 1;
  let prevGroupLead: TierStanding | null = null;
  const ordered: TierStanding[] = [];
  for (const group of groups) {
    const decidedByGroup: TierStanding['decidedBy'] =
      prevGroupLead === null ? undefined : compareWinPct(T(prevGroupLead), T(group[0])) !== 0 ? 'win-pct' : 'wins';
    // Sub-groups after the point-differential and head-to-head rules.
    let subgroups: TierStanding[][] = [group];
    let rule: TierStanding['decidedBy'] = 'tied';
    if (group.length > 1 && group.every((l) => l.pointDiff !== undefined)) {
      const sorted = [...group].sort((a, b) => b.pointDiff! - a.pointDiff!);
      subgroups = [];
      for (const l of sorted) {
        const last = subgroups[subgroups.length - 1];
        if (last && last[0].pointDiff === l.pointDiff) last.push(l);
        else subgroups.push([l]);
      }
      if (subgroups.length > 1) rule = 'point-diff';
    }
    subgroups = subgroups.flatMap((sg) => {
      if (sg.length !== 2) return [sg];
      const h = headToHead(rounds, sg[0].playerId, sg[1].playerId);
      if (h === 0) return [sg];
      rule = rule === 'tied' ? 'head-to-head' : rule;
      return h < 0 ? [[sg[0]], [sg[1]]] : [[sg[1]], [sg[0]]];
    });
    subgroups.forEach((sg, i) => {
      sg.sort((a, b) => a.name.localeCompare(b.name));
      for (const l of sg) {
        l.rank = position;
        l.decidedBy = sg.length > 1 ? 'tied' : i === 0 ? decidedByGroup : rule;
        ordered.push(l);
      }
      position += sg.length;
    });
    prevGroupLead = group[0];
  }
  return [...ordered, ...unranked];
}

export function tierWinnerIds(standings: TierStanding[]): string[] {
  return standings.filter((s) => s.rank === 1).map((s) => s.playerId);
}

export function buildFinalStandings(players: TierPlayer[], rounds: TierRound[], scoreMode: TierScoreMode, endedAt: number): TierFinalStandings {
  const standings = computeTierLeaderboard(players, rounds);
  const anyResult = standings.some((s) => s.rank !== null);
  return {
    endedAt,
    scoreMode,
    standings,
    winnerIds: scoreMode !== 'none' && anyResult ? tierWinnerIds(standings) : [],
    unrecordedMatches: scoreMode === 'none' ? 0 : unrecordedMatchCount(rounds),
  };
}
