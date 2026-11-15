import type { ReactNode } from 'react';
import type { PlayerTier, TierMatch, TierPlayer } from '../types';
import { courtTierLabel, matchCourtLabel, matchPlayerIds, TIER_NAMES } from '../utils/tierPairings';

export function TierPill({ tier, long = false }: { tier: PlayerTier; long?: boolean }) {
  return (
    <span className={`tier-pill tier-pill-${tier.toLowerCase()}`} title={`${tier} – ${TIER_NAMES[tier]}`}>
      {long ? `${tier} · ${TIER_NAMES[tier]}` : tier}
    </span>
  );
}

interface TierCourtCardProps {
  match: TierMatch;
  playersById: Map<string, TierPlayer>;
  // Tier to show for each player: the live roster tier for the open round,
  // the snapshot taken when the round was played for completed rounds.
  tierOf: (id: string) => PlayerTier;
  // When given, names are buttons (Current Round swap flow).
  onPlayerClick?: (id: string) => void;
  selectedIds?: string[];
  compact?: boolean;
  invalid?: boolean;
  // Result entry / recorded result, shown under the teams.
  footer?: ReactNode;
  // Highlights a court still waiting for its result.
  needsResult?: boolean;
}

// One court: "Court 1 – Top / Inbetween", then team A vs team B with each
// player's tier beside their name. Used by Current Round (large, clickable)
// and All Rounds (compact, read-only) so both render the same saved match.
export function TierCourtCard({ match, playersById, tierOf, onPlayerClick, selectedIds = [], compact = false, invalid = false, footer, needsResult = false }: TierCourtCardProps) {
  const tiers = matchPlayerIds(match).map(tierOf);
  const side = tiers.includes('A') ? 'top' : tiers.includes('C') ? 'lower' : 'mid';
  const name = (id: string) => playersById.get(id)?.name ?? 'Unknown';

  function renderPlayer(id: string) {
    const tier = tierOf(id);
    const content = (
      <>
        <span className="tier-player-name">{name(id)}</span>
        <TierPill tier={tier} />
      </>
    );
    if (!onPlayerClick) return <span key={id} className="tier-player">{content}</span>;
    return (
      <button
        key={id}
        type="button"
        className={selectedIds.includes(id) ? 'tier-player tier-player-button selected' : 'tier-player tier-player-button'}
        onClick={() => onPlayerClick(id)}
        aria-pressed={selectedIds.includes(id)}
      >
        {content}
      </button>
    );
  }

  return (
    <article className={`tier-court tier-court-${side}${compact ? ' compact' : ''}${invalid ? ' invalid' : ''}${needsResult ? ' needs-result' : ''}`}>
      <header className="tier-court-header">
        <span className="tier-court-number">{matchCourtLabel(match)}</span>
        <span className="tier-court-label">
          {courtTierLabel(tiers)}
          {needsResult && <span className="tier-result-needed">Result needed</span>}
        </span>
      </header>
      <div className="tier-court-teams">
        <div className="tier-team">{match.teamAPlayerIds.map(renderPlayer)}</div>
        <div className="tier-vs">vs</div>
        <div className="tier-team">{match.teamBPlayerIds.map(renderPlayer)}</div>
      </div>
      {footer}
    </article>
  );
}
