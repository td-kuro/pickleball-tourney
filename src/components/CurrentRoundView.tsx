import { useState, type FormEvent } from 'react';
import type { Match, Player, PlayerAvailabilityStatus, Round, Team, TournamentSettings } from '../types';
import { availabilityStatusLabel, canGenerateRound, getMatchWinner, isScoringEnabled, socialScoringModeLabel, teamKey } from '../utils/tournament';
import { ByeList } from './ByeList';
import { PlayerActionMenu, type PlayerActionMenuReplacement } from './PlayerActionMenu';

// Looks up whether a match side's playerIds correspond to a declared fixed
// Team (mixed Doubles only ever has this for *some* sides — the rest are
// temporary teams formed fresh each round, which don't get this badge) —
// see generateMixedDoublesRound in utils/pairing.ts.
function fixedTeamNameFor(playerIds: string[], teams: Team[]): string | undefined {
  if (playerIds.length !== 2) return undefined;
  const key = teamKey(playerIds);
  return teams.find((team) => teamKey(team.playerIds) === key)?.name;
}

interface CurrentRoundViewProps {
  players: Player[];
  settings: TournamentSettings;
  rounds: Round[];
  plannedRounds: number | null;
  onNextRound: () => void;
  onFinishSession: () => void;
  onSetScore: (roundId: string, matchId: string, scoreA: number, scoreB: number) => void;
  // Only relevant (and only ever non-empty) for Doubles with at least one
  // fixed team — used both by canGenerateRound (validating team names) and
  // to badge fixed-team sides on match cards (see fixedTeamNameFor above).
  teams?: Team[];
  // Social Play only (Tournament Mode never passes these — see App.tsx) —
  // clicking a player's name opens PlayerActionMenu instead of the name
  // just being static text. Individual players only; a fixed-team side
  // stays plain text with its FixedTeamTag, same scope boundary
  // SessionControls/PlayerAvailabilityControls already use (fixed teams
  // can't be split by a swap — see isFixedTeamSide).
  onSetAvailability?: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onSwap?: (activePlayerId: string, byePlayerId: string) => { ok: boolean; reason?: string };
}

