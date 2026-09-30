import { useMemo, useState } from 'react';
import type { DynamicPairingRound, DynamicPairingTeam, Player, PlayerAvailabilityStatus, ResultSubmission, ScoreRecordingMode } from '../types';
import { DynamicPairingAllRounds } from './DynamicPairingAllRounds';
import { DynamicPairingCurrentRound } from './DynamicPairingCurrentRound';
import { ScheduleIntegrityNotice } from './ScheduleIntegrityNotice';
import { dynamicPairingTeamDisplayName } from '../utils/dynamicPairingSocial';
import { dynamicPairingScheduleView, entrantByeContext, firstUpcomingRoundNumber, validateCurrentRoundMatchesSchedule } from '../utils/scheduleValidation';

type RoundsSubView = 'current' | 'all';

interface DynamicPairingRoundsPageProps {
  rounds: DynamicPairingRound[];
  currentRound: DynamicPairingRound | undefined;
  players: Player[];
  teams: DynamicPairingTeam[];
  onSetResult: (courtNumber: number, result: ResultSubmission) => void;
  scoreRecordingMode: ScoreRecordingMode;
  onGenerateNextRound: () => void;
  onSetAvailability: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onSwap: (activePlayerId: string, restingPlayerId: string) => { ok: boolean; reason?: string };
  onResumeSavedRound: () => void;
}

// Parent for Dynamic Pairing Social's "Rounds" tab — a Current Round / All
// Rounds toggle, mirroring RoundsPage's shape for the standard rotating-
// round modes. Ranking is now calculated and dynamic rounds generated
// automatically as soon as their game-lag basis is available (see
// extendDynamicPairingLookahead in utils/dynamicPairingSocial.ts) — there's
// no longer an Admin Skill Review checkpoint between grading and dynamic
// pairing here (see DynamicPairingAdminSkillReview.tsx's file header for
// where that screen used to be wired in). All Rounds keeps working exactly
// as normal throughout, since it doesn't depend on there being an active
// round. Both sub-views render the same saved `rounds` — Current Round is
// just the saved round whose status is 'current', never a separately
// generated one (see validateCurrentRoundMatchesSchedule).
export function DynamicPairingRoundsPage({
  rounds,
  currentRound,
  players,
  teams,
  onSetResult,
  scoreRecordingMode,
  onGenerateNextRound,
  onSetAvailability,
  onSwap,
  onResumeSavedRound,
}: DynamicPairingRoundsPageProps) {
  const validation = useMemo(
    () =>
      validateCurrentRoundMatchesSchedule({
        rounds: rounds.map(dynamicPairingScheduleView),
        knownPlayerIds: new Set(players.map((p) => p.id)),
        fixedTeams: teams,
        ...entrantByeContext(players, teams, (team) => dynamicPairingTeamDisplayName(team, players)),
      }),
    [rounds, players, teams],
  );
  const [subView, setSubView] = useState<RoundsSubView>('current');

  return (
    <>
      <div className="rounds-subnav">
        <div className="toggle-group rounds-toggle" role="group" aria-label="Rounds view">
          <button
            type="button"
            className={subView === 'current' ? 'toggle-option active' : 'toggle-option'}
            onClick={() => setSubView('current')}
          >
            Current Round
          </button>
          <button
            type="button"
            className={subView === 'all' ? 'toggle-option active' : 'toggle-option'}
            onClick={() => setSubView('all')}
          >
            All Rounds
          </button>
        </div>
      </div>

      <ScheduleIntegrityNotice
        validation={validation}
        resumeRoundNumber={currentRound ? undefined : firstUpcomingRoundNumber(rounds)}
        onResume={onResumeSavedRound}
      />

      {subView === 'current' ? (
        <DynamicPairingCurrentRound
          round={currentRound}
          rounds={rounds}
          players={players}
          teams={teams}
          onSetResult={onSetResult}
          scoreRecordingMode={scoreRecordingMode}
          onGenerateNextRound={onGenerateNextRound}
          onSetAvailability={onSetAvailability}
          onSwap={onSwap}
        />
      ) : (
        <DynamicPairingAllRounds rounds={rounds} players={players} />
      )}
    </>
  );
}
