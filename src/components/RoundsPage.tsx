import { useState } from 'react';
import type { Player, Round, TournamentSettings } from '../types';
import { AllRoundsView } from './AllRoundsView';
import { CurrentRoundView } from './CurrentRoundView';

type RoundsSubView = 'current' | 'all';

interface RoundsPageProps {
  players: Player[];
  settings: TournamentSettings;
  rounds: Round[];
  plannedRounds: number | null;
  onNextRound: () => void;
  onFinishSession: () => void;
  onSetScore: (roundId: string, matchId: string, scoreA: number, scoreB: number) => void;
}

// Parent for the "Rounds" tab: a Current Round / All Rounds toggle above
// either the live round (CurrentRoundView) or the full round-by-round list
// (AllRoundsView). Both read the same `rounds` prop — there's no separate
// history state to keep in sync. Always opens on Current Round: App.tsx
// only renders this component while the Rounds tab is selected, so it
// remounts (and this state resets) every time the tab is entered.
export function RoundsPage({
  players,
  settings,
  rounds,
  plannedRounds,
  onNextRound,
  onFinishSession,
  onSetScore,
}: RoundsPageProps) {
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

      {subView === 'current' ? (
        <CurrentRoundView
          players={players}
          settings={settings}
          rounds={rounds}
          plannedRounds={plannedRounds}
          onNextRound={onNextRound}
          onFinishSession={onFinishSession}
          onSetScore={onSetScore}
        />
      ) : (
        <AllRoundsView rounds={rounds} players={players} settings={settings} />
      )}
    </>
  );
}