// The live/active round: matches, score entry, and who's on a bye. This is
// the default sub-view under the "Rounds" tab — see RoundsPage.
export function CurrentRoundView({
  players,
  settings,
  rounds,
  plannedRounds,
  onNextRound,
  onFinishSession,
  onSetScore,
  teams = [],
  onSetAvailability,
  onSwap,
}: CurrentRoundViewProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  // Not necessarily the last entry in `rounds` — Social Play pre-generates
  // "upcoming" rounds after this one, see useTournament.startSession.
  const currentRound = rounds.find((round) => round.status === 'current');
  const generateCheck = canGenerateRound(players, settings, currentRound, teams);
  const showScoring = isScoringEnabled(settings);
  // Clickable player names/PlayerActionMenu are Social Play only — see
  // this component's file comment.
  const isSocialPlay = settings.playMode === 'social' && !!onSetAvailability && !!onSwap;

  const isFinalPlannedRound = plannedRounds != null && currentRound?.roundNumber === plannedRounds;
  const isPastPlannedRounds = plannedRounds != null && (currentRound?.roundNumber ?? 0) >= plannedRounds;

  function teamLabel(playerIds: string[]) {
    const fixedName = fixedTeamNameFor(playerIds, teams);
    if (fixedName) return fixedName;
    return playerIds.map((id) => playerNameById.get(id) ?? 'Unknown player').join(' & ');
  }

  function isFixedTeamSide(playerIds: string[]) {
    return fixedTeamNameFor(playerIds, teams) != null;
  }

  const selectedPlayer = selectedPlayerId ? playerById.get(selectedPlayerId) : undefined;

  // Everyone on bye this round who isn't half of a fixed team — the pool
  // PlayerActionMenu's "Swap with bye player" can offer as a replacement
  // (see isFixedTeamSide's file comment in utils/tournament.ts: a fixed
  // team can't be split by a swap either way).
  const byeSwapOptions = currentRound
    ? currentRound.byePlayerIds
        .filter((id) => {
          const team = teams.find((t) => t.playerIds.includes(id));
          return !team;
        })
        .map((id) => ({ id, label: playerNameById.get(id) ?? 'Unknown player' }))
    : [];

  function menuContextFor(playerId: string): { contextLines: string[]; replacement: PlayerActionMenuReplacement | undefined } {
    if (!currentRound) return { contextLines: [], replacement: undefined };
    const match = currentRound.matches.find(
      (m) => m.teamA.playerIds.includes(playerId) || m.teamB.playerIds.includes(playerId),
    );
    if (!match) {
      return { contextLines: ['Resting this round'], replacement: undefined };
    }
    const side = match.teamA.playerIds.includes(playerId) ? match.teamA : match.teamB;
    const teammateIds = side.playerIds.filter((id) => id !== playerId);
    const teammateNames = teammateIds.map((id) => playerNameById.get(id) ?? 'Unknown player');
    const scored = match.scoreA != null || match.scoreB != null;
    const lines = [
      `Court ${match.court}`,
      teammateNames.length > 0 ? `Playing with ${teammateNames.join(' & ')}` : 'Playing this round',
    ];
    if (isFixedTeamSide(side.playerIds)) {
      return { contextLines: lines, replacement: undefined };
    }
    if (scored) {
      lines.push('This match already has a score — edit or reset the score before changing players.');
      return { contextLines: lines, replacement: undefined };
    }
    return {
      contextLines: lines,
      replacement: {
        label: 'Swap with bye player',
        options: byeSwapOptions,
        onReplace: (byeId: string) => onSwap!(playerId, byeId),
      },
    };
  }

  function renderPlayerNames(playerIds: string[], fixedTeamLabel: string | undefined) {
    if (fixedTeamLabel) {
      return <span className="match-team-name">{fixedTeamLabel}</span>;
    }
    if (!isSocialPlay) {
      return <span className="match-team-name">{playerIds.map((id) => playerNameById.get(id) ?? 'Unknown player').join(' & ')}</span>;
    }
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
            <h2>
              {currentRound
                ? `Current Round — Round ${currentRound.roundNumber}${plannedRounds != null ? ` of ${plannedRounds}` : ''}`
                : 'Current Round'}
            </h2>
            <span className={settings.playMode === 'tournament' ? 'mode-badge tournament' : 'mode-badge social'}>
              {settings.playMode === 'tournament'
                ? 'Tournament Mode'
                : `Social Play — ${socialScoringModeLabel(settings.socialScoringMode)}`}
            </span>
          </div>
          {!isPastPlannedRounds && (
            <button type="button" className="cta-button" onClick={onNextRound} disabled={!generateCheck.ok}>
              Next Round
            </button>
          )}
        </div>
        {!generateCheck.ok && <p className="hint error">{generateCheck.reason}</p>}

        {isFinalPlannedRound && (
          <p className="hint session-timing-notice">
            This is the estimated final round based on your session timing.
          </p>
        )}

        {isPastPlannedRounds && (
          <div className="session-end-actions">
            <button type="button" className="cta-button" onClick={onFinishSession}>
              Finish Session
            </button>
            <button type="button" className="secondary" onClick={onNextRound} disabled={!generateCheck.ok}>
              Generate Extra Round
            </button>
          </div>
        )}

        {!currentRound && <p className="empty-state">No round generated yet.</p>}

        {currentRound && (
          <div className="match-list">
            {currentRound.matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                teamALabel={teamLabel(match.teamA.playerIds)}
                teamBLabel={teamLabel(match.teamB.playerIds)}
                teamAFixedName={fixedTeamNameFor(match.teamA.playerIds, teams)}
                teamBFixedName={fixedTeamNameFor(match.teamB.playerIds, teams)}
                renderTeamA={() => renderPlayerNames(match.teamA.playerIds, fixedTeamNameFor(match.teamA.playerIds, teams))}
                renderTeamB={() => renderPlayerNames(match.teamB.playerIds, fixedTeamNameFor(match.teamB.playerIds, teams))}
                showScoring={showScoring}
                onSetScore={(scoreA, scoreB) => onSetScore(currentRound.id, match.id, scoreA, scoreB)}
              />
            ))}
          </div>
        )}
      </section>

      {currentRound && (
        <ByeList
          round={currentRound}
          players={players}
          teams={teams}
          onSelectPlayer={isSocialPlay ? (id) => setSelectedPlayerId(id) : undefined}
        />
      )}

      {isSocialPlay && selectedPlayer && (
        <PlayerActionMenu
          player={selectedPlayer}
          statusLabel={availabilityStatusLabel}
          contextLines={menuContextFor(selectedPlayer.id).contextLines}
          replacement={menuContextFor(selectedPlayer.id).replacement}
          onSetStatus={(status) => onSetAvailability!(selectedPlayer.id, status)}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}
    </>
  );
}

