import type { PlayerTier, TierPlayer, TierPlayerStats } from '../types';
import type { NewTierPlayer } from '../utils/tierSession';
import { TierPill } from './TierCourtCard';
import { TierAddPlayers, TierPlayerBoard } from './TierPairingsSetup';

interface TierPairingsPlayersProps {
  players: TierPlayer[];
  stats: Map<string, TierPlayerStats>;
  hasOpenRound: boolean;
  canGenerateNext: boolean;
  onGenerateNext: () => void;
  onAddPlayers: (entries: NewTierPlayer[]) => void;
  onSetTier: (id: string, tier: PlayerTier) => void;
  onSetAvailability: (id: string, available: boolean) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

// Live player management (tiers, availability, late arrivals) plus each
// player's participation and partner/opponent variety — counted from
// completed rounds only.
export function TierPairingsPlayers(props: TierPairingsPlayersProps) {
  const { players, stats } = props;
  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  const visible = players.filter((p) => !p.removed).sort((a, b) => a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name));
  return (
    <>
      <section className="card">
        <h2>Player Management</h2>
        <p className="hint">
          Tier and availability changes are saved straight away and used for the next generated round. Completed rounds
          and history are never changed. {props.hasOpenRound && 'To apply changes to the current draft round, use Regenerate Round.'}
        </p>
        {!props.hasOpenRound && props.canGenerateNext && (
          <button type="button" className="cta-button" onClick={props.onGenerateNext}>
            Generate Next Round
          </button>
        )}
        <TierAddPlayers onAddPlayers={props.onAddPlayers} started />
        <TierPlayerBoard
          players={players}
          stats={stats}
          onSetTier={props.onSetTier}
          onSetAvailability={props.onSetAvailability}
          onRename={props.onRename}
          onRemove={props.onRemove}
        />
      </section>

      <section className="card">
        <h2>Participation & Variety</h2>
        <p className="hint">Completed rounds only. Partners/opponents = how many different people they have played with/against.</p>
        <div className="tier-table-wrap">
          <table className="tier-stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Tier</th>
                <th>Played</th>
                <th>Sat out</th>
                <th>In a row</th>
                <th>Partners</th>
                <th>Opponents</th>
                <th>Most partnered</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const s = stats.get(p.id);
                const partners = Object.entries(s?.partnerHistory ?? {}).sort((a, b) => b[1] - a[1]);
                const top = partners[0];
                return (
                  <tr key={p.id} className={p.available ? undefined : 'unavailable'}>
                    <td>
                      {p.name}
                      {!p.available && <span className="tier-round-flag">out</span>}
                    </td>
                    <td>
                      <TierPill tier={p.tier} />
                    </td>
                    <td>{s?.roundsPlayed ?? 0}</td>
                    <td>{s?.roundsSatOut ?? 0}</td>
                    <td>{s?.consecutiveSitOuts ?? 0}</td>
                    <td>{partners.length}</td>
                    <td>{Object.keys(s?.opponentHistory ?? {}).length}</td>
                    <td>{top ? `${nameOf.get(top[0]) ?? '?'} ×${top[1]}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
