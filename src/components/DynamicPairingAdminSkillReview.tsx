import { useState, type KeyboardEvent } from 'react';
import type { DynamicPairingEntrant, DynamicPairingPlayerStats, DynamicPairingRound, DynamicPairingTeam, Player } from '../types';
import { buildDynamicPairingEntrants, calculateDynamicPairingStats, formatSignedPoints } from '../utils/dynamicPairingSocial';

interface DynamicPairingAdminSkillReviewProps {
  players: Player[];
  teams: DynamicPairingTeam[];
  rounds: DynamicPairingRound[];
  onUpdateSkillLevel: (entrantId: string, skillLevel?: number) => void;
  onConfirm: () => void;
}

// Shown in place of Current Round once every pre-generated grading round
// has been played (see isAwaitingSkillReview) and before Round 4 exists —
// a one-time checkpoint between the random grading rounds and dynamic,
// ranking-based pairing. Surfaces each entrant's (individual player or
// fixed team — see buildDynamicPairingEntrants) full grading-round stat
// line (games played, W/L, win %, PF/PA, point differential, rests — the
// same per-game metrics Rankings shows later) so the organiser has more
// than a bare win/loss record to base a skill level on, then Confirm
// generates Round 4. A fixed team's stat line is its members' shared stats
// (they always play/rest together — see the "Fixed teams & entrants"
// comment in utils/dynamicPairingSocial.ts). Setting a skill level per
// entrant is optional — see onUpdateSkillLevel and the "skill level"
// tiebreaker step in sortEntrantsByRanking — but reaching this screen and
// clicking Confirm is the one mandatory gate before Round 4 can be
// generated.
export function DynamicPairingAdminSkillReview({ players, teams, rounds, onUpdateSkillLevel, onConfirm }: DynamicPairingAdminSkillReviewProps) {
  const entrants = buildDynamicPairingEntrants(players, teams);
  const playerStatsById = new Map(calculateDynamicPairingStats(players, rounds).map((s) => [s.playerId, s]));
  const nextRoundNumber = rounds.length + 1;

  return (
    <section className="card">
      <h2>Admin Skill Review</h2>
      <p className="hint">
        The random grading rounds are complete. Review each player/team's grading-round stats below and optionally
        assign a skill level (1 = strongest) — it's used only as a ranking tiebreaker once dynamic pairing starts,
        never a replacement for actual results. Leave it blank and dynamic pairing still works fine.
      </p>
      <div className="leaderboard-scroll">
        <table className="leaderboard-table stats-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player / Team</th>
              <th>Type</th>
              <th>Played</th>
              <th>Wins</th>
              <th>Losses</th>
              <th>Win %</th>
              <th>PF</th>
              <th>PA</th>
              <th>+/-</th>
              <th>Avg +/-</th>
              <th>Avg Pts</th>
              <th>Rests</th>
              <th>Skill</th>
            </tr>
          </thead>
          <tbody>
            {entrants.map((entrant, index) => (
              <SkillReviewEntrantRow
                key={entrant.id}
                index={index}
                entrant={entrant}
                stats={playerStatsById.get(entrant.playerIds[0])}
                onUpdateSkillLevel={onUpdateSkillLevel}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button type="button" className="cta-button start-button" onClick={onConfirm}>
          Confirm &amp; Start Round {nextRoundNumber}
        </button>
      </div>
    </section>
  );
}

interface SkillReviewEntrantRowProps {
  index: number;
  entrant: DynamicPairingEntrant;
  stats: DynamicPairingPlayerStats | undefined;
  onUpdateSkillLevel: (entrantId: string, skillLevel?: number) => void;
}

function SkillReviewEntrantRow({ index, entrant, stats, onUpdateSkillLevel }: SkillReviewEntrantRowProps) {
  const [skillLevel, setSkillLevel] = useState(entrant.skillLevel != null ? String(entrant.skillLevel) : '');

  function commit() {
    const trimmed = skillLevel.trim();
    const parsed = trimmed === '' ? undefined : parseInt(trimmed, 10);
    onUpdateSkillLevel(entrant.id, parsed != null && !Number.isNaN(parsed) ? parsed : undefined);
  }

  function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur();
  }

  return (
    <tr>
      <td>{index + 1}</td>
      <td>{entrant.displayName}</td>
      <td>
        <span className={entrant.type === 'fixed-team' ? 'participant-badge participant-badge-team' : 'participant-badge participant-badge-player'}>
          {entrant.type === 'fixed-team' ? 'Fixed Team' : 'Individual'}
        </span>
      </td>
      <td>{stats?.gamesPlayed ?? 0}</td>
      <td>{stats?.wins ?? 0}</td>
      <td>{stats?.losses ?? 0}</td>
      <td>{(((stats?.winPercentage ?? 0) * 100)).toFixed(0)}%</td>
      <td>{stats?.pointsFor ?? 0}</td>
      <td>{stats?.pointsAgainst ?? 0}</td>
      <td>{formatSignedPoints(stats?.pointDifferential ?? 0)}</td>
      <td>{formatSignedPoints(stats?.averagePointDifferential ?? 0)}</td>
      <td>{(stats?.averagePointsScored ?? 0).toFixed(1)}</td>
      <td>{stats?.totalRests ?? 0}</td>
      <td>
        <input
          type="number"
          className="player-row-rating"
          min={1}
          step={1}
          value={skillLevel}
          onChange={(event) => setSkillLevel(event.target.value)}
          onBlur={commit}
          onKeyDown={blurOnEnter}
          placeholder="Skill"
          title="Skill level (1 = strongest)"
          aria-label={`${entrant.displayName} skill level`}
        />
      </td>
    </tr>
  );
}
