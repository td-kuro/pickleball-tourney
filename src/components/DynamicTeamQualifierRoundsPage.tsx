import { useState } from 'react';
import type { DynamicTeam, DynamicTeamQualifierStage, MedalBracket, QualifyingRound, RestAssignment, ScoreRecordingMode } from '../types';
import { canAddTeamMidSession } from '../utils/dynamicTeamQualifier';
import { DynamicTeamQualifierAllRounds } from './DynamicTeamQualifierAllRounds';
import { DynamicTeamQualifierCurrentRound } from './DynamicTeamQualifierCurrentRound';

type RoundsSubView = 'current' | 'all';

interface DynamicTeamQualifierRoundsPageProps {
  teams: DynamicTeam[];
  rounds: QualifyingRound[];
  restAssignments: RestAssignment[];
  medalBracket: MedalBracket | null;
  qualifyingRounds: number;
  stage: DynamicTeamQualifierStage;
  onSetScore: (matchId: string, result: { scoreA?: number; scoreB?: number; winnerId?: string; goldenPoint?: boolean; forfeit?: boolean }) => void;
  onCloseRound: () => void;
  onGenerateNextRound: () => { ok: true } | { ok: false; reason: string };
  onGenerateMedalBracket: () => void;
  scoreRecordingMode: ScoreRecordingMode;
  onSetTeamUnavailableForReview: (teamId: string, unavailable: boolean) => void;
}

// Parent for Dynamic Team Qualifier's "Rounds" tab — a Current Round / All
// Rounds toggle, mirroring DynamicPairingRoundsPage's shape.
export function DynamicTeamQualifierRoundsPage({
  teams,
  rounds,
  restAssignments,
  medalBracket,
  qualifyingRounds,
  stage,
  onSetScore,
  onCloseRound,
  onGenerateNextRound,
  onGenerateMedalBracket,
  scoreRecordingMode,
  onSetTeamUnavailableForReview,
}: DynamicTeamQualifierRoundsPageProps) {
  const activeTeams = teams.filter((t) => t.checkedIn && !t.withdrawn);
  const flaggedTeams = activeTeams.filter((t) => t.unavailableNeedsReview);
  // Rounds a flagged team is still scheduled in that haven't been played
  // yet — upcoming rounds (via the rest schedule's absence, since their
  // pairings aren't generated yet) and any unplayed match in the current
  // round. Surfaced, never changed — see setTeamUnavailableForReview.
  function affectedRoundNumbers(teamId: string): number[] {
    return rounds
      .filter((r) => r.status === 'upcoming' || r.status === 'current')
      .filter((r) => {
        if (r.status === 'current') {
          return r.matches.some((m) => m.status !== 'completed' && (m.teamAId === teamId || m.teamBId === teamId));
        }
        return !restAssignments.some((a) => a.roundNumber === r.roundNumber && a.teamId === teamId);
      })
      .map((r) => r.roundNumber);
  }
  const [subView, setSubView] = useState<RoundsSubView>('current');
  // Always false here — this page only ever renders once qualifying has
  // started (see App.tsx), so canAddTeamMidSession's stage check always
  // fails; surfaced anyway so the "why" is visible without the organiser
  // having to go looking for a disabled action that doesn't exist yet. See
  // that function's comment for why no add-mid-qualifying flow is built.
  const addTeamCheck = canAddTeamMidSession(stage);

  return (
    <>
      {!addTeamCheck.ok && (
        <section className="card">
          <h2>Session Controls</h2>
          <p className="hint error">{addTeamCheck.reason}</p>
        </section>
      )}

      {stage === 'qualifying' && (
        <section className="card">
          <h2>Team Availability</h2>
          <p className="hint">
            Dynamic Team Qualifier uses a locked team schedule. Future schedule requires director review — flagging a team
            here never changes any round automatically.
          </p>
          {flaggedTeams.length > 0 && (
            <div className="session-adjustment-notice">
              <div>
                {flaggedTeams.map((team) => {
                  const affected = affectedRoundNumbers(team.id);
                  return (
                    <p key={team.id} className="hint error">
                      {team.teamCode} {team.displayName} is unavailable — needs director review
                      {affected.length > 0 ? ` for Round${affected.length === 1 ? '' : 's'} ${affected.join(', ')}` : ''}.
                    </p>
                  );
                })}
              </div>
            </div>
          )}
          <div className="player-list">
            {activeTeams.map((team) => (
              <div key={team.id} className="player-row availability-row">
                <span className="player-row-name availability-row-name">
                  {team.teamCode} {team.displayName}
                </span>
                <span className={team.unavailableNeedsReview ? 'status-badge status-badge-danger' : 'status-badge'}>
                  {team.unavailableNeedsReview ? 'Unavailable — review' : 'Available'}
                </span>
                <div className="availability-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => onSetTeamUnavailableForReview(team.id, !team.unavailableNeedsReview)}
                  >
                    {team.unavailableNeedsReview ? 'Make available' : 'Flag unavailable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="rounds-subnav">
        <div className="toggle-group rounds-toggle" role="group" aria-label="Rounds view">
          <button type="button" className={subView === 'current' ? 'toggle-option active' : 'toggle-option'} onClick={() => setSubView('current')}>
            Current Round
          </button>
          <button type="button" className={subView === 'all' ? 'toggle-option active' : 'toggle-option'} onClick={() => setSubView('all')}>
            All Rounds
          </button>
        </div>
      </div>

      {subView === 'current' ? (
        <DynamicTeamQualifierCurrentRound
          teams={teams}
          rounds={rounds}
          restAssignments={restAssignments}
          qualifyingRounds={qualifyingRounds}
          stage={stage}
          onSetScore={onSetScore}
          scoreRecordingMode={scoreRecordingMode}
          onCloseRound={onCloseRound}
          onGenerateNextRound={onGenerateNextRound}
          onGenerateMedalBracket={onGenerateMedalBracket}
          onViewAllRounds={() => setSubView('all')}
        />
      ) : (
        <DynamicTeamQualifierAllRounds teams={teams} rounds={rounds} medalBracket={medalBracket} />
      )}
    </>
  );
}
