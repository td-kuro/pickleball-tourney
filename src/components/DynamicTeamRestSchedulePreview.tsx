import type { DynamicTeam, DynamicTeamQualifierSettings } from '../types';
import { lockRosterAndStartQualifying } from '../utils/dynamicTeamQualifier';

interface DynamicTeamRestSchedulePreviewProps {
  teams: DynamicTeam[];
  settings: DynamicTeamQualifierSettings;
  onRegenerate: () => void;
}

// A dry-run preview of exactly what "Start Qualifying" would produce right
// now, computed fresh on every render — lockRosterAndStartQualifying is a
// pure function, so calling it here speculatively (without persisting the
// result) is the exact same computation Start Qualifying will do, just not
// committed yet. Shows Round 1's real court pairings (that round's
// pairing doesn't depend on any results, so it's fully knowable in
// advance) plus every later round's resting teams from the rest schedule.
//
// This exists so "Regenerate" has something concrete to compare, rather
// than a bare seed number — the seed itself isn't meant to be read (see
// README), only reproducible; seeing the actual matchups/rest lists change
// is what makes "try a different schedule" tangible.
export function DynamicTeamRestSchedulePreview({ teams, settings, onRegenerate }: DynamicTeamRestSchedulePreviewProps) {
  const preview = lockRosterAndStartQualifying(teams, settings);

  const teamById = new Map(teams.map((t) => [t.id, t]));
  function teamLabel(id: string): string {
    const team = teamById.get(id);
    return team ? `${team.teamCode} ${team.displayName}` : 'Unknown team';
  }

  return (
    <section className="card">
      <div className="section-heading-row">
        <h2>Rest Schedule Preview</h2>
        <button type="button" className="secondary" onClick={onRegenerate}>
          Shuffle Preview
        </button>
      </div>

      {!preview.ok ? (
        <p className="hint error">{preview.reason}</p>
      ) : (
        <>
          <p className="hint">
            This is what Round 1 — and the rest schedule for every later round — would look like if you started
            qualifying right now. Nothing is committed until you click Start Qualifying below, so shuffle as many
            times as you want.
          </p>
          <div className="all-rounds-list">
            {preview.rounds.map((round) => (
              <div key={round.roundNumber} className="all-rounds-entry">
                <div className="all-rounds-entry-heading">
                  <h3>Round {round.roundNumber}</h3>
                  {round.roundNumber === 1 && <span className="all-rounds-match-type">Preview</span>}
                </div>
                {round.matches.length > 0 ? (
                  <ul className="all-rounds-matches">
                    {round.matches.map((match) => (
                      <li key={match.id} className="all-rounds-match">
                        <span>
                          Court {match.courtNumber}: {teamLabel(match.teamAId)} vs {teamLabel(match.teamBId)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">Pairings depend on results, so only who rests is knowable this far ahead.</p>
                )}
                <p className="all-rounds-byes">
                  {round.restingTeamIds.length > 0
                    ? `Resting: ${round.restingTeamIds.map((id) => teamLabel(id)).join(', ')}`
                    : 'No teams resting this round.'}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
