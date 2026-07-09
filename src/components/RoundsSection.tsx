interface RoundsSectionProps {
  playerCount: number;
}

const MIN_PLAYERS_TO_START = 4;

// Placeholder for the future round-generation feature. Once the
// tournament engine (src/engine/tournamentEngine.ts) is implemented,
// this button will call it to create and display the next round.
export function RoundsSection({ playerCount }: RoundsSectionProps) {
  const readyToGenerate = playerCount >= MIN_PLAYERS_TO_START;

  return (
    <section className="card placeholder-section">
      <h2>Generate Rounds</h2>
      <p>
        {readyToGenerate
          ? `Ready to generate rounds for ${playerCount} players.`
          : `Add at least ${MIN_PLAYERS_TO_START} players to generate rounds.`}
      </p>
      <button type="button" disabled title="Coming soon">
        Generate First Round
      </button>
    </section>
  );
}
