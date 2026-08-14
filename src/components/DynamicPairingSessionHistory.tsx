import type { DynamicPairingRound, DynamicPairingSettings } from '../types';
import { courtMovementLimitLabel, gameFormatLabel } from '../utils/dynamicPairingSocial';

interface DynamicPairingSessionHistoryProps {
  settings: DynamicPairingSettings;
  rounds: DynamicPairingRound[];
}

// A session-at-a-glance summary: the settings this session is running
// under, plus a compact round-by-round recap (see DynamicPairingAllRounds
// for the full court-by-court detail instead).
export function DynamicPairingSessionHistory({ settings, rounds }: DynamicPairingSessionHistoryProps) {
  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const gradingCount = sortedRounds.filter((r) => r.phase === 'grading').length;
  const rankingCount = sortedRounds.length - gradingCount;

  return (
    <>
      <section className="card">
        <h2>{settings.sessionName.trim() || 'Dynamic Pairing Social Session'}</h2>
        <p className="hint">
          {settings.numberOfCourts} court{settings.numberOfCourts === 1 ? '' : 's'} · {settings.gradingRounds}{' '}
          grading round{settings.gradingRounds === 1 ? '' : 's'} ·{' '}
          {settings.gameFormat === 'timed'
            ? `${gameFormatLabel('timed')}${settings.gameDurationMinutes ? ` (${settings.gameDurationMinutes} min)` : ''}`
            : `${gameFormatLabel('first-to-score')}${settings.winningScore ? ` (to ${settings.winningScore})` : ''}`}{' '}
          · Movement: {courtMovementLimitLabel(settings.maxCourtMovement)}
        </p>
        <p className="session-timing-summary">
          <strong>{sortedRounds.length}</strong> round{sortedRounds.length === 1 ? '' : 's'} played so far —{' '}
          {gradingCount} grading, {rankingCount} ranking.
        </p>
      </section>

      <section className="card">
        <h2>Round Summary</h2>
        {sortedRounds.length === 0 ? (
          <p className="empty-state">No rounds yet.</p>
        ) : (
          <div className="all-rounds-list">
            {sortedRounds.map((round) => (
              <div
                key={round.id}
                className={round.status === 'current' ? 'all-rounds-entry all-rounds-entry-current' : 'all-rounds-entry'}
              >
                <div className="all-rounds-entry-heading">
                  <h3>Round {round.roundNumber}</h3>
                  <span className="all-rounds-match-type">{round.phase === 'grading' ? 'Grading' : 'Ranking'}</span>
                </div>
                <p className="all-rounds-byes">
                  {round.courts.length} court{round.courts.length === 1 ? '' : 's'} ·{' '}
                  {round.courts.filter((c) => c.status === 'completed').length}/{round.courts.length} scored ·{' '}
                  {round.restingPlayerIds.length} resting
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
