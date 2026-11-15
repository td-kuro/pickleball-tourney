import type { TierFinalStandings, TierScoreMode, TierStanding } from '../types';
import { scoreModeLabel } from '../utils/tierSession';
import { TierPill } from './TierCourtCard';

interface TierPairingsLeaderboardProps {
  standings: TierStanding[];
  scoreMode: TierScoreMode;
  final?: TierFinalStandings;
  unrecordedMatches: number;
}

const DECIDED: Record<NonNullable<TierStanding['decidedBy']>, string> = {
  'win-pct': '',
  wins: 'more wins',
  'point-diff': 'point difference',
  'head-to-head': 'head-to-head',
  tied: 'tied',
};

function pct(p: number | null) {
  return p === null ? '—' : `${Math.round(p * 1000) / 10}%`;
}

function ordinal(n: number) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

// Session Leaderboard. While the session runs it shows live standings; once
// ended it shows the frozen final standings with the winner(s) and podium.
// Ranked by win % (games played differ in this format), then wins, then
// point difference (full scores only), then head-to-head; anything still
// level is a shared place — never decided at random.
export function TierPairingsLeaderboard({ standings, scoreMode, final, unrecordedMatches }: TierPairingsLeaderboardProps) {
  const rows = final?.standings ?? standings;
  const mode = final?.scoreMode ?? scoreMode;
  const ranked = rows.filter((r) => r.rank !== null);
  const unranked = rows.filter((r) => r.rank === null);
  const showPoints = ranked.some((r) => r.pointDiff !== undefined);
  const byId = new Map(rows.map((r) => [r.playerId, r]));
  const winners = final ? final.winnerIds.map((id) => byId.get(id)!).filter(Boolean) : [];
  const podium = [2, 3]
    .map((place) => ({ place, names: ranked.filter((r) => r.rank === place) }))
    .filter((p) => p.names.length > 0);
  const missing = final ? final.unrecordedMatches : unrecordedMatches;

  return (
    <>
      {final && (
        <section className="card tier-final">
          <h2>Final Results</h2>
          {mode === 'none' || winners.length === 0 ? (
            <p className="hint">
              {mode === 'none'
                ? 'This session used No Scoring, so there is no performance-based winner. Participation is below.'
                : 'No results were recorded, so there is no winner.'}
            </p>
          ) : (
            <>
              <div className="tier-winner-banner" role="status">
                <span className="tier-winner-title">{winners.length > 1 ? 'Joint Winners' : 'Winner'}</span>
                <span className="tier-winner-names">{winners.map((w) => w.name).join(' & ')}</span>
                <span className="hint">
                  {winners[0].wins}–{winners[0].losses} ({pct(winners[0].winPct)}) over {winners[0].recordedGames} recorded game
                  {winners[0].recordedGames === 1 ? '' : 's'}
                </span>
              </div>
              {podium.length > 0 && (
                <ul className="tier-podium">
                  {podium.map(({ place, names }) => (
                    <li key={place}>
                      <strong>{ordinal(place)}</strong> {names.map((n) => n.name).join(' & ')}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {missing > 0 && mode !== 'none' && (
            <p className="hint">
              {missing} match{missing === 1 ? ' was' : 'es were'} not recorded and {missing === 1 ? 'is' : 'are'} not counted.
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h2>{final ? 'Final Leaderboard' : 'Session Leaderboard'}</h2>
        <p className="hint">
          Scoring: {scoreModeLabel(mode)}.{' '}
          {mode === 'none'
            ? 'No results are recorded in this mode — showing participation.'
            : 'Ranked by win %, then wins, then point difference (full scores only), then head-to-head. Check games played when comparing — late arrivals play fewer.'}
          {!final && missing > 0 && mode !== 'none' && ` ${missing} played match${missing === 1 ? ' has' : 'es have'} no result yet.`}
        </p>
        <div className="tier-table-wrap">
          <table className="tier-stats-table tier-leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Tier</th>
                <th>Played</th>
                {mode !== 'none' || ranked.length > 0 ? (
                  <>
                    <th>W</th>
                    <th>L</th>
                    <th>Win %</th>
                  </>
                ) : null}
                {showPoints && (
                  <>
                    <th>PF</th>
                    <th>PA</th>
                    <th>+/−</th>
                  </>
                )}
                <th>Sat out</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.playerId} className={r.rank === 1 ? 'tier-leader' : undefined}>
                  <td>
                    {r.rank}
                    {r.decidedBy && DECIDED[r.decidedBy] && <span className="tier-decided">{DECIDED[r.decidedBy]}</span>}
                  </td>
                  <td>{r.name}</td>
                  <td>
                    <TierPill tier={r.tier} />
                  </td>
                  <td>{r.gamesPlayed}</td>
                  <td>{r.wins}</td>
                  <td>{r.losses}</td>
                  <td>{pct(r.winPct)}</td>
                  {showPoints && (
                    <>
                      <td>{r.pointsFor ?? '—'}</td>
                      <td>{r.pointsAgainst ?? '—'}</td>
                      <td>{r.pointDiff === undefined ? '—' : r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}</td>
                    </>
                  )}
                  <td>{r.sitOuts}</td>
                </tr>
              ))}
              {unranked.map((r) => (
                <tr key={r.playerId} className="tier-unranked">
                  <td>—</td>
                  <td>{r.name}</td>
                  <td>
                    <TierPill tier={r.tier} />
                  </td>
                  <td>{r.gamesPlayed}</td>
                  {(mode !== 'none' || ranked.length > 0) && (
                    <>
                      <td colSpan={3} className="hint">
                        {mode === 'none' ? '' : 'Unranked — no recorded result'}
                      </td>
                    </>
                  )}
                  {showPoints && <td colSpan={3} />}
                  <td>{r.sitOuts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
