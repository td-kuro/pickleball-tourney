import type { DynamicPairingCourtAssignment, DynamicPairingRound, DynamicPairingRoundStatus, Player } from '../types';
import { describeResult } from '../utils/results';
import {
  courtWinner,
  entrantIdsForSide,
  getMatchGenderType,
  matchGenderTypeLabel,
  rankingBasisLabel,
  roundPhaseLabel,
  roundStatusLabel,
  shouldUseGenderAwarePairing,
  visibleByeNote,
} from '../utils/dynamicPairingSocial';

const STATUS_CLASS: Record<DynamicPairingRoundStatus, string> = {
  upcoming: 'status-badge',
  current: 'status-badge status-badge-current',
  completed: 'status-badge status-badge-completed',
  locked: 'status-badge status-badge-completed',
  'pending-results': 'status-badge',
};

interface DynamicPairingAllRoundsProps {
  rounds: DynamicPairingRound[];
  players: Player[];
}

// Read-only history of every Dynamic Pairing Social round generated so
// far — same spirit as AllRoundsView, adapted for DynamicPairingRound's
// shape (courts instead of matches, a phase badge, resting players
// instead of byes). Includes future Dynamic Pairing rounds the game-lag
// look-ahead has already generated (status 'upcoming', courts/pairing
// basis already decided) as well as a trailing 'pending-results'
// placeholder — no courts yet, just a note on which round's results it's
// still waiting for — see extendDynamicPairingLookahead in
// utils/dynamicPairingSocial.ts.
function courtWinnerSide(court: DynamicPairingCourtAssignment): 'A' | 'B' | undefined {
  const winner = courtWinner(court);
  return winner === 1 ? 'A' : winner === 2 ? 'B' : undefined;
}

export function DynamicPairingAllRounds({ rounds, players }: DynamicPairingAllRoundsProps) {
  if (rounds.length === 0) {
    return (
      <section className="card">
        <h2>All Rounds</h2>
        <p className="empty-state">No rounds yet. Start matches to see the round schedule here.</p>
      </section>
    );
  }

  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const playersById = new Map(players.map((p) => [p.id, p]));

  function teamLabel(playerIds: string[]) {
    return playerIds.map((id) => playerNameById.get(id) ?? 'Unknown player').join(' & ');
  }

  function restLabel(ids: string[]) {
    return ids.map((id) => playerNameById.get(id) ?? 'Unknown player').join(', ');
  }

  // Mid-session Add Player: see AllRoundsView's identical helper.
  function joiningPlayerNames(roundNumber: number): string[] {
    return players.filter((p) => p.effectiveFromRound === roundNumber).map((p) => p.name);
  }

  // A side counts as a fixed team when it's backed by exactly one entrant
  // (see entrantIdsForSide) — two players sharing one entrant id, as
  // opposed to two individuals temporarily paired up.
  function sideBadge(court: DynamicPairingCourtAssignment, side: 1 | 2): string | null {
    if (court.team1PlayerIds.length !== 2 && court.team2PlayerIds.length !== 2) return null;
    return entrantIdsForSide(court, side).length === 1 ? 'Fixed Team' : 'Temporary Pair';
  }

  return (
    <section className="card">
      <h2>All Rounds</h2>
      <p className="hint">Saved schedule — Current Round plays these exact pairings.</p>
      <div className="all-rounds-list">
        {[...rounds]
          .sort((a, b) => a.roundNumber - b.roundNumber)
          .map((round) => (
            <div
              key={round.id}
              className={round.status === 'current' ? 'all-rounds-entry all-rounds-entry-current' : 'all-rounds-entry'}
            >
              <div className="all-rounds-entry-heading">
                <h3>Round {round.roundNumber}</h3>
                <span className={STATUS_CLASS[round.status]}>{roundStatusLabel(round.status)}</span>
                <span className="all-rounds-match-type">{roundPhaseLabel(round.phase)}</span>
              </div>
              {round.status === 'pending-results' ? (
                <p className="all-rounds-byes">Pairing basis: {rankingBasisLabel(round)}</p>
              ) : (
                <>
                  <ul className="all-rounds-matches">
                    {round.courts.map((court) => {
                      const team1Label = teamLabel(court.team1PlayerIds);
                      const team2Label = teamLabel(court.team2PlayerIds);
                      const badge1 = sideBadge(court, 1);
                      const badge2 = sideBadge(court, 2);
                      const result = describeResult(team1Label, team2Label, court.score1, court.score2, courtWinnerSide(court));
                      const genderType = getMatchGenderType(court.team1PlayerIds, court.team2PlayerIds, playersById);
                      return (
                        <li key={court.courtNumber} className="all-rounds-match">
                          <span>
                            Court {court.courtNumber}: {team1Label}
                            {badge1 && <span className="dp-side-badge"> ({badge1})</span>} vs {team2Label}
                            {badge2 && <span className="dp-side-badge"> ({badge2})</span>}
                            {genderType !== 'standard' && (
                              <span className="dp-side-badge dp-gender-match-badge"> {matchGenderTypeLabel(genderType)}</span>
                            )}
                          </span>
                          {result && <span className="all-rounds-score">{result}</span>}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="all-rounds-byes">Pairing basis: {rankingBasisLabel(round)}</p>
                  <p className="all-rounds-byes">
                    {round.restingPlayerIds.length > 0
                      ? `Resting: ${restLabel(round.restingPlayerIds)}`
                      : 'Everyone available played this round.'}
                  </p>
                  {visibleByeNote(round) && <p className="all-rounds-byes">Bye note: {visibleByeNote(round)}</p>}
                  {round.phase === 'grading' && (
                    <p className="all-rounds-byes">
                      Rotation note: {round.rotationNote ?? 'No repeat opponents.'}
                    </p>
                  )}
                  <p className="all-rounds-byes">
                    {shouldUseGenderAwarePairing(
                      round.courts.flatMap((c) => c.playerIds).map((id) => playersById.get(id)!).filter(Boolean),
                    )
                      ? 'Gender-aware pairing applied where possible.'
                      : 'Gender-aware pairing inactive: fewer than 2 female players.'}
                  </p>
                  {joiningPlayerNames(round.roundNumber).map((name) => (
                    <p key={name} className="all-rounds-byes">
                      Note: {name} joins from this round
                    </p>
                  ))}
                </>
              )}
            </div>
          ))}
      </div>
    </section>
  );
}
