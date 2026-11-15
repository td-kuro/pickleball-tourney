import { courtLabel } from '../utils/courtNumbers';
import { useState, type FormEvent } from 'react';
import type {
  DynamicPairingCourtAssignment,
  DynamicPairingRound,
  DynamicPairingTeam,
  Player,
  PlayerAvailabilityStatus,
  ResultSubmission,
  ScoreRecordingMode,
} from '../types';
import { isWinLossOnlyResult, scoreRecordingModeLabel } from '../utils/results';
import { MatchResultEntry } from './MatchResultEntry';
import { DynamicPairingSwapDialog, type SwapPreviewResult, type SwapResult } from './DynamicPairingSwapDialog';
import {
  courtHasResult,
  dynamicPairingAvailabilityLabel,
  getMatchGenderType,
  isDynamicPairingFixedTeamSide,
  isDynamicPairingRoundComplete,
  matchGenderTypeLabel,
  nextRoundButtonLabel,
  rankingBasisLabel,
  roundPhaseLabel,
  visibleByeNote,
} from '../utils/dynamicPairingSocial';
import { PlayerActionMenu } from './PlayerActionMenu';

interface DynamicPairingCurrentRoundProps {
  round: DynamicPairingRound | undefined;
  rounds: DynamicPairingRound[];
  players: Player[];
  teams: DynamicPairingTeam[];
  onSetResult: (courtNumber: number, result: ResultSubmission) => void;
  scoreRecordingMode: ScoreRecordingMode;
  onGenerateNextRound: () => void;
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onPreviewSwap: (playerAId: string, playerBId: string) => SwapPreviewResult;
  onSwapPlayers: (playerAId: string, playerBId: string, options: { refreshUpcoming: boolean }) => SwapResult;
  onResetResult: (courtNumber: number) => void;
}

// The live/active Dynamic Pairing Social round — mirrors CurrentRoundView's
// shape (court cards with score entry, a sitting-out list, a gate on
// advancing to the next round) but works off DynamicPairingRound/
// DynamicPairingCourtAssignment instead of Round/Match, since scores here
// apply to a court (2 fixed teams for the round) rather than an arbitrary
// MatchSide. `rounds` (the full history, including any pre-generated
// 'upcoming' rounds) is only needed to compute nextRoundButtonLabel — see
// that function for why the button's label/behaviour varies. Every player
// name is clickable — see PlayerActionMenu — opening the same status
// actions Session Controls' standalone controls already offer, plus Swap
// Player, which swaps them with anyone else in the round (see
// DynamicPairingSwapDialog).
export function DynamicPairingCurrentRound({
  round,
  rounds,
  players,
  teams,
  onSetResult,
  scoreRecordingMode,
  onGenerateNextRound,
  onSetAvailability,
  onPreviewSwap,
  onSwapPlayers,
  onResetResult,
}: DynamicPairingCurrentRoundProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [swapPlayerId, setSwapPlayerId] = useState<string | null>(null);
  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const allScored = round ? isDynamicPairingRoundComplete(round) : false;
  const selectedPlayer = selectedPlayerId ? playerById.get(selectedPlayerId) : undefined;

  function menuContextFor(playerId: string): { contextLines: string[]; swapDisabledReason?: string } {
    if (!round) return { contextLines: [] };
    const court = round.courts.find((c) => c.playerIds.includes(playerId));
    if (!court) {
      return {
        contextLines: [round.restingPlayerIds.includes(playerId) ? 'Resting this round' : 'Not scheduled this round'],
      };
    }
    const otherNames = court.playerIds.filter((id) => id !== playerId).map((id) => playerNameById.get(id) ?? 'Unknown player');
    const side = court.team1PlayerIds.includes(playerId) ? court.team1PlayerIds : court.team2PlayerIds;
    const lines = [courtLabel(round.courtNumbers, court.courtNumber), `Playing with/against ${otherNames.join(', ')}`];
    if (isDynamicPairingFixedTeamSide(side, teams)) lines.push('Fixed team — a swap moves the whole team.');
    if (courtHasResult(court)) {
      return {
        contextLines: lines,
        swapDisabledReason: `${courtLabel(round.courtNumbers, court.courtNumber)} already has a result. Reset it first (on the court card) to change its players.`,
      };
    }
    return { contextLines: lines };
  }

  function teamLabel(playerIds: string[]) {
    return playerIds.map((id) => playerNameById.get(id) ?? 'Unknown player').join(' & ');
  }

  function sideBadge(playerIds: string[]): string | null {
    if (playerIds.length !== 2) return null;
    return isDynamicPairingFixedTeamSide(playerIds, teams) ? 'Fixed Team' : 'Temporary Pair';
  }

  // Only shown for a court whose gender classification is worth calling
  // out (see getMatchGenderType) — a 'standard' court (no clean mixed/
  // gendered story) shows no label at all, keeping this uncluttered for
  // sessions where gender-aware pairing isn't active.
  function matchGenderLabel(team1PlayerIds: string[], team2PlayerIds: string[]): string | null {
    const type = getMatchGenderType(team1PlayerIds, team2PlayerIds, playerById);
    return type === 'standard' ? null : matchGenderTypeLabel(type);
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
                {roundPhaseLabel(round.phase, round.gradingMode)}
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
          <p className="hint error">Enter a result for every court before generating the next round.</p>
        )}
        {round && <p className="hint">Scoring: {scoreRecordingModeLabel(scoreRecordingMode)}</p>}
        {round && <p className="hint">Loaded from saved Round {round.roundNumber} schedule</p>}
        {round && <p className="hint">Pairing basis: {rankingBasisLabel(round)}</p>}
        {round && round.phase === 'grading' && (
          <p className="hint">Rotation note: {round.rotationNote ?? 'No repeat opponents.'}</p>
        )}
        {round && visibleByeNote(round) && <p className="hint">Bye note: {visibleByeNote(round)}</p>}

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
                courtName={courtLabel(round.courtNumbers, court.courtNumber)}
                team1Label={teamLabel(court.team1PlayerIds)}
                team2Label={teamLabel(court.team2PlayerIds)}
                team1Badge={sideBadge(court.team1PlayerIds)}
                team2Badge={sideBadge(court.team2PlayerIds)}
                genderTypeLabel={matchGenderLabel(court.team1PlayerIds, court.team2PlayerIds)}
                renderTeam1={() => renderPlayerNames(court.team1PlayerIds)}
                renderTeam2={() => renderPlayerNames(court.team2PlayerIds)}
                scoreMode={scoreRecordingMode}
                onSetResult={(result) => onSetResult(court.courtNumber, result)}
                onResetResult={() => onResetResult(court.courtNumber)}
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
          onSwapPlayer={() => {
            setSwapPlayerId(selectedPlayer.id);
            setSelectedPlayerId(null);
          }}
          swapDisabledReason={menuContextFor(selectedPlayer.id).swapDisabledReason}
          onSetStatus={(status) => onSetAvailability(selectedPlayer.id, status)}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}

      {round && swapPlayerId && (
        <DynamicPairingSwapDialog
          round={round}
          players={players}
          playerId={swapPlayerId}
          onPreview={onPreviewSwap}
          onConfirm={onSwapPlayers}
          onClose={() => setSwapPlayerId(null)}
        />
      )}
    </>
  );
}

