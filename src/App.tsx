import './App.css';
import { PlayerForm } from './components/PlayerForm';
import { PlayerList } from './components/PlayerList';
import { RoundsSection } from './components/RoundsSection';
import { RulesSection } from './components/RulesSection';
import { usePlayers } from './hooks/usePlayers';

function App() {
  const { players, addPlayer, updatePlayer, removePlayer } = usePlayers();

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

      <RulesSection />
      <RoundsSection playerCount={players.length} />
    </div>
  );
}

export default App;
