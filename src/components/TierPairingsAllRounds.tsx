import { useMemo } from 'react';
import type { TierPlayer, TierRound } from '../types';
import { TierCourtCard, TierPill } from './TierCourtCard';

interface TierPairingsAllRoundsProps {
  rounds: TierRound[];
  players: TierPlayer[];
}

// Every saved round, newest first: the open round exactly as Current Round
// shows it, completed rounds as played (tiers as they were then). Reads the
// same saved rounds array — never a separately generated display copy.
export function TierPairingsAllRounds({ rounds, players }: TierPairingsAllRoundsProps) {
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const ordered = [...rounds].sort((a, b) => b.roundNumber - a.roundNumber);
  if (ordered.length === 0) {
    return (
      <section className="card">
        <h2>All Rounds</h2>
        <p className="empty-state">No rounds yet.</p>
      </section>
    );
  }
  return (
    <section className="card">
      <h2>All Rounds</h2>
      <div className="tier-all-rounds">
        {ordered.map((round) => {
          // The open round shows live tiers (what Current Round shows);
          // completed rounds show the tier each player had when it was played.
          const tierOf = (id: string) =>
            (round.status === 'completed' ? round.playerTiers[id] : playersById.get(id)?.tier) ?? round.playerTiers[id] ?? 'B';
          return (
            <div key={round.id} className="tier-round-block">
              <h3>
                Round {round.roundNumber}{' '}
                <span className={round.status === 'completed' ? 'mode-badge tournament' : 'mode-badge social'}>
                  {round.status === 'completed' ? 'Completed' : round.status === 'active' ? 'Current — in play' : 'Current — draft'}
                </span>
                {round.manuallyAdjusted && <span className="tier-round-flag">manual swaps</span>}
                {round.regenerationCount > 0 && <span className="tier-round-flag">regenerated {round.regenerationCount}×</span>}
              </h3>
              <div className="tier-court-grid compact">
                {round.matches.map((match) => (
                  <TierCourtCard key={match.id} match={match} playersById={playersById} tierOf={tierOf} compact />
                ))}
              </div>
              <p className="hint tier-round-resting">
                <strong>Sitting out:</strong>{' '}
                {round.restingPlayerIds.length === 0
                  ? 'nobody'
                  : round.restingPlayerIds.map((id, i) => (
                      <span key={id}>
                        {i > 0 && ', '}
                        {playersById.get(id)?.name ?? 'Unknown'} <TierPill tier={tierOf(id)} />
                      </span>
                    ))}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
