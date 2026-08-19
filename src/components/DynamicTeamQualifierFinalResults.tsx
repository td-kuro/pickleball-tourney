import type { DynamicTeam, MedalBracket } from '../types';
import { isMedalBracketComplete } from '../utils/dynamicTeamQualifier';

interface DynamicTeamQualifierFinalResultsProps {
  bracket: MedalBracket | null;
  teams: DynamicTeam[];
}

// Champion / Runner-up / 3rd / 4th, shown once the medal bracket (Gold and
// Bronze matches) is complete — mirrors FinalResults.tsx's shape for Pools
// & Knockout. Before that, a friendly in-progress message instead, since
// this is the "Final Results" tab and needs to render at every stage, not
// just once the tournament is actually over.
export function DynamicTeamQualifierFinalResults({ bracket, teams }: DynamicTeamQualifierFinalResultsProps) {
  const complete = bracket != null && isMedalBracketComplete(bracket);

  if (!complete) {
    return (
      <section className="card">
        <h2>Final Results</h2>
        <p className="empty-state">
          {bracket ? 'Complete the Gold and Bronze matches to see final results.' : 'Complete qualifying and the medal bracket to see final results.'}
        </p>
      </section>
    );
  }

  const teamById = new Map(teams.map((t) => [t.id, t]));
  function teamLabel(id?: string): string {
    if (!id) return 'Unknown team';
    const team = teamById.get(id);
    return team ? `${team.teamCode} ${team.displayName}` : 'Unknown team';
  }

  const placements = [
    { label: 'Champion', teamId: bracket.champion },
    { label: 'Runner-up', teamId: bracket.runnerUp },
    { label: '3rd Place', teamId: bracket.thirdPlace },
    { label: '4th Place', teamId: bracket.fourthPlace },
  ].filter((placement): placement is { label: string; teamId: string } => placement.teamId != null);

  return (
    <section className="card">
      <h2>Final Results</h2>
      <div className="final-placements">
        {placements.map((placement) => (
          <div key={placement.label} className={placement.label === 'Champion' ? 'final-placement final-placement-champion' : 'final-placement'}>
            <span className="final-placement-label">{placement.label}</span>
            <span className="final-placement-team">{teamLabel(placement.teamId)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
