import type { KingCourtCycle, Player, RoundStatus } from '../types';
import { getKingCourtGameStatus, getKingCourtGameWinner } from '../utils/kingCourt';

interface KingCourtAllRoundsViewProps {
  players: Player[];
  cycles: KingCourtCycle[];
}

const STATUS_LABEL: Record<RoundStatus, string> = {
  current: 'Current',
  upcoming: 'Upcoming',
  completed: 'Completed',
};

// Read-only record of every King Court game generated so far, grouped by
// cycle — the King Court equivalent of AllRoundsView. Future cycles are
// never pre-generated (see generateNextKingCourtCycle, only ever called
// from startCycle1/confirmMovementAndAdvance in useKingCourt), so this
// naturally only ever shows what's actually been seeded/played; Cycle 2
// simply appears here once movement off Cycle 1 is confirmed. Score entry
// only ever happens on Current Round — this view never lets you edit a
// score, even for the current game.
export function KingCourtAllRoundsView({ players, cycles }: KingCourtAllRoundsViewProps) {
  if (cycles.length === 0) {
    return (
      <section className="card">
        <h2>All Rounds</h2>
        <p className="empty-state">No games yet — seed courts and start Cycle 1 to see the schedule here.</p>
      </section>
    );
  }

  const nameById = new Map(players.map((p) => [p.id, p.name]));

  function teamLabel(playerIds: string[]) {
    return playerIds.map((id) => nameById.get(id) ?? 'Unknown player').join(' & ');
  }

  return (
    <section className="card">
      <h2>All Rounds</h2>
      <div className="all-rounds-list">
        {cycles.map((cycle) => (
          <div key={cycle.cycleNumber} className="kc-all-rounds-cycle">
            <h3>Cycle {cycle.cycleNumber}</h3>
            <div className="all-rounds-list">
              {Array.from({ length: 5 }, (_, i) => i + 1).map((gameNumber) => {
                const status = getKingCourtGameStatus(cycle, gameNumber);
                const courts = [...cycle.courts].sort((a, b) => b.courtNumber - a.courtNumber);

                return (
                  <div key={gameNumber} className={`all-rounds-entry all-rounds-entry-${status}`}>
                    <div className="all-rounds-entry-heading">
                      <h4>Game {gameNumber}</h4>
                      <span className={`status-badge status-badge-${status}`}>{STATUS_LABEL[status]}</span>
                    </div>
                    <ul className="all-rounds-matches">
                      {courts.map((court) => {
                        const game = court.games.find((g) => g.gameNumber === gameNumber);
                        if (!game) return null;
                        const winner = getKingCourtGameWinner(game);
                        const hasScore = game.team1Score != null && game.team2Score != null;
                        const team1Label = teamLabel(game.team1PlayerIds);
                        const team2Label = teamLabel(game.team2PlayerIds);

                        return (
                          <li key={court.courtNumber} className="all-rounds-match">
                            <span>
                              Court {court.courtNumber}: {team1Label} vs {team2Label}, Rest:{' '}
                              {nameById.get(game.restingPlayerId) ?? 'Unknown player'}
                            </span>
                            {hasScore && (
                              <span className="all-rounds-score">
                                {game.team1Score}–{game.team2Score}
                                {winner && ` · Winner: ${winner === 1 ? team1Label : team2Label}`}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
