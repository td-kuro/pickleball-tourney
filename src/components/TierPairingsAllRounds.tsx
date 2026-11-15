import { useMemo } from 'react';
import type { TierPlayer, TierRound, TierScoreMode } from '../types';
import { describeResult, type ResultInput } from '../utils/tierLeaderboard';
import type { TierResult } from '../utils/tierSession';
import { TierCourtCard, TierPill } from './TierCourtCard';
import { TierResultEntry } from './TierResultEntry';

interface TierPairingsAllRoundsProps {
  rounds: TierRound[];
  players: TierPlayer[];
  scoreMode: TierScoreMode;
  ended: boolean;
  onRecordResult: (roundId: string, matchId: string, input: ResultInput, correction: boolean) => TierResult;
  onClearResult: (roundId: string, matchId: string, correction: boolean) => TierResult;
}

// Every saved round, newest first: the open round exactly as Current Round
// shows it, completed rounds as played (tiers as they were then). Reads the
// same saved rounds array — never a separately generated display copy.
export function TierPairingsAllRounds({ rounds, players, scoreMode, ended, onRecordResult, onClearResult }: TierPairingsAllRoundsProps) {
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = (id: string) => playersById.get(id)?.name ?? 'Unknown';
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
                  <TierCourtCard
                    key={match.id}
                    match={match}
                    playersById={playersById}
                    tierOf={tierOf}
                    compact
                    footer={
                      // Completed rounds: the result, with Correct Result
                      // (locked → explicit correction). The round in play is
                      // scored on Current Round; here it is shown only.
                      round.status === 'completed' && !ended && (scoreMode !== 'none' || match.result) ? (
                        <TierResultEntry
                          key={`${match.id}:${match.result?.recordedAt ?? 'none'}:${scoreMode}`}
                          match={match}
                          scoreMode={scoreMode}
                          nameOf={nameOf}
                          locked
                          onRecord={(input, correction) => onRecordResult(round.id, match.id, input, correction)}
                          onClear={(correction) => onClearResult(round.id, match.id, correction)}
                        />
                      ) : match.result || (round.status === 'completed' && scoreMode !== 'none') ? (
                        <p className={match.result ? 'tier-result tier-result-recorded' : 'tier-result tier-result-missing'}>
                          {match.result ? describeResult(match, nameOf) : 'No result recorded'}
                        </p>
                      ) : undefined
                    }
                  />
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
