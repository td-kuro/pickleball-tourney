import { useState, type KeyboardEvent } from 'react';
import type { DynamicPairingRound, Player } from '../types';
import { calculateDynamicPairingStats } from '../utils/dynamicPairingSocial';

interface DynamicPairingAdminSkillReviewProps {
  players: Player[];
  rounds: DynamicPairingRound[];
  onUpdateSkillLevel: (id: string, skillLevel?: number) => void;
  onConfirm: () => void;
}

// Shown in place of Current Round once every pre-generated grading round
// has been played (see isAwaitingSkillReview) and before Round 4 exists —
// a one-time checkpoint between the random grading rounds and dynamic,
// ranking-based pairing. Surfaces each player's grading-round win/loss
// record so the organiser has something to base a skill level on (rather
// than guessing blind, which is the whole reason grading came first), then
// Confirm generates Round 4. Setting a skill level per player is optional
// — see updatePlayerSkillLevel and the "skill level" tiebreaker step in
// sortPlayersByRanking — but reaching this screen and clicking Confirm is
// the one mandatory gate before Round 4 can be generated.
export function DynamicPairingAdminSkillReview({ players, rounds, onUpdateSkillLevel, onConfirm }: DynamicPairingAdminSkillReviewProps) {
  const statsById = new Map(calculateDynamicPairingStats(players, rounds).map((s) => [s.playerId, s]));
  const nextRoundNumber = rounds.length + 1;

  return (
    <section className="card">
      <h2>Admin Skill Review</h2>
      <p className="hint">
        The random grading rounds are complete. Review each player's grading-round record below and optionally
        assign a skill level (1 = strongest) — it's used only as a ranking tiebreaker once dynamic pairing starts,
        never a replacement for actual results. Leave it blank for any player and dynamic pairing still works fine.
      </p>
      <div className="player-list">
        {players.map((player, index) => (
          <SkillReviewPlayerRow
            key={player.id}
            index={index}
            player={player}
            record={statsById.get(player.id)}
            onUpdateSkillLevel={onUpdateSkillLevel}
          />
        ))}
      </div>
      <div className="form-actions">
        <button type="button" className="cta-button start-button" onClick={onConfirm}>
          Confirm &amp; Start Round {nextRoundNumber}
        </button>
      </div>
    </section>
  );
}

interface SkillReviewPlayerRowProps {
  index: number;
  player: Player;
  record: { wins: number; losses: number } | undefined;
  onUpdateSkillLevel: (id: string, skillLevel?: number) => void;
}

function SkillReviewPlayerRow({ index, player, record, onUpdateSkillLevel }: SkillReviewPlayerRowProps) {
  const [skillLevel, setSkillLevel] = useState(player.skillLevel != null ? String(player.skillLevel) : '');

  function commit() {
    const trimmed = skillLevel.trim();
    const parsed = trimmed === '' ? undefined : parseInt(trimmed, 10);
    onUpdateSkillLevel(player.id, parsed != null && !Number.isNaN(parsed) ? parsed : undefined);
  }

  function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur();
  }

  return (
    <div className="player-row">
      <span className="player-row-index">{index + 1}</span>
      <span className="player-row-name">{player.name}</span>
      <span className="hint">
        {record ? `${record.wins}-${record.losses}` : '0-0'} in grading
      </span>
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
        aria-label={`${player.name} skill level`}
      />
    </div>
  );
}