interface MatchCardProps {
  match: Match;
  teamALabel: string;
  teamBLabel: string;
  teamAFixedName?: string;
  teamBFixedName?: string;
  renderTeamA: () => React.ReactNode;
  renderTeamB: () => React.ReactNode;
  showScoring: boolean;
  onSetScore: (scoreA: number, scoreB: number) => void;
}

function FixedTeamTag() {
  return <span className="fixed-team-tag">Fixed Team</span>;
}

function MatchCard({ match, teamALabel, teamBLabel, teamAFixedName, teamBFixedName, renderTeamA, renderTeamB, showScoring, onSetScore }: MatchCardProps) {
  if (!showScoring) {
    return (
      <div className="match-card">
        <div className="match-header">Court {match.court}</div>
        <div className="match-teams">
          <div className="match-team">
            <div className="match-team-name-row">
              {renderTeamA()}
              {teamAFixedName && <FixedTeamTag />}
            </div>
          </div>
          <div className="match-vs">vs</div>
          <div className="match-team">
            <div className="match-team-name-row">
              {renderTeamB()}
              {teamBFixedName && <FixedTeamTag />}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ScoredMatchCard
      match={match}
      teamALabel={teamALabel}
      teamBLabel={teamBLabel}
      teamAFixedName={teamAFixedName}
      teamBFixedName={teamBFixedName}
      renderTeamA={renderTeamA}
      renderTeamB={renderTeamB}
      onSetScore={onSetScore}
    />
  );
}

interface ScoredMatchCardProps {
  match: Match;
  teamALabel: string;
  teamBLabel: string;
  teamAFixedName?: string;
  teamBFixedName?: string;
  renderTeamA: () => React.ReactNode;
  renderTeamB: () => React.ReactNode;
  onSetScore: (scoreA: number, scoreB: number) => void;
}

function ScoredMatchCard({ match, teamALabel, teamBLabel, teamAFixedName, teamBFixedName, renderTeamA, renderTeamB, onSetScore }: ScoredMatchCardProps) {
  const [scoreA, setScoreA] = useState(match.scoreA != null ? String(match.scoreA) : '');
  const [scoreB, setScoreB] = useState(match.scoreB != null ? String(match.scoreB) : '');
  const [error, setError] = useState<string | null>(null);

  const winner = getMatchWinner(match);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsedA = Number(scoreA);
    const parsedB = Number(scoreB);
    if (scoreA.trim() === '' || scoreB.trim() === '' || Number.isNaN(parsedA) || Number.isNaN(parsedB)) {
      setError('Enter a valid score for both sides.');
      return;
    }
    if (parsedA < 0 || parsedB < 0) {
      setError('Scores cannot be negative.');
      return;
    }

    setError(null);
    onSetScore(parsedA, parsedB);
  }

  return (
    <form className="match-card" onSubmit={handleSubmit}>
      <div className="match-header">Court {match.court}</div>

      <div className="match-teams">
        <div className={winner === 'A' ? 'match-team winner' : 'match-team'}>
          <div className="match-team-name-row">
            {renderTeamA()}
            {teamAFixedName && <FixedTeamTag />}
          </div>
          <input
            type="number"
            min={0}
            value={scoreA}
            onChange={(event) => setScoreA(event.target.value)}
            aria-label={`${teamALabel} score`}
          />
        </div>
        <div className="match-vs">vs</div>
        <div className={winner === 'B' ? 'match-team winner' : 'match-team'}>
          <div className="match-team-name-row">
            {renderTeamB()}
            {teamBFixedName && <FixedTeamTag />}
          </div>
          <input
            type="number"
            min={0}
            value={scoreB}
            onChange={(event) => setScoreB(event.target.value)}
            aria-label={`${teamBLabel} score`}
          />
        </div>
      </div>

      {error && <p className="hint error">{error}</p>}
      {winner && <p className="hint winner-hint">Winner: {winner === 'A' ? teamALabel : teamBLabel}</p>}

      <button type="submit" className="secondary">
        Save Score
      </button>
    </form>
  );
}
