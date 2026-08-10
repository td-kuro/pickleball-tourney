import { useState, type FormEvent } from 'react';
import type { Match, Player, Round, Team, TournamentSettings } from '../types';
import { canGenerateRound, getMatchWinner, isScoringEnabled, socialScoringModeLabel, teamKey } from '../utils/tournament';
import { ByeList } from './ByeList';

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
}: CurrentRoundViewProps) {
  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  // Not necessarily the last entry in `rounds` — Social Play pre-generates
  // "upcoming" rounds after this one, see useTournament.startSession.
  const currentRound = rounds.find((round) => round.status === 'current');
  const generateCheck = canGenerateRound(players, settings, currentRound, teams);
  const showScoring = isScoringEnabled(settings);

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
                teamAIsFixedTeam={isFixedTeamSide(match.teamA.playerIds)}
                teamBIsFixedTeam={isFixedTeamSide(match.teamB.playerIds)}
                showScoring={showScoring}
                onSetScore={(scoreA, scoreB) => onSetScore(currentRound.id, match.id, scoreA, scoreB)}
              />
            ))}
          </div>
        )}
      </section>

      {currentRound && <ByeList round={currentRound} players={players} teams={teams} />}
    </>
  );
}

interface MatchCardProps {
  match: Match;
  teamALabel: string;
  teamBLabel: string;
  teamAIsFixedTeam?: boolean;
  teamBIsFixedTeam?: boolean;
  showScoring: boolean;
  onSetScore: (scoreA: number, scoreB: number) => void;
}

function FixedTeamTag() {
  return <span className="fixed-team-tag">Fixed Team</span>;
}

function MatchCard({ match, teamALabel, teamBLabel, teamAIsFixedTeam, teamBIsFixedTeam, showScoring, onSetScore }: MatchCardProps) {
  if (!showScoring) {
    return (
      <div className="match-card">
        <div className="match-header">Court {match.court}</div>
        <div className="match-teams">
          <div className="match-team">
            <div className="match-team-name-row">
              <span className="match-team-name">{teamALabel}</span>
              {teamAIsFixedTeam && <FixedTeamTag />}
            </div>
          </div>
          <div className="match-vs">vs</div>
          <div className="match-team">
            <div className="match-team-name-row">
              <span className="match-team-name">{teamBLabel}</span>
              {teamBIsFixedTeam && <FixedTeamTag />}
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
      teamAIsFixedTeam={teamAIsFixedTeam}
      teamBIsFixedTeam={teamBIsFixedTeam}
      onSetScore={onSetScore}
    />
  );
}

interface ScoredMatchCardProps {
  match: Match;
  teamALabel: string;
  teamBLabel: string;
  teamAIsFixedTeam?: boolean;
  teamBIsFixedTeam?: boolean;
  onSetScore: (scoreA: number, scoreB: number) => void;
}

function ScoredMatchCard({ match, teamALabel, teamBLabel, teamAIsFixedTeam, teamBIsFixedTeam, onSetScore }: ScoredMatchCardProps) {
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
            <span className="match-team-name">{teamALabel}</span>
            {teamAIsFixedTeam && <FixedTeamTag />}
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
            <span className="match-team-name">{teamBLabel}</span>
            {teamBIsFixedTeam && <FixedTeamTag />}
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
