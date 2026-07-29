import { useState } from 'react';
import './App.css';
import { ByeList } from './components/ByeList';
import { Leaderboard } from './components/Leaderboard';
import { PlayerForm } from './components/PlayerForm';
import { PlayerList } from './components/PlayerList';
import { RoundView } from './components/RoundView';
import { TournamentSetup } from './components/TournamentSetup';
import { usePlayers } from './hooks/usePlayers';
import { useTournament } from './hooks/useTournament';
import { canGenerateRound } from './utils/tournament';

type View = 'setup' | 'round';

function App() {
  const { players, addPlayer, updatePlayer, removePlayer } = usePlayers();
  const { settings, updateSettings, rounds, generateRound, setMatchScore } = useTournament();
  const [view, setView] = useState<View>(rounds.length > 0 ? 'round' : 'setup');

  const currentRound = rounds[rounds.length - 1];
  const startCheck = canGenerateRound(players, settings);

  function handleStartMatches() {
    generateRound(players);
    setView('round');
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Pickleball Tourney</h1>
        <p className="subtitle">Set up your players, then run rounds and track the leaderboard.</p>
      </header>

      <nav className="tabs" aria-label="View">
        <button
          type="button"
          className={view === 'setup' ? 'tab active' : 'tab'}
          onClick={() => setView('setup')}
        >
          Setup
        </button>
        <button
          type="button"
          className={view === 'round' ? 'tab active' : 'tab'}
          onClick={() => setView('round')}
          disabled={rounds.length === 0}
        >
          Current Round
        </button>
      </nav>

      {view === 'setup' && (
        <div className="setup-view">
          <div className="setup-grid">
            <section className="card">
              <h2>Add Player</h2>
              <PlayerForm submitLabel="Add Player" onSubmit={addPlayer} />
            </section>

            <section className="card">
              <h2>Players ({players.length})</h2>
              <PlayerList players={players} onUpdate={updatePlayer} onRemove={removePlayer} />
            </section>
          </div>

          <TournamentSetup settings={settings} onChange={updateSettings} playerCount={players.length} />

          <section className="card start-matches-card">
            {rounds.length === 0 ? (
              <>
                <button
                  type="button"
                  className="start-button"
                  onClick={handleStartMatches}
                  disabled={!startCheck.ok}
                >
                  Start Matches
                </button>
                {!startCheck.ok && <p className="hint error">{startCheck.reason}</p>}
              </>
            ) : (
              <button type="button" className="start-button" onClick={() => setView('round')}>
                Go to Current Round
              </button>
            )}
          </section>
        </div>
      )}

      {view === 'round' && (
        <div className="round-grid">
          <div className="round-main">
            <RoundView
              players={players}
              settings={settings}
              rounds={rounds}
              onGenerateRound={() => generateRound(players)}
              onSetScore={setMatchScore}
            />
            {currentRound && <ByeList round={currentRound} players={players} />}
          </div>

          <Leaderboard players={players} rounds={rounds} />
        </div>
      )}
    </div>
  );
}

export default App;
