import type { KnockoutBracket, Pool, Team } from '../types';
import { isKnockoutComplete } from '../utils/poolsKnockout';
import { KnockoutBracketView } from './KnockoutBracketView';
import { PoolLeaderboard } from './PoolLeaderboard';

interface FinalResultsProps {
  teams: Team[];
  pools: Pool[];
  bracket: KnockoutBracket | null;
  teamsAdvancingPerPool: number;
}

// Champion / Runner-up / 3rd / 4th, plus a full pool and knockout summary,
// shown once the knockout bracket (Final + 3rd Place Match, if any) is
// complete. Before that, a friendly in-progress message instead — this is
// the "results" tab for Pools & Knockout, so it needs to render at every
// stage, not just once the tournament is actually over.
export function FinalResults({ teams, pools, bracket, teamsAdvancingPerPool }: FinalResultsProps) {
  const complete = bracket != null && isKnockoutComplete(bracket);

  if (!complete) {
    return (
      <section className="card">
        <h2>Final Results</h2>
        <p className="empty-state">
          {bracket
            ? 'Complete the knockout bracket to see final results.'
            : 'Complete the pool stage and advance to the knockout bracket to see final results.'}
        </p>
      </section>
    );
  }

  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  const placements = [
    { label: 'Champion', teamId: bracket.champion },
    { label: 'Runner-up', teamId: bracket.runnerUp },
    { label: '3rd Place', teamId: bracket.thirdPlace },
    { label: '4th Place', teamId: bracket.fourthPlace },
  ].filter((placement): placement is { label: string; teamId: string } => placement.teamId != null);

  return (
    <>
      <section className="card">
        <h2>Final Results</h2>
        <div className="final-placements">
          {placements.map((placement) => (
            <div
              key={placement.label}
              className={placement.label === 'Champion' ? 'final-placement final-placement-champion' : 'final-placement'}
            >
              <span className="final-placement-label">{placement.label}</span>
              <span className="final-placement-team">{teamNameById.get(placement.teamId) ?? 'Unknown team'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Pool Results</h3>
        {pools.map((pool) => (
          <PoolLeaderboard key={pool.id} pool={pool} teams={teams} teamsAdvancingPerPool={teamsAdvancingPerPool} poolComplete />
        ))}
      </section>

      <div>
        <h3 className="final-results-heading">Knockout Results</h3>
        <KnockoutBracketView bracket={bracket} teams={teams} />
      </div>
    </>
  );
}
