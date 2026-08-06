import { useEffect, useState, type FormEvent } from 'react';
import './App.css';
import { Leaderboard } from './components/Leaderboard';
import { PickleballLogo } from './components/PickleballLogo';
import { PlayerForm } from './components/PlayerForm';
import { PlayerList } from './components/PlayerList';
import { PlayerStats } from './components/PlayerStats';
import { RoundsPage } from './components/RoundsPage';
import { ThemeToggle } from './components/ThemeToggle';
import { TournamentSetup } from './components/TournamentSetup';
import { usePlayers } from './hooks/usePlayers';
import { useTheme } from './hooks/useTheme';
import { useTournament } from './hooks/useTournament';
import { canGenerateRound } from './utils/tournament';

type View = 'setup' | 'rounds' | 'results';

function App() {
  const { players, addPlayer, addPlayersBulk, updatePlayer, removePlayer } = usePlayers();
  const { settings, updateSettings, rounds, plannedRounds, nextRound, startSession, setMatchScore, resetTournament } =
    useTournament();
  const { theme, toggleTheme } = useTheme();
  const [view, setView] = useState<View>(rounds.length > 0 ? 'rounds' : 'setup');
  const [bulkCount, setBulkCount] = useState('');

  const tournamentStarted = rounds.length > 0;
  const reachedRounds = rounds.filter((round) => round.status !== 'upcoming');
  const startCheck = canGenerateRound(players, settings);
  const bulkCountValue = parseInt(bulkCount, 10);
  const resultsLabel = settings.playMode === 'tournament' ? 'Leaderboard' : 'Player Stats';

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
    startSession(players);
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
      'Reset the tournament? This clears all rounds and match results. Players and settings are kept.',
    );
    if (confirmed) {
      resetTournament();
      setView('setup');
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
            Rounds
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
            Reset Tournament
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
              <h2>Players ({players.length})</h2>
              <PlayerList players={players} onUpdate={updatePlayer} onRemove={removePlayer} />
            </section>
          </div>

          <TournamentSetup settings={settings} onChange={updateSettings} playerCount={players.length} />

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

      {view === 'rounds' && tournamentStarted && (
        <RoundsPage
          players={players}
          settings={settings}
          rounds={rounds}
          plannedRounds={plannedRounds}
          onNextRound={() => nextRound(players)}
          onFinishSession={handleFinishSession}
          onSetScore={setMatchScore}
        />
      )}

      {view === 'results' &&
        tournamentStarted &&
        // Stats only reflect rounds actually reached (current/completed) —
        // Social Play pre-generates "upcoming" rounds it hasn't played yet,
        // and those shouldn't count toward byes/games-played/etc.
        (settings.playMode === 'tournament' ? (
          <Leaderboard players={players} rounds={reachedRounds} />
        ) : (
          <PlayerStats players={players} rounds={reachedRounds} settings={settings} />
        ))}
    </div>
  );
}

export default App;