interface DynamicPairingCourtCardProps {
  // "Court 3" — the physical court (see utils/courtNumbers.ts).
  courtName: string;
  court: DynamicPairingCourtAssignment;
  team1Label: string;
  team2Label: string;
  team1Badge: string | null;
  team2Badge: string | null;
  genderTypeLabel: string | null;
  renderTeam1: () => React.ReactNode;
  renderTeam2: () => React.ReactNode;
  scoreMode: ScoreRecordingMode;
  onSetResult: (result: ResultSubmission) => void;
  onResetResult: () => void;
}

// Shown once a court is scored in the current round — the supported way to
// correct a result or free the court up for a player swap.
function ResetResultButton({ courtName, onReset }: { courtName: string; onReset: () => void }) {
  return (
    <button
      type="button"
      className="secondary dp-reset-result"
      onClick={() => {
        if (window.confirm(`Reset the result for ${courtName}? You can then re-enter it or change its players.`)) onReset();
      }}
    >
      Reset Result
    </button>
  );
}

function DynamicPairingCourtCard({
  court,
  courtName,
  team1Label,
  team2Label,
  team1Badge,
  team2Badge,
  genderTypeLabel,
  renderTeam1,
  renderTeam2,
  scoreMode,
  onSetResult,
  onResetResult,
}: DynamicPairingCourtCardProps) {
  const [score1, setScore1] = useState(court.score1 != null ? String(court.score1) : '');
  const [score2, setScore2] = useState(court.score2 != null ? String(court.score2) : '');
  const [error, setError] = useState<string | null>(null);
  const locked = court.status === 'completed';

  // Win/Loss only: no score inputs at all, just "Who won?" — also used to
  // show a locked winner-only result recorded under that mode, so it's
  // never rendered as blank score boxes or a fake 0-0.
  if (scoreMode === 'win-loss-only' || isWinLossOnlyResult(court.score1, court.score2, court.winnerTeam)) {
    return (
      <div className="match-card">
        <div className="match-header">
          {courtName}
          {genderTypeLabel && <span className="dp-side-badge dp-gender-match-badge"> {genderTypeLabel}</span>}
        </div>
        <div className="match-teams">
          <div className={court.winnerTeam === 1 ? 'match-team winner' : 'match-team'}>
            {renderTeam1()}
            {team1Badge && <span className="dp-side-badge">{team1Badge}</span>}
          </div>
          <div className="match-vs">vs</div>
          <div className={court.winnerTeam === 2 ? 'match-team winner' : 'match-team'}>
            {renderTeam2()}
            {team2Badge && <span className="dp-side-badge">{team2Badge}</span>}
          </div>
        </div>
        <MatchResultEntry
          mode="win-loss-only"
          sideALabel={team1Label}
          sideBLabel={team2Label}
          initialScoreA={court.score1}
          initialScoreB={court.score2}
          currentWinner={court.winnerTeam === 1 ? 'A' : court.winnerTeam === 2 ? 'B' : undefined}
          locked={locked}
          onSubmit={onSetResult}
        />
        {locked && <ResetResultButton courtName={courtName} onReset={onResetResult} />}
      </div>
    );
  }

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
    onSetResult({ kind: 'score', scoreA: parsed1, scoreB: parsed2 });
  }

  return (
    <form className="match-card" onSubmit={handleSubmit}>
      <div className="match-header">
        {courtName}
        {genderTypeLabel && <span className="dp-side-badge dp-gender-match-badge"> {genderTypeLabel}</span>}
      </div>
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
      {locked && <ResetResultButton courtName={courtName} onReset={onResetResult} />}
    </form>
  );
}
