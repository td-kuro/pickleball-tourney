import { useEffect, useState, type FormEvent } from 'react';
import './App.css';
import { FinalResults } from './components/FinalResults';
import { Leaderboard } from './components/Leaderboard';
import { PickleballLogo } from './components/PickleballLogo';
import { PlayerForm } from './components/PlayerForm';
import { PlayerList } from './components/PlayerList';
import { PlayerStats } from './components/PlayerStats';
import { PoolsKnockoutPage } from './components/PoolsKnockoutPage';
import { RoundsPage } from './components/RoundsPage';
import { ThemeToggle } from './components/ThemeToggle';
import { TournamentSetup } from './components/TournamentSetup';
import { usePlayers } from './hooks/usePlayers';
import { usePoolsKnockout } from './hooks/usePoolsKnockout';
import { useTheme } from './hooks/useTheme';
import { useTournament } from './hooks/useTournament';
import { validatePoolsKnockoutSetup } from './utils/poolsKnockout';
import { canGenerateRound } from './utils/tournament';

type View = 'setup' | 'rounds' | 'results';

function App() {
  const { players, addPlayer, addPlayersBulk, updatePlayer, removePlayer, removeAllPlayers } = usePlayers();
  const { settings, updateSettings, rounds, plannedRounds, nextRound, startSession, setMatchScore, resetTournament } =
    useTournament();
  const poolsKnockout = usePoolsKnockout();
  const { theme, toggleTheme } = useTheme();
  const isPoolsKnockout = settings.playMode === 'tournament' && settings.tournamentFormat === 'pools-knockout';
  const [view, setView] = useState<View>(rounds.length > 0 || poolsKnockout.stage !== 'setup' ? 'rounds' : 'setup');
  const [bulkCount, setBulkCount] = useState('');

  const tournamentStarted = isPoolsKnockout ? poolsKnockout.stage !== 'setup' : rounds.length > 0;
  const reachedRounds = rounds.filter((round) => round.status !== 'upcoming');
  const startCheck = isPoolsKnockout ? validatePoolsKnockoutSetup(players, settings) : canGenerateRound(players, settings);
  const bulkCountValue = parseInt(bulkCount, 10);
  const resultsLabel = isPoolsKnockout ? 'Final Results' : settings.playMode === 'tournament' ? 'Leaderboard' : 'Player Stats';
  const tournamentLabel = isPoolsKnockout ? 'Tournament' : 'Rounds';
  const isSocial = settings.playMode === 'social';
  const resetLabel = isSocial ? 'Reset Social Play' : 'Reset Tournament';

  // Defense in depth: Rounds / results are only ever reachable once Start
  // Matches has actually run (rounds.length > 0). If `view` ever ends up on
  // one of those without an active tournament — e.g. leftover state — snap
  // back to Setup instead of rendering a broken screen.
  useEffect(() => {
    if (view !== 'setup' && !tournamentStarted) {
      setView('setup');
    }
  }, [view, tournamentStarted]);

  function handleStartMatches() {
    if (isPoolsKnockout) {
      poolsKnockout.startPoolStage(players, settings);
    } else {
      startSession(players);
    }
    setView('rounds');
  }

  function handleFinishSession() {
    setView('results');
  }

  function handleGenerateSlots(event: FormEvent) {
    event.preventDefault();
    if (Number.isNaN(bulkCountValue) || bulkCountValue < 1) return;
    addPlayersBulk(bulkCountValue);
    setBulkCount('');
  }

  function handleReset() {
    const confirmed = window.confirm(
      isSocial
        ? 'Are you sure you want to reset Social Play? This will clear all players, rounds, scores, and stats.'
        : 'Are you sure you want to reset the tournament? This will clear all players, rounds, scores, and stats.',
    );
    if (confirmed) {
      resetTournament();
      poolsKnockout.resetPoolsKnockout();
      removeAllPlayers();
      setView('setup');
    }
  }

  function handleRemoveAllPlayers() {
    if (window.confirm('Are you sure you want to remove all players?')) {
      removeAllPlayers();
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <div className="brand">
            <PickleballLogo size={40} />
            <div>
              <h1>PickleRounds</h1>
              <p className="subtitle">Fair pickleball rounds for social play and tournaments.</p>
            </div>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
        <div className="brand-bar" aria-hidden="true" />
      </header>

      <div className="tab-bar">
        <nav className="tabs" aria-label="View">
          <button type="button" className={view === 'setup' ? 'tab active' : 'tab'} onClick={() => setView('setup')}>
            Setup
          </button>
          <button
            type="button"
            className={view === 'rounds' ? 'tab active' : 'tab'}
            onClick={() => setView('rounds')}
            disabled={!tournamentStarted}
          >
            {tournamentLabel}
          </button>
          <button
            type="button"
            className={view === 'results' ? 'tab active' : 'tab'}
            onClick={() => setView('results')}
            disabled={!tournamentStarted}
          >
            {resultsLabel}
          </button>
        </nav>

        {tournamentStarted && (
          <button type="button" className="reset-button" onClick={handleReset}>
            {resetLabel}
          </button>
        )}
      </div>

      {view === 'setup' && (
        <div className="setup-view">
          <div className="setup-grid">
            <section className="card">
              <h2>Add Player</h2>
              <PlayerForm onSubmit={addPlayer} />

              <div className="bulk-add">
                <p className="bulk-add-label">Or generate multiple player slots</p>
                <form className="bulk-add-form" onSubmit={handleGenerateSlots}>
                  <input
                    type="number"
                    min={1}
                    value={bulkCount}
                    onChange={(event) => setBulkCount(event.target.value)}
                    placeholder="e.g. 12"
                    aria-label="Number of players to generate"
                  />
                  <button type="submit" className="secondary" disabled={Number.isNaN(bulkCountValue) || bulkCountValue < 1}>
                    Generate Player Slots
                  </button>
                </form>
              </div>
            </section>

            <section className="card">
              <div className="section-heading-row">
                <h2>Players ({players.length})</h2>
                {players.length > 0 && (
                  <button type="button" className="danger" onClick={handleRemoveAllPlayers}>
                    Remove All Players
                  </button>
                )}
              </div>
              <PlayerList players={players} onUpdate={updatePlayer} onRemove={removePlayer} />
            </section>
          </div>

          <TournamentSetup
            settings={settings}
            onChange={updateSettings}
            playerCount={players.length}
            tournamentInProgress={tournamentStarted}
          />

          <section className="card start-matches-card">
            {!tournamentStarted ? (
              <>
                <button
                  type="button"
                  className="cta-button start-button"
                  onClick={handleStartMatches}
                  disabled={!startCheck.ok}
                >
                  Start Matches
                </button>
                {!startCheck.ok && <p className="hint error">{startCheck.reason}</p>}
              </>
            ) : (
              <button type="button" className="cta-button start-button" onClick={() => setView('rounds')}>
                Go to Rounds
              </button>
            )}
          </section>
        </div>
      )}

      {view === 'rounds' &&
        tournamentStarted &&
        (isPoolsKnockout ? (
          <PoolsKnockoutPage
            teams={poolsKnockout.teams}
            pools={poolsKnockout.pools}
            bracket={poolsKnockout.bracket}
            stage={poolsKnockout.stage}
            teamsAdvancingPerPool={settings.poolKnockoutSettings.teamsAdvancingPerPool}
            onSetPoolMatchScore={poolsKnockout.setPoolMatchScore}
            onAdvanceToKnockout={() => poolsKnockout.advanceToKnockout(settings.poolKnockoutSettings.teamsAdvancingPerPool)}
            onSetKnockoutScore={poolsKnockout.setKnockoutMatchScore}
          />
        ) : (
          <RoundsPage
            players={players}
            settings={settings}
            rounds={rounds}
            plannedRounds={plannedRounds}
            onNextRound={() => nextRound(players)}
            onFinishSession={handleFinishSession}
            onSetScore={setMatchScore}
          />
        ))}

      {view === 'results' &&
        tournamentStarted &&
        (isPoolsKnockout ? (
          <FinalResults
            teams={poolsKnockout.teams}
            pools={poolsKnockout.pools}
            bracket={poolsKnockout.bracket}
            teamsAdvancingPerPool={settings.poolKnockoutSettings.teamsAdvancingPerPool}
          />
        ) : settings.playMode === 'tournament' ? (
          // Stats only reflect rounds actually reached (current/completed)
          // — Social Play pre-generates "upcoming" rounds it hasn't played
          // yet, and those shouldn't count toward byes/games-played/etc.
          <Leaderboard players={players} rounds={reachedRounds} />
        ) : (
          <PlayerStats players={players} rounds={reachedRounds} settings={settings} />
        ))}
    </div>
  );
}

export default App;
