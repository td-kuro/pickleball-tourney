import { useEffect, useState } from 'react';
import './App.css';
import { CourtSeeding } from './components/CourtSeeding';
import { DynamicPairingRankings } from './components/DynamicPairingRankings';
import { DynamicPairingRestingPlayers } from './components/DynamicPairingRestingPlayers';
import { DynamicPairingRoundsPage } from './components/DynamicPairingRoundsPage';
import { DynamicPairingSessionHistory } from './components/DynamicPairingSessionHistory';
import { DynamicPairingSetup } from './components/DynamicPairingSetup';
import { FinalResults } from './components/FinalResults';
import { FixedTeamResults } from './components/FixedTeamResults';
import { KingCourtCycleHistory } from './components/KingCourtCycleHistory';
import { KingCourtRoundsPage } from './components/KingCourtRoundsPage';
import { KingCourtSetup } from './components/KingCourtSetup';
import { KingCourtStandings } from './components/KingCourtStandings';
import { Leaderboard } from './components/Leaderboard';
import { PickleballLogo } from './components/PickleballLogo';
import { PlayerStats } from './components/PlayerStats';
import { PoolsKnockoutPage } from './components/PoolsKnockoutPage';
import { RosterSetup } from './components/RosterSetup';
import { RoundsPage } from './components/RoundsPage';
import { ThemeToggle } from './components/ThemeToggle';
import { SocialSessionSetup, TournamentSetup } from './components/TournamentSetup';
import { useDynamicPairingSocial } from './hooks/useDynamicPairingSocial';
import { useKingCourt } from './hooks/useKingCourt';
import { usePlayers } from './hooks/usePlayers';
import { usePoolsKnockout } from './hooks/usePoolsKnockout';
import { useTeams } from './hooks/useTeams';
import { useTheme } from './hooks/useTheme';
import { useTournament } from './hooks/useTournament';
import { validatePoolsKnockoutSetup } from './utils/poolsKnockout';
import { canGenerateRound, isFixedTeamsMode } from './utils/tournament';

type View =
  | 'setup'
  | 'rounds'
  | 'results'
  | 'kc-court'
  | 'kc-standings'
  | 'kc-history'
  | 'dp-rounds'
  | 'dp-rankings'
  | 'dp-resting'
  | 'dp-history';
const KING_COURT_VIEWS: View[] = ['setup', 'kc-court', 'kc-standings', 'kc-history'];
const STANDARD_VIEWS: View[] = ['setup', 'rounds', 'results'];
const DYNAMIC_PAIRING_VIEWS: View[] = ['setup', 'dp-rounds', 'dp-rankings', 'dp-resting', 'dp-history'];

