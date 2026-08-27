import { useState, type FormEvent } from 'react';
import type { DynamicPairingCourtAssignment, DynamicPairingRound, DynamicPairingTeam, Player, PlayerAvailabilityStatus } from '../types';
import {
  dynamicPairingAvailabilityLabel,
  isDynamicPairingFixedTeamSide,
  isDynamicPairingRoundComplete,
  nextRoundButtonLabel,
  rankingBasisLabel,
  roundPhaseLabel,
} from '../utils/dynamicPairingSocial';
import { PlayerActionMenu, type PlayerActionMenuReplacement } from './PlayerActionMenu';

interface DynamicPairingCurrentRoundProps {
  round: DynamicPairingRound | undefined;
  rounds: DynamicPairingRound[];
  players: Player[];
  teams: DynamicPairingTeam[];
  onSetScore: (courtNumber: number, score1: number, score2: number) => void;
  onGenerateNextRound: () => void;
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onSwap: (activePlayerId: string, restingPlayerId: string) => { ok: boolean; reason?: string };
}

// The live/active Dynamic Pairing Social round — mirrors CurrentRoundView's
// shape (court cards with score entry, a sitting-out list, a gate on
// advancing to the next round) but works off DynamicPairingRound/
// DynamicPairingCourtAssignment instead of Round/Match, since scores here
// apply to a court (2 fixed teams for the round) rather than an arbitrary
// MatchSide. `rounds` (the full history, including any pre-generated
// 'upcoming' rounds) is only needed to compute nextRoundButtonLabel — see
// that function for why the button's label/behaviour varies. Every player
// name is clickable — see PlayerActionMenu — opening the same status/swap
// actions Session Controls' standalone controls already offer.
export function DynamicPairingCurrentRound({
  round,
  rounds,
  players,
  teams,
  onSetScore,
  onGenerateNextRound,
  onSetAvailability,
  onSwap,
}: DynamicPairingCurrentRoundProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const allScored = round ? isDynamicPairingRoundComplete(round) : false;
  const selectedPlayer = selectedPlayerId ? playerById.get(selectedPlayerId) : undefined;

  // A resting fixed-team member can't be swapped in alone (see
  // canSwapPlayerInDynamicPairingRound) — only offer resting players whose
  // partner, if any, is also resting.
  const restingSwapOptions = round
    ? round.restingPlayerIds
        .filter((id) => {
          const team = teams.find((t) => t.playerIds.includes(id));
          if (!team) return true;
          const partnerId = team.playerIds.find((pid) => pid !== id);
          return partnerId != null && round.restingPlayerIds.includes(partnerId);
        })
        .map((id) => ({ id, label: playerNameById.get(id) ?? 'Unknown player' }))
    : [];

  function menuContextFor(playerId: string): { contextLines: string[]; replacement: PlayerActionMenuReplacement | undefined } {
    if (!round) return { contextLines: [], replacement: undefined };
    const court = round.courts.find((c) => c.playerIds.includes(playerId));
    if (!court) {
      return { contextLines: ['Resting this round'], replacement: undefined };
    }
    const teammateIds = court.playerIds.filter((id) => id !== playerId);
    const teammateNames = teammateIds.map((id) => playerNameById.get(id) ?? 'Unknown player');
    const scored = court.score1 != null || court.score2 != null;
    const lines = [`Court ${court.courtNumber}`, `Playing with/against ${teammateNames.join(', ')}`];
    if (scored) {
      lines.push("This court's score is already submitted — edit or reset it before changing players.");
      return { contextLines: lines, replacement: undefined };
    }
    const side = court.team1PlayerIds.includes(playerId) ? court.team1PlayerIds : court.team2PlayerIds;
    if (isDynamicPairingFixedTeamSide(side, teams)) {
      return {
        contextLines: lines,
        replacement: {
          label: 'Swap with resting player',
          options: [],
          onReplace: () => ({ ok: false, reason: "That player is on a fixed team, which can't be split by a swap." }),
          disabledReason: "This player is on a fixed team, which can't be split by a swap.",
        },
      };
    }
    return {
      contextLines: lines,
      replacement: {
        label: 'Swap with resting player',
        options: restingSwapOptions,
        onReplace: (restingId: string) => onSwap(playerId, restingId),
      },
    };
  }

  function teamLabel(playerIds: string[]) {
    return playerIds.map((id) => playerNameById.get(id) ?? 'Unknown player').join(' & ');
  }

  function sideBadge(playerIds: string[]): string | null {
    if (playerIds.length !== 2) return null;
    return isDynamicPairingFixedTeamSide(playerIds, teams) ? 'Fixed Team' : 'Temporary Pair';
  }

  function renderPlayerNames(playerIds: string[]) {
    return (
      <span className="match-team-name">
        {playerIds.map((id, index) => (
          <span key={id}>
            {index > 0 && ' & '}
            <button type="button" className="player-name-link" onClick={() => setSelectedPlayerId(id)}>
              {playerNameById.get(id) ?? 'Unknown player'}
            </button>
          </span>
        ))}
      </span>
    );
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
        {round && <p className="hint">Pairing basis: {rankingBasisLabel(round)}</p>}
        {round && round.phase === 'grading' && (
          <p className="hint">Rotation note: {round.rotationNote ?? 'No repeat opponents.'}</p>
        )}
        {round && round.byeFairnessNote && <p className="hint">{round.byeFairnessNote}</p>}

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
                team1Badge={sideBadge(court.team1PlayerIds)}
                team2Badge={sideBadge(court.team2PlayerIds)}
                renderTeam1={() => renderPlayerNames(court.team1PlayerIds)}
                renderTeam2={() => renderPlayerNames(court.team2PlayerIds)}
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
                <li key={id}>
                  <button type="button" className="bye-chip bye-chip-clickable" onClick={() => setSelectedPlayerId(id)}>
                    {playerNameById.get(id) ?? 'Unknown player'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {selectedPlayer && (
        <PlayerActionMenu
          player={selectedPlayer}
          statusLabel={dynamicPairingAvailabilityLabel}
          contextLines={menuContextFor(selectedPlayer.id).contextLines}
          replacement={menuContextFor(selectedPlayer.id).replacement}
          onSetStatus={(status) => onSetAvailability(selectedPlayer.id, status)}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}
    </>
  );
}

interface DynamicPairingCourtCardProps {
  court: DynamicPairingCourtAssignment;
  team1Label: string;
  team2Label: string;
  team1Badge: string | null;
  team2Badge: string | null;
  renderTeam1: () => React.ReactNode;
  renderTeam2: () => React.ReactNode;
  onSetScore: (score1: number, score2: number) => void;
}

function DynamicPairingCourtCard({ court, team1Label, team2Label, team1Badge, team2Badge, renderTeam1, renderTeam2, onSetScore }: DynamicPairingCourtCardProps) {
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
          {renderTeam1()}
          {team1Badge && <span className="dp-side-badge">{team1Badge}</span>}
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
          {renderTeam2()}
          {team2Badge && <span className="dp-side-badge">{team2Badge}</span>}
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
