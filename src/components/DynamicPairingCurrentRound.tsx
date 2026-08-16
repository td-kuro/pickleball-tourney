import { useState, type FormEvent } from 'react';
import type { DynamicPairingCourtAssignment, DynamicPairingRound, Player } from '../types';
import { isDynamicPairingRoundComplete, nextRoundButtonLabel, roundPhaseLabel } from '../utils/dynamicPairingSocial';

interface DynamicPairingCurrentRoundProps {
  round: DynamicPairingRound | undefined;
  rounds: DynamicPairingRound[];
  players: Player[];
  onSetScore: (courtNumber: number, score1: number, score2: number) => void;
  onGenerateNextRound: () => void;
}

// The live/active Dynamic Pairing Social round — mirrors CurrentRoundView's
// shape (court cards with score entry, a sitting-out list, a gate on
// advancing to the next round) but works off DynamicPairingRound/
// DynamicPairingCourtAssignment instead of Round/Match, since scores here
// apply to a court (2 fixed teams for the round) rather than an arbitrary
// MatchSide. `rounds` (the full history, including any pre-generated
// 'upcoming' rounds) is only needed to compute nextRoundButtonLabel — see
// that function for why the button's label/behaviour varies.
export function DynamicPairingCurrentRound({ round, rounds, players, onSetScore, onGenerateNextRound }: DynamicPairingCurrentRoundProps) {
  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const allScored = round ? isDynamicPairingRoundComplete(round) : false;

  function teamLabel(playerIds: string[]) {
    return playerIds.map((id) => playerNameById.get(id) ?? 'Unknown player').join(' & ');
  }

  return (
    <>
      <section className="card">
        <div className="section-heading-row">
          <div>
            <h2>{round ? `Current Round — Round ${round.roundNumber}` : 'Current Round'}</h2>
            {round && (
              <span className={round.phase === 'grading' ? 'mode-badge tournament' : 'mode-badge social'}>
                {roundPhaseLabel(round.phase)}
              </span>
            )}
          </div>
          {round && (
            <button type="button" className="cta-button" onClick={onGenerateNextRound} disabled={!allScored}>
              {nextRoundButtonLabel(round, rounds)}
            </button>
          )}
        </div>
        {round && !allScored && (
          <p className="hint error">Enter scores for every court before generating the next round.</p>
        )}

        {!round && <p className="empty-state">No round generated yet.</p>}

        {round && (
          <div className="match-list">
            {round.courts.map((court) => (
              <DynamicPairingCourtCard
                // Keyed by round + court, not just court number: court
                // numbers repeat every round (Court 1 always exists), so a
                // court-number-only key would make React reuse the same
                // component instance across rounds instead of remounting
                // it — and since score1/score2 are local state seeded only
                // on mount, the previous round's scores would stay showing
                // in the new round's (blank) inputs.
                key={`${round.id}-${court.courtNumber}`}
                court={court}
                team1Label={teamLabel(court.team1PlayerIds)}
                team2Label={teamLabel(court.team2PlayerIds)}
                onSetScore={(score1, score2) => onSetScore(court.courtNumber, score1, score2)}
              />
            ))}
          </div>
        )}
      </section>

      {round && (
        <section className="card">
          <h2>Resting This Round</h2>
          {round.restingPlayerIds.length === 0 ? (
            <p className="empty-state">Everyone available is playing this round.</p>
          ) : (
            <ul className="bye-list">
              {round.restingPlayerIds.map((id) => (
                <li key={id} className="bye-chip">
                  {playerNameById.get(id) ?? 'Unknown player'}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

interface DynamicPairingCourtCardProps {
  court: DynamicPairingCourtAssignment;
  team1Label: string;
  team2Label: string;
  onSetScore: (score1: number, score2: number) => void;
}

function DynamicPairingCourtCard({ court, team1Label, team2Label, onSetScore }: DynamicPairingCourtCardProps) {
  const [score1, setScore1] = useState(court.score1 != null ? String(court.score1) : '');
  const [score2, setScore2] = useState(court.score2 != null ? String(court.score2) : '');
  const [error, setError] = useState<string | null>(null);
  const locked = court.status === 'completed';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed1 = Number(score1);
    const parsed2 = Number(score2);
    if (score1.trim() === '' || score2.trim() === '' || Number.isNaN(parsed1) || Number.isNaN(parsed2)) {
      setError('Enter a valid score for both teams.');
      return;
    }
    if (parsed1 < 0 || parsed2 < 0) {
      setError('Scores cannot be negative.');
      return;
    }
    if (parsed1 === parsed2) {
      setError('Scores cannot be tied — one team must win.');
      return;
    }
    setError(null);
    onSetScore(parsed1, parsed2);
  }

  return (
    <form className="match-card" onSubmit={handleSubmit}>
      <div className="match-header">Court {court.courtNumber}</div>
      <div className="match-teams">
        <div className={court.winnerTeam === 1 ? 'match-team winner' : 'match-team'}>
          <span className="match-team-name">{team1Label}</span>
          <input
            type="number"
            min={0}
            value={score1}
            onChange={(event) => setScore1(event.target.value)}
            aria-label={`${team1Label} score`}
            disabled={locked}
          />
        </div>
        <div className="match-vs">vs</div>
        <div className={court.winnerTeam === 2 ? 'match-team winner' : 'match-team'}>
          <span className="match-team-name">{team2Label}</span>
          <input
            type="number"
            min={0}
            value={score2}
            onChange={(event) => setScore2(event.target.value)}
            aria-label={`${team2Label} score`}
            disabled={locked}
          />
        </div>
      </div>

      {error && <p className="hint error">{error}</p>}
      {court.winnerTeam && (
        <p className="hint winner-hint">Winner: {court.winnerTeam === 1 ? team1Label : team2Label}</p>
      )}

      {!locked && (
        <button type="submit" className="secondary">
          Save Score
        </button>
      )}
    </form>
  );
}
