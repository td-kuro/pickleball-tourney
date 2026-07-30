import { useState, type FormEvent } from 'react';
import type { Match, Player, Round, TournamentSettings } from '../types';
import { canGenerateRound, getMatchWinner, isScoringEnabled, socialScoringModeLabel } from '../utils/tournament';

interface RoundViewProps {
  players: Player[];
  settings: TournamentSettings;
  rounds: Round[];
  onGenerateRound: () => void;
  onSetScore: (roundId: string, matchId: string, scoreA: number, scoreB: number) => void;
}

export function RoundView({ players, settings, rounds, onGenerateRound, onSetScore }: RoundViewProps) {
  const playerNameById = new Map(players.map((p) => [p.id, p.name]));
  const currentRound = rounds[rounds.length - 1];
  const generateCheck = canGenerateRound(players, settings, currentRound);
  const showScoring = isScoringEnabled(settings);

  function teamLabel(playerIds: string[]) {
    return playerIds.map((id) => playerNameById.get(id) ?? 'Unknown player').join(' & ');
  }

  return (
    <section className="card">
      <div className="section-heading-row">
        <div>
          <h2>{currentRound ? `Current Round — Round ${currentRound.roundNumber}` : 'Current Round'}</h2>
          <span className={settings.playMode === 'tournament' ? 'mode-badge tournament' : 'mode-badge social'}>
            {settings.playMode === 'tournament'
              ? 'Tournament Mode'
              : `Social Play — ${socialScoringModeLabel(settings.socialScoringMode)}`}
          </span>
        </div>
        <button type="button" className="cta-button" onClick={onGenerateRound} disabled={!generateCheck.ok}>
          Generate Next Round
        </button>
      </div>
      {!generateCheck.ok && <p className="hint error">{generateCheck.reason}</p>}

      {!currentRound && <p className="empty-state">No round generated yet.</p>}

      {currentRound && (
        <div className="match-list">
          {currentRound.matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              teamALabel={teamLabel(match.teamA.playerIds)}
              teamBLabel={teamLabel(match.teamB.playerIds)}
              showScoring={showScoring}
              onSetScore={(scoreA, scoreB) => onSetScore(currentRound.id, match.id, scoreA, scoreB)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface MatchCardProps {
  match: Match;
  teamALabel: string;
  teamBLabel: string;
  showScoring: boolean;
  onSetScore: (scoreA: number, scoreB: number) => void;
}

function MatchCard({ match, teamALabel, teamBLabel, showScoring, onSetScore }: MatchCardProps) {
  if (!showScoring) {
    return (
      <div className="match-card">
        <div className="match-header">Court {match.court}</div>
        <div className="match-teams">
          <div className="match-team">
            <span className="match-team-name">{teamALabel}</span>
          </div>
          <div className="match-vs">vs</div>
          <div className="match-team">
            <span className="match-team-name">{teamBLabel}</span>
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
      onSetScore={onSetScore}
    />
  );
}

interface ScoredMatchCardProps {
  match: Match;
  teamALabel: string;
  teamBLabel: string;
  onSetScore: (scoreA: number, scoreB: number) => void;
}

function ScoredMatchCard({ match, teamALabel, teamBLabel, onSetScore }: ScoredMatchCardProps) {
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
          <span className="match-team-name">{teamALabel}</span>
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
          <span className="match-team-name">{teamBLabel}</span>
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
