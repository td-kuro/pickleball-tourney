import './App.css';
import { Leaderboard } from './components/Leaderboard';
import { PlayerForm } from './components/PlayerForm';
import { PlayerList } from './components/PlayerList';
import { RoundView } from './components/RoundView';
import { TournamentSetup } from './components/TournamentSetup';
import { usePlayers } from './hooks/usePlayers';
import { useTournament } from './hooks/useTournament';

function App() {
  const { players, addPlayer, updatePlayer, removePlayer } = usePlayers();
  const { settings, updateSettings, rounds, generateRound, setMatchScore } = useTournament();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Pickleball Tourney</h1>
        <p className="subtitle">Set up your players, then generate tournament rounds.</p>
      </header>

      <section className="card">
        <h2>Add Player</h2>
        <PlayerForm submitLabel="Add Player" onSubmit={addPlayer} />
      </section>

      <section className="card">
        <h2>Players ({players.length})</h2>
        <PlayerList players={players} onUpdate={updatePlayer} onRemove={removePlayer} />
      </section>

      <TournamentSetup settings={settings} onChange={updateSettings} playerCount={players.length} />

      <RoundView
        players={players}
        settings={settings}
        rounds={rounds}
        onGenerateRound={() => generateRound(players)}
        onSetScore={setMatchScore}
      />

      <Leaderboard players={players} rounds={rounds} />
    </div>
  );
}

export default App;
