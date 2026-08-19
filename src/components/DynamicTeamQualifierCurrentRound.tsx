import { useState, type FormEvent } from 'react';
import type { DynamicTeam, DynamicTeamQualifierStage, QualifyingMatch, QualifyingRound, RestAssignment } from '../types';
import { calculateProvisionalStandings } from '../utils/dynamicTeamQualifier';

interface DynamicTeamQualifierCurrentRoundProps {
  teams: DynamicTeam[];
  rounds: QualifyingRound[];
  restAssignments: RestAssignment[];
  qualifyingRounds: number;
  stage: DynamicTeamQualifierStage;
  onSetScore: (matchId: string, result: { scoreA?: number; scoreB?: number; winnerId?: string; goldenPoint?: boolean; forfeit?: boolean }) => void;
  onCloseRound: () => void;
  onGenerateNextRound: () => { ok: true } | { ok: false; reason: string };
  onGenerateMedalBracket: () => void;
  onViewAllRounds: () => void;
}

// The live/active Dynamic Team Qualifier round, plus the Director Dashboard
// summary (current round, active courts, missing scores, resting teams,
// warnings, current standings, and the Close Round / Generate Next Round /
// View All Rounds / Generate Medal Bracket actions — see README's "Director
// dashboard") — folded into one screen rather than a separate tab, since
// the dashboard's whole job is to summarise and act on exactly this round.
export function DynamicTeamQualifierCurrentRound({
  teams,
  rounds,
  restAssignments,
  qualifyingRounds,
  stage,
  onSetScore,
  onCloseRound,
  onGenerateNextRound,
  onGenerateMedalBracket,
  onViewAllRounds,
}: DynamicTeamQualifierCurrentRoundProps) {
  const [warning, setWarning] = useState<string | null>(null);

  const currentRound = rounds.find((r) => r.status === 'current');
  // A round the organiser has closed (all scores in) but hasn't generated
  // the next round from yet — shown read-only with "Generate Next Round"
  // still available, see useDynamicTeamQualifier.closeCurrentRound.
  const closedRound = rounds.find((r) => r.status === 'completed');
  const displayRound = currentRound ?? closedRound;

  const teamById = new Map(teams.map((t) => [t.id, t]));
  function teamLabel(id: string): string {
    const team = teamById.get(id);
    return team ? `${team.teamCode} ${team.displayName}` : 'Unknown team';
  }

  const activeTeamIds = teams.filter((t) => t.checkedIn && !t.withdrawn).map((t) => t.id);
  const reachedRounds = rounds.filter((r) => r.status !== 'upcoming');
  const reachedMatches = reachedRounds.flatMap((r) => r.matches);
  const reachedRoundNumbers = new Set(reachedRounds.map((r) => r.roundNumber));
  const reachedRests = restAssignments.filter((a) => reachedRoundNumbers.has(a.roundNumber));
  const standingsPreview = calculateProvisionalStandings(activeTeamIds, reachedMatches, reachedRests).slice(0, 6);

  const missingScores = displayRound ? displayRound.matches.filter((m) => m.status !== 'completed').length : 0;

  function handleGenerateNext() {
    const result = onGenerateNextRound();
    setWarning(result.ok ? null : result.reason);
  }

  function handleCloseRound() {
    setWarning(null);
    onCloseRound();
  }

  return (
    <>
      <section className="card dtq-dashboard">
        <h2>Director Dashboard</h2>
        <div className="dtq-dashboard-grid">
          <div className="dtq-dashboard-stat">
            <span className="dtq-dashboard-label">Round</span>
            <span className="dtq-dashboard-value">{displayRound ? `${displayRound.roundNumber} of ${qualifyingRounds}` : '—'}</span>
          </div>
          <div className="dtq-dashboard-stat">
            <span className="dtq-dashboard-label">Active courts</span>
            <span className="dtq-dashboard-value">{displayRound?.matches.length ?? 0}</span>
          </div>
          <div className="dtq-dashboard-stat">
            <span className="dtq-dashboard-label">Missing scores</span>
            <span className="dtq-dashboard-value">{missingScores}</span>
          </div>
          <div className="dtq-dashboard-stat">
            <span className="dtq-dashboard-label">Resting teams</span>
            <span className="dtq-dashboard-value">{displayRound?.restingTeamIds.length ?? 0}</span>
          </div>
        </div>

        {warning && <p className="hint error">{warning}</p>}

        <div className="form-actions">
          {currentRound && (
            <button type="button" className="cta-button" onClick={handleCloseRound} disabled={missingScores > 0}>
              Close Round {currentRound.roundNumber}
            </button>
          )}
          {closedRound && (
            <button type="button" className="cta-button start-button" onClick={handleGenerateNext}>
              Generate Next Round
            </button>
          )}
          {stage === 'final-standings' && (
            <button type="button" className="cta-button start-button" onClick={onGenerateMedalBracket}>
              Generate Medal Bracket
            </button>
          )}
          <button type="button" className="secondary" onClick={onViewAllRounds}>
            View All Rounds
          </button>
        </div>

        <h3>Current Standings</h3>
        {standingsPreview.length === 0 ? (
          <p className="empty-state">No results yet.</p>
        ) : (
          <div className="leaderboard-scroll">
            <table className="leaderboard-table stats-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>Wins</th>
                  <th>Losses</th>
                  <th>Win %</th>
                </tr>
              </thead>
              <tbody>
                {standingsPreview.map((standing) => (
                  <tr key={standing.teamId} className={standing.rank === 1 ? 'leaderboard-top' : undefined}>
                    <td>{standing.rank}</td>
                    <td>{teamLabel(standing.teamId)}</td>
                    <td>{standing.wins}</td>
                    <td>{standing.losses}</td>
                    <td>{(standing.winPercentage * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!displayRound && stage === 'final-standings' && (
        <section className="card">
          <p className="empty-state">Qualifying is complete — review Final Standings, then generate the Medal Bracket when ready.</p>
        </section>
      )}

      {displayRound && (
        <section className="card">
          <div className="section-heading-row">
            <h2>
              {currentRound ? `Current Round — Round ${displayRound.roundNumber}` : `Round ${displayRound.roundNumber} — awaiting next round`}
            </h2>
          </div>
          {!currentRound && closedRound && (
            <p className="hint">Every result is in — click "Generate Next Round" above to continue.</p>
          )}
          <div className="match-list">
            {displayRound.matches.map((match) => (
              <DynamicTeamMatchCard
                key={match.id}
                match={match}
                teamALabel={teamLabel(match.teamAId)}
                teamBLabel={teamLabel(match.teamBId)}
                onSetScore={(result) => onSetScore(match.id, result)}
              />
            ))}
          </div>
        </section>
      )}

      {displayRound && (
        <section className="card">
          <h2>Resting This Round</h2>
          {displayRound.restingTeamIds.length === 0 ? (
            <p className="empty-state">Every checked-in team is playing this round.</p>
          ) : (
            <ul className="bye-list">
              {displayRound.restingTeamIds.map((id) => (
                <li key={id} className="bye-chip">
                  {teamLabel(id)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

interface DynamicTeamMatchCardProps {
  match: QualifyingMatch;
  teamALabel: string;
  teamBLabel: string;
  onSetScore: (result: { scoreA?: number; scoreB?: number; winnerId?: string; goldenPoint?: boolean; forfeit?: boolean }) => void;
}

// Score entry for one court's match — team-vs-team (not player-vs-player)
// scores, a Golden Point flag (the organiser enters the final score
// directly, e.g. "9-8"; this is a record-keeping marker, not an automatic
// score transformer — see README's "Golden point rule"), and a Forfeit
// toggle that swaps score inputs for a plain winner pick.
function DynamicTeamMatchCard({ match, teamALabel, teamBLabel, onSetScore }: DynamicTeamMatchCardProps) {
  const [scoreA, setScoreA] = useState(match.scoreA != null ? String(match.scoreA) : '');
  const [scoreB, setScoreB] = useState(match.scoreB != null ? String(match.scoreB) : '');
  const [goldenPoint, setGoldenPoint] = useState(match.goldenPoint);
  const [forfeit, setForfeit] = useState(match.forfeit);
  const [forfeitWinner, setForfeitWinner] = useState<'A' | 'B'>(match.winnerId === match.teamBId ? 'B' : 'A');
  const [error, setError] = useState<string | null>(null);
  const locked = match.status === 'completed';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (forfeit) {
      setError(null);
      onSetScore({ forfeit: true, winnerId: forfeitWinner === 'A' ? match.teamAId : match.teamBId });
      return;
    }
    const parsedA = Number(scoreA);
    const parsedB = Number(scoreB);
    if (scoreA.trim() === '' || scoreB.trim() === '' || Number.isNaN(parsedA) || Number.isNaN(parsedB)) {
      setError('Enter a valid score for both teams.');
      return;
    }
    if (parsedA < 0 || parsedB < 0) {
      setError('Scores cannot be negative.');
      return;
    }
    if (parsedA === parsedB) {
      setError('Scores cannot be tied — if this went to a golden point, enter the final score including it (e.g. 9-8).');
      return;
    }
    setError(null);
    onSetScore({ scoreA: parsedA, scoreB: parsedB, goldenPoint });
  }

  return (
    <form className="match-card" onSubmit={handleSubmit}>
      <div className="match-header">Court {match.courtNumber}</div>
      {forfeit && !locked ? (
        <div className="form-row">
          <span>Winner (forfeit)</span>
          <div className="toggle-group" role="group" aria-label="Forfeit winner">
            <button type="button" className={forfeitWinner === 'A' ? 'toggle-option active' : 'toggle-option'} onClick={() => setForfeitWinner('A')}>
              {teamALabel}
            </button>
            <button type="button" className={forfeitWinner === 'B' ? 'toggle-option active' : 'toggle-option'} onClick={() => setForfeitWinner('B')}>
              {teamBLabel}
            </button>
          </div>
        </div>
      ) : (
        <div className="match-teams">
          <div className={match.winnerId === match.teamAId ? 'match-team winner' : 'match-team'}>
            <span className="match-team-name">{teamALabel}</span>
            <input type="number" min={0} value={scoreA} onChange={(event) => setScoreA(event.target.value)} aria-label={`${teamALabel} score`} disabled={locked} />
          </div>
          <div className="match-vs">vs</div>
          <div className={match.winnerId === match.teamBId ? 'match-team winner' : 'match-team'}>
            <span className="match-team-name">{teamBLabel}</span>
            <input type="number" min={0} value={scoreB} onChange={(event) => setScoreB(event.target.value)} aria-label={`${teamBLabel} score`} disabled={locked} />
          </div>
        </div>
      )}

      {!locked && !forfeit && (
        <label className="dp-placeholder-toggle">
          <input type="checkbox" checked={goldenPoint} onChange={(event) => setGoldenPoint(event.target.checked)} />
          Golden point
        </label>
      )}
      {!locked && (
        <label className="dp-placeholder-toggle">
          <input
            type="checkbox"
            checked={forfeit}
            onChange={(event) => {
              setForfeit(event.target.checked);
              setError(null);
            }}
          />
          Forfeit
        </label>
      )}

      {error && <p className="hint error">{error}</p>}
      {locked && match.winnerId && (
        <p className="hint winner-hint">
          Winner: {match.winnerId === match.teamAId ? teamALabel : teamBLabel}
          {match.goldenPoint && ' · Golden point'}
          {match.forfeit && ' · Forfeit'}
        </p>
      )}

      {!locked && (
        <button type="submit" className="secondary">
          Save Result
        </button>
      )}
    </form>
  );
}