function App() {
  const { players, addPlayer, addPlayersBulk, updatePlayer, removePlayer, removeAllPlayers } = usePlayers();
  const { teams, teamPlayers, addTeam, updateTeam, removeTeam, removeAllTeams } = useTeams();
  const { settings, updateSettings, rounds, plannedRounds, nextRound, startSession, setMatchScore, resetTournament } =
    useTournament();
  const poolsKnockout = usePoolsKnockout();
  const kingCourt = useKingCourt();
  const dynamicPairing = useDynamicPairingSocial();
  const { theme, toggleTheme } = useTheme();
  const isPoolsKnockout = settings.playMode === 'tournament' && settings.tournamentFormat === 'pools-knockout';
  const isKingCourt = settings.playMode === 'king-court-5';
  // Dynamic Pairing Social is a Social Format (see SocialFormat in
  // types.ts), not its own PlayMode — see TournamentSetup's Social Format
  // toggle. It has its own roster/settings/rounds entirely (useDynamicPairingSocial)
  // rather than reusing usePlayers/useTeams/useTournament, so it can't affect
  // any other mode's data.
  const isDynamicPairingSocial = settings.playMode === 'social' && settings.socialFormat === 'dynamic-pairing-social';
  // Pools & Knockout still needs an exclusive choice between auto-paired
  // players and declared teams (see formTeams/usePoolsKnockout) — that's
  // still settings.doublesPairingMode, unaffected by the rest of this.
  const isPoolsKnockoutFixedTeams = isFixedTeamsMode(settings);
  // Leaderboard/Social Play Doubles, by contrast, let Add Player and Add
  // Team be used together (see ParticipantSetup) — so "fixed teams only"
  // and "mixed" are just two of the three shapes the roster can take
  // there, not an exclusive mode switch. `isDoublesFixedOnly` keeps the
  // original Fixed Teams-only behaviour (Team Leaderboard/Dedicated
  // Pairing Stats — see FixedTeamResults) for the common case where no
  // individual players were added at all.
  const isDoublesFixedOnly = !isPoolsKnockout && settings.matchType === 'doubles' && teams.length > 0 && players.length === 0;
  const isMixedDoubles = !isPoolsKnockout && settings.matchType === 'doubles' && teams.length > 0 && players.length > 0;
  const isFixedTeams = isDoublesFixedOnly;
  // Whichever roster the current mode actually plays with: individual
  // players for Singles/Rotating Doubles, the players embedded in each
  // fixed team for Doubles + Fixed Teams-only, or the union of both for
  // mixed Doubles (every human who can take the court, regardless of
  // whether they came from the player list or a declared team — see
  // canGenerateRound/generateMixedDoublesRound) — see useTeams and
  // utils/pairing.ts. Pools & Knockout keeps its own separate exclusive
  // logic. King Court always uses the plain player list (see
  // KingCourtSetup).
  const effectivePlayers = isPoolsKnockout
    ? isPoolsKnockoutFixedTeams
      ? teamPlayers
      : players
    : isDoublesFixedOnly
      ? teamPlayers
      : isMixedDoubles
        ? [...players, ...teamPlayers]
        : players;
  const [view, setView] = useState<View>(
    isKingCourt
      ? kingCourt.started
        ? 'kc-court'
        : 'setup'
      : isDynamicPairingSocial
        ? dynamicPairing.started
          ? 'dp-rounds'
          : 'setup'
        : rounds.length > 0 || poolsKnockout.stage !== 'setup'
          ? 'rounds'
          : 'setup',
  );

  const started = isKingCourt
    ? kingCourt.started
    : isDynamicPairingSocial
      ? dynamicPairing.started
      : isPoolsKnockout
        ? poolsKnockout.stage !== 'setup'
        : rounds.length > 0;
  const reachedRounds = rounds.filter((round) => round.status !== 'upcoming');
  const startCheck = isPoolsKnockout
    ? validatePoolsKnockoutSetup(effectivePlayers, settings, teams)
    : canGenerateRound(effectivePlayers, settings, undefined, teams);
  const resultsLabel = isPoolsKnockout
    ? 'Final Results'
    : isFixedTeams
      ? settings.playMode === 'tournament'
        ? 'Team Leaderboard'
        : 'Pairing Stats'
      : settings.playMode === 'tournament'
        ? 'Leaderboard'
        : 'Player Stats';
  const tournamentLabel = isPoolsKnockout ? 'Tournament' : 'Rounds';
  const isSocial = settings.playMode === 'social';
  const resetLabel = isKingCourt
    ? 'Reset King Court'
    : isDynamicPairingSocial
      ? 'Reset Dynamic Pairing Social'
      : isSocial
        ? 'Reset Social Play'
        : 'Reset Tournament';

  // Defense in depth: Rounds / results (or, in King Court Mode, King
  // Court / Standings / Cycle History; or, in Dynamic Pairing Social,
  // Rounds / Rankings / Resting Players / Session History) are only ever
  // reachable once matches have actually started for the current mode. If
  // `view` ever ends up on a screen that doesn't belong to the current
  // mode (e.g. the Play Mode/Social Format was switched mid-session) or
  // without an active session/cycle — e.g. leftover state — snap back to
  // Setup instead of rendering a broken screen.
  useEffect(() => {
    const validViews = isKingCourt ? KING_COURT_VIEWS : isDynamicPairingSocial ? DYNAMIC_PAIRING_VIEWS : STANDARD_VIEWS;
    if (!validViews.includes(view) || (view !== 'setup' && !started)) {
      setView('setup');
    }
  }, [view, started, isKingCourt, isDynamicPairingSocial]);

  function handleStartMatches() {
    if (isPoolsKnockout) {
      poolsKnockout.startPoolStage(players, settings, teams);
    } else {
      startSession(players, teams, teamPlayers);
    }
    setView('rounds');
  }

  function handleFinishSession() {
    setView('results');
  }

  function handleReset() {
    const confirmed = window.confirm(
      isKingCourt
        ? 'Are you sure you want to reset King Court? This will clear all players, court assignments, cycles, scores, and stats.'
        : isDynamicPairingSocial
          ? 'Are you sure you want to reset Dynamic Pairing Social? This will clear all players, settings, rounds, scores, rankings, and rest history.'
          : isSocial
            ? 'Are you sure you want to reset Social Play? This will clear all players, teams, rounds, scores, and stats.'
            : 'Are you sure you want to reset the tournament? This will clear all players, teams, rounds, scores, and stats.',
    );
    if (confirmed) {
      resetTournament();
      poolsKnockout.resetPoolsKnockout();
      kingCourt.resetKingCourt();
      dynamicPairing.resetDynamicPairing();
      removeAllPlayers();
      removeAllTeams();
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
          {isKingCourt ? (
            <>
              <button
                type="button"
                className={view === 'kc-court' ? 'tab active' : 'tab'}
                onClick={() => setView('kc-court')}
                disabled={!started}
              >
                Rounds
              </button>
              <button
                type="button"
                className={view === 'kc-standings' ? 'tab active' : 'tab'}
                onClick={() => setView('kc-standings')}
                disabled={!started}
              >
                Standings
              </button>
              <button
                type="button"
                className={view === 'kc-history' ? 'tab active' : 'tab'}
                onClick={() => setView('kc-history')}
                disabled={!started}
              >
                Cycle History
              </button>
            </>
          ) : isDynamicPairingSocial ? (
            <>
              <button
                type="button"
                className={view === 'dp-rounds' ? 'tab active' : 'tab'}
                onClick={() => setView('dp-rounds')}
                disabled={!started}
              >
                Rounds
              </button>
              <button
                type="button"
                className={view === 'dp-rankings' ? 'tab active' : 'tab'}
                onClick={() => setView('dp-rankings')}
                disabled={!started}
              >
                Rankings
              </button>
              <button
                type="button"
                className={view === 'dp-resting' ? 'tab active' : 'tab'}
                onClick={() => setView('dp-resting')}
                disabled={!started}
              >
                Resting Players
              </button>
              <button
                type="button"
                className={view === 'dp-history' ? 'tab active' : 'tab'}
                onClick={() => setView('dp-history')}
                disabled={!started}
              >
                Session History
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={view === 'rounds' ? 'tab active' : 'tab'}
                onClick={() => setView('rounds')}
                disabled={!started}
              >
                {tournamentLabel}
              </button>
              <button
                type="button"
                className={view === 'results' ? 'tab active' : 'tab'}
                onClick={() => setView('results')}
                disabled={!started}
              >
                {resultsLabel}
              </button>
            </>
          )}
        </nav>

        {started && (
          <button type="button" className="reset-button" onClick={handleReset}>
            {resetLabel}
          </button>
        )}
      </div>

      {view === 'setup' && (
        <div className="setup-view">
          <TournamentSetup
            settings={settings}
            onChange={updateSettings}
            rosterCount={isFixedTeams ? teams.length : players.length}
            tournamentInProgress={started}
          />

          {isKingCourt ? (
            <>
              <KingCourtSetup
                players={players}
                onAddPlayer={addPlayer}
                onAddPlayersBulk={addPlayersBulk}
                onUpdatePlayer={updatePlayer}
                onRemovePlayer={removePlayer}
                onRemoveAllPlayers={removeAllPlayers}
                numberOfCourts={kingCourt.numberOfCourts}
                onNumberOfCourtsChange={(courts) => {
                  kingCourt.setNumberOfCourts(courts);
                  kingCourt.pruneAssignments(players);
                }}
                locked={kingCourt.started}
              />

              {!kingCourt.started && (
                <CourtSeeding
                  players={players}
                  numberOfCourts={kingCourt.numberOfCourts}
                  assignments={kingCourt.assignments}
                  onAssign={kingCourt.assignPlayerToCourt}
                  onReorderInCourt={kingCourt.reorderPlayerInCourt}
                  onStartCycle1={() => {
                    kingCourt.startCycle1(players);
                    setView('kc-court');
                  }}
                />
              )}

              {kingCourt.started && (
                <section className="card start-matches-card">
                  <button type="button" className="cta-button start-button" onClick={() => setView('kc-court')}>
                    Go to King Court
                  </button>
                </section>
              )}
            </>
          ) : isDynamicPairingSocial ? (
            <DynamicPairingSetup
              settings={dynamicPairing.settings}
              onChangeSettings={dynamicPairing.updateSettings}
              players={dynamicPairing.players}
              onAddPlayer={dynamicPairing.addPlayer}
              onUpdatePlayer={dynamicPairing.updatePlayer}
              onUpdatePlayerSkillLevel={dynamicPairing.updatePlayerSkillLevel}
              onRemovePlayer={dynamicPairing.removePlayer}
              onRemoveAllPlayers={dynamicPairing.removeAllPlayers}
              onStartSession={() => {
                dynamicPairing.startSession();
                setView('dp-rounds');
              }}
              started={dynamicPairing.started}
              gradingPhaseComplete={dynamicPairing.gradingPhaseComplete}
              onGoToRounds={() => setView('dp-rounds')}
            />
          ) : (
            <>
              <RosterSetup
                settings={settings}
                players={players}
                onAddPlayer={addPlayer}
                onAddPlayersBulk={addPlayersBulk}
                onUpdatePlayer={updatePlayer}
                onRemovePlayer={removePlayer}
                onRemoveAllPlayers={removeAllPlayers}
                teams={teams}
                teamPlayers={teamPlayers}
                onAddTeam={addTeam}
                onUpdateTeam={updateTeam}
                onRemoveTeam={removeTeam}
                onRemoveAllTeams={removeAllTeams}
              />

              {settings.playMode === 'social' && <SocialSessionSetup settings={settings} onChange={updateSettings} />}

              <section className="card start-matches-card">
                {!started ? (
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
            </>
          )}
        </div>
      )}

      {view === 'kc-court' && kingCourt.started && kingCourt.currentCycle && (
        <KingCourtRoundsPage
          players={players}
          numberOfCourts={kingCourt.numberOfCourts}
          cycles={kingCourt.cycles}
          currentCycle={kingCourt.currentCycle}
          onSetGameScore={kingCourt.setGameScore}
          onAdvanceGame={kingCourt.advanceGame}
          onSetManualTiebreakOrder={kingCourt.setManualTiebreakOrder}
          onSetManualMovementOverride={kingCourt.setManualMovementOverride}
          onConfirmMovement={() => kingCourt.confirmMovementAndAdvance(players)}
        />
      )}

      {view === 'kc-standings' && <KingCourtStandings players={players} cycles={kingCourt.cycles} />}

      {view === 'kc-history' && <KingCourtCycleHistory players={players} cycles={kingCourt.cycles} />}

      {view === 'dp-rounds' && started && (
        <DynamicPairingRoundsPage
          rounds={dynamicPairing.rounds}
          currentRound={dynamicPairing.currentRound}
          players={dynamicPairing.players}
          onSetScore={(courtNumber, score1, score2) => {
            if (!dynamicPairing.currentRound) return;
            dynamicPairing.setCourtScore(dynamicPairing.currentRound.id, courtNumber, score1, score2);
          }}
          onGenerateNextRound={dynamicPairing.generateNextRound}
        />
      )}

      {view === 'dp-rankings' && started && (
        <DynamicPairingRankings players={dynamicPairing.players} rounds={dynamicPairing.rounds} />
      )}

      {view === 'dp-resting' && started && (
        <DynamicPairingRestingPlayers players={dynamicPairing.players} rounds={dynamicPairing.rounds} />
      )}

      {view === 'dp-history' && started && (
        <DynamicPairingSessionHistory settings={dynamicPairing.settings} rounds={dynamicPairing.rounds} />
      )}

      {view === 'rounds' &&
        started &&
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
            players={effectivePlayers}
            settings={settings}
            rounds={rounds}
            plannedRounds={plannedRounds}
            onNextRound={() => nextRound(players, teams, teamPlayers)}
            onFinishSession={handleFinishSession}
            onSetScore={setMatchScore}
            teams={teams}
          />
        ))}

      {view === 'results' &&
        started &&
        (isPoolsKnockout ? (
          <FinalResults
            teams={poolsKnockout.teams}
            pools={poolsKnockout.pools}
            bracket={poolsKnockout.bracket}
            teamsAdvancingPerPool={settings.poolKnockoutSettings.teamsAdvancingPerPool}
          />
        ) : isFixedTeams ? (
          <FixedTeamResults teams={teams} rounds={reachedRounds} settings={settings} />
        ) : settings.playMode === 'tournament' ? (
          // Stats only reflect rounds actually reached (current/completed)
          // — Social Play pre-generates "upcoming" rounds it hasn't played
          // yet, and those shouldn't count toward byes/games-played/etc.
          <Leaderboard players={effectivePlayers} rounds={reachedRounds} />
        ) : (
          <PlayerStats players={effectivePlayers} rounds={reachedRounds} settings={settings} />
        ))}
    </div>
  );
}

export default App;
