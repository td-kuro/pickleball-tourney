import { useMemo, useState } from 'react';
import type { Player, PlayerAvailabilityStatus, ResultSubmission, Round, Team, TournamentSettings } from '../types';
import { AllRoundsView } from './AllRoundsView';
import { CurrentRoundView } from './CurrentRoundView';
import { ScheduleIntegrityNotice } from './ScheduleIntegrityNotice';
import { entrantByeContext, firstUpcomingRoundNumber, standardScheduleView, validateCurrentRoundMatchesSchedule } from '../utils/scheduleValidation';

type RoundsSubView = 'current' | 'all';

interface RoundsPageProps {
  players: Player[];
  settings: TournamentSettings;
  rounds: Round[];
  plannedRounds: number | null;
  onNextRound: () => void;
  onFinishSession: () => void;
  onSetResult: (roundId: string, matchId: string, result: ResultSubmission) => void;
  // Only relevant (and only ever non-empty) for Doubles + Fixed Teams —
  // canGenerateRound needs it to validate "enough teams", see
  // CurrentRoundView. Defaults to empty so callers outside Fixed Teams
  // mode don't need to pass it.
  teams?: Team[];
  // Social Play only — see CurrentRoundView's file comment. Safe to always
  // pass through: CurrentRoundView only acts on these when
  // settings.playMode is 'social', so Tournament Mode call sites can just
  // omit them.
  onSetAvailability?: (playerId: string, status: PlayerAvailabilityStatus) => void;
  onSwap?: (activePlayerId: string, byePlayerId: string) => { ok: boolean; reason?: string };
  onResumeSavedRound?: () => void;
}

// Parent for the "Rounds" tab: a Current Round / All Rounds toggle above
// either the live round (CurrentRoundView) or the full round-by-round list
// (AllRoundsView). Both read the same `rounds` prop — the one saved
// schedule; neither view generates pairings, and there's no separate
// history state to keep in sync. The schedule is checked on every render
// (see validateCurrentRoundMatchesSchedule) and any problem is reported,
// never auto-repaired. Always opens on Current Round: App.tsx
// only renders this component while the Rounds tab is selected, so it
// remounts (and this state resets) every time the tab is entered.
export function RoundsPage({
  players,
  settings,
  rounds,
  plannedRounds,
  onNextRound,
  onFinishSession,
  onSetResult,
  teams = [],
  onSetAvailability,
  onSwap,
  onResumeSavedRound,
}: RoundsPageProps) {
  const [subView, setSubView] = useState<RoundsSubView>('current');
  const validation = useMemo(
    () =>
      validateCurrentRoundMatchesSchedule({
        rounds: rounds.map((round) => standardScheduleView(round, teams)),
        knownPlayerIds: new Set(players.map((p) => p.id)),
        fixedTeams: teams,
        ...entrantByeContext(players, teams, (team) => team.name),
      }),
    [rounds, players, teams],
  );

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
        resumeRoundNumber={rounds.some((r) => r.status === 'current') ? undefined : firstUpcomingRoundNumber(rounds)}
        onResume={onResumeSavedRound}
      />

      {subView === 'current' ? (
        <CurrentRoundView
          players={players}
          settings={settings}
          rounds={rounds}
          plannedRounds={plannedRounds}
          onNextRound={onNextRound}
          onFinishSession={onFinishSession}
          onSetResult={onSetResult}
          teams={teams}
          onSetAvailability={onSetAvailability}
          onSwap={onSwap}
        />
      ) : (
        <AllRoundsView rounds={rounds} players={players} settings={settings} teams={teams} />
      )}
    </>
  );
}
