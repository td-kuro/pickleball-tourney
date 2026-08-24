import { useEffect, useState } from 'react';
import './App.css';
import type { PlayerAvailabilityStatus } from './types';
import { CourtSeeding } from './components/CourtSeeding';
import { DynamicPairingRankings } from './components/DynamicPairingRankings';
import { DynamicPairingRestingPlayers } from './components/DynamicPairingRestingPlayers';
import { DynamicPairingRoundsPage } from './components/DynamicPairingRoundsPage';
import { DynamicPairingSessionHistory } from './components/DynamicPairingSessionHistory';
import { DynamicPairingSetup } from './components/DynamicPairingSetup';
import { DynamicTeamQualifierFinalResults } from './components/DynamicTeamQualifierFinalResults';
import { DynamicTeamQualifierMedalBracket } from './components/DynamicTeamQualifierMedalBracket';
import { DynamicTeamQualifierRoundsPage } from './components/DynamicTeamQualifierRoundsPage';
import { DynamicTeamQualifierSetup } from './components/DynamicTeamQualifierSetup';
import { DynamicTeamQualifierStandings } from './components/DynamicTeamQualifierStandings';
import { DynamicTeamRoster } from './components/DynamicTeamRoster';
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
import { SessionControls } from './components/SessionControls';
import { ThemeToggle } from './components/ThemeToggle';
import { NumberOfCourtsSetup, SocialSessionSetup, TournamentSetup } from './components/TournamentSetup';
import { useDynamicPairingSocial } from './hooks/useDynamicPairingSocial';
import { useDynamicTeamQualifier } from './hooks/useDynamicTeamQualifier';
import { useKingCourt } from './hooks/useKingCourt';
import { usePlayers } from './hooks/usePlayers';
import { usePoolsKnockout } from './hooks/usePoolsKnockout';
import { useTeams } from './hooks/useTeams';
import { useTheme } from './hooks/useTheme';
import { useTournament } from './hooks/useTournament';
import { validatePoolsKnockoutSetup } from './utils/poolsKnockout';
import { canGenerateRound, playersNeededPerMatch, revertRestingPlayers } from './utils/tournament';

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
  | 'dp-history'
  | 'dtq-rounds'
  | 'dtq-standings'
  | 'dtq-bracket'
  | 'dtq-results';
const KING_COURT_VIEWS: View[] = ['setup', 'kc-court', 'kc-standings', 'kc-history'];
const STANDARD_VIEWS: View[] = ['setup', 'rounds', 'results'];
const DYNAMIC_PAIRING_VIEWS: View[] = ['setup', 'dp-rounds', 'dp-rankings', 'dp-resting', 'dp-history'];
const DYNAMIC_TEAM_QUALIFIER_VIEWS: View[] = ['setup', 'dtq-rounds', 'dtq-standings', 'dtq-bracket', 'dtq-results'];

function App() {
  const {
    players,
    addPlayersBulk,
    setPlayersBulk,
    addExistingPlayers,
    updatePlayer,
    setAvailabilityStatus,
    removePlayer,
    removePlayers,
    removeAllPlayers,
  } = usePlayers();
  const { teams, teamPlayers, addTeamFromPlayers, updateTeamPlayer, removeTeam, removeTeamKeepPlayers, removeAllTeams } =
    useTeams();

  // Promotes two already-added individual players into a fixed team — see
  // ParticipantList's checkbox-select-two-players flow and
  // useTeams.addTeamFromPlayers. A no-op if either id can't be found (e.g.
  // a stale selection after one of the two was removed elsewhere).
  function handleMakeTeam(player1Id: string, player2Id: string) {
    const player1 = players.find((p) => p.id === player1Id);
    const player2 = players.find((p) => p.id === player2Id);
    if (!player1 || !player2) return;
    addTeamFromPlayers(player1, player2);
    removePlayers([player1Id, player2Id]);
  }

  // Undoes handleMakeTeam — see ParticipantList's "Split Team" button and
  // useTeams.removeTeamKeepPlayers.
  function handleUnmakeTeam(teamId: string) {
    const result = removeTeamKeepPlayers(teamId);
    if (!result) return;
    addExistingPlayers(result);
  }
  const {
    settings,
    updateSettings,
    rounds,
    plannedRounds,
    nextRound,
    startSession,
    setMatchScore,
    resetTournament,
    sessionAdjustments,
    regenerateFutureRounds,
    regenerateCurrentRound,
    changeCourtCount,
    swapPlayerInCurrentRound,
  } = useTournament();
  const poolsKnockout = usePoolsKnockout();
  const kingCourt = useKingCourt();
  const dynamicPairing = useDynamicPairingSocial();
  const dynamicTeamQualifier = useDynamicTeamQualifier();
  const { theme, toggleTheme } = useTheme();
  const isPoolsKnockout = settings.playMode === 'tournament' && settings.tournamentFormat === 'pools-knockout';
  const isDynamicTeamQualifier = settings.playMode === 'tournament' && settings.tournamentFormat === 'dynamic-team-qualifier';
  const isKingCourt = settings.playMode === 'king-court-5';
  // Dynamic Pairing Social is a Social Format (see SocialFormat in
  // types.ts), not its own PlayMode — see TournamentSetup's Social Format
  // toggle. It has its own roster/settings/rounds entirely (useDynamicPairingSocial)
  // rather than reusing usePlayers/useTeams/useTournament, so it can't affect
  // any other mode's data.
  const isDynamicPairingSocial = settings.playMode === 'social' && settings.socialFormat === 'dynamic-pairing-social';
  // "Social" groups two underlying playMode values — 'social' (Standard
  // Social Play / Dynamic Pairing Social) and 'king-court-5' (5-Player King
  // Court) — same grouping TournamentSetup's Social Format toggle uses.
  // Drives which of the top nav's Tournament/Social buttons is highlighted.
  const isSocialGroup = settings.playMode === 'social' || isKingCourt;
  // Doubles roster shape: "fixed teams only" and "mixed" are two of the
  // three shapes the Participants roster can take (see ParticipantSetup),
  // not an exclusive mode switch. `isDoublesFixedOnly` keeps the original
  // Fixed Teams-only behaviour (Team Leaderboard/Dedicated Pairing Stats —
  // see FixedTeamResults) for the common case where no individual players
  // were added at all. Pools & Knockout also uses the mixed Participants
  // roster now (see RosterSetup), but keeps its own separate labelling —
  // it's never "Team Leaderboard"/"Pairing Stats", so isDoublesFixedOnly
  // stays scoped to Leaderboard/Social Play only.
  const isDoublesFixedOnly = !isPoolsKnockout && settings.matchType === 'doubles' && teams.length > 0 && players.length === 0;
  const isFixedTeams = isDoublesFixedOnly;
  // Whichever roster the current mode actually plays with: individual
  // players for Singles, the players embedded in each fixed team for
  // Doubles + Fixed Teams-only, or the union of both otherwise — every
  // human who can take the court, regardless of whether they came from the
  // player list or a declared team (see canGenerateRound/
  // generateMixedDoublesRound and validatePoolsKnockoutSetup/formTeams,
  // which combine the same way) — see useTeams and utils/pairing.ts. King
  // Court always uses the plain player list (see KingCourtSetup).
  const effectivePlayers = isDoublesFixedOnly ? teamPlayers : [...players, ...teamPlayers];
  // Surfaces confirmMovementAndAdvance's validation failure (e.g. a court
  // left short by an availability change) — see KingCourtManageCourts.
  const [kcConfirmError, setKcConfirmError] = useState<string | null>(null);
  const [view, setView] = useState<View>(
    isKingCourt
      ? kingCourt.started
        ? 'kc-court'
        : 'setup'
      : isDynamicPairingSocial
        ? dynamicPairing.started
          ? 'dp-rounds'
          : 'setup'
        : isDynamicTeamQualifier
          ? dynamicTeamQualifier.started
            ? 'dtq-rounds'
            : 'setup'
          : rounds.length > 0 || poolsKnockout.stage !== 'setup'
            ? 'rounds'
            : 'setup',
  );

  const started = isKingCourt
    ? kingCourt.started
    : isDynamicPairingSocial
      ? dynamicPairing.started
      : isDynamicTeamQualifier
        ? dynamicTeamQualifier.started
        : isPoolsKnockout
          ? poolsKnockout.stage !== 'setup'
          : rounds.length > 0;
  const reachedRounds = rounds.filter((round) => round.status !== 'upcoming');
  const startCheck = isPoolsKnockout
    ? validatePoolsKnockoutSetup(players, settings, teams, teamPlayers)
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
      : isDynamicTeamQualifier
        ? 'Reset Dynamic Team Qualifier'
        : isSocial
          ? 'Reset Social Play'
          : 'Reset Tournament';

  // Defense in depth: Rounds / results (or, in King Court Mode, King
  // Court / Standings / Cycle History; in Dynamic Pairing Social, Rounds /
  // Rankings / Resting Players / Session History; or, in Dynamic Team
  // Qualifier, Rounds / Standings / Medal Bracket / Final Results) are only
  // ever reachable once matches have actually started for the current
  // mode. If `view` ever ends up on a screen that doesn't belong to the
  // current mode (e.g. the Play Mode/Tournament Format was switched
  // mid-session) or without an active session/cycle — e.g. leftover state —
  // snap back to Setup instead of rendering a broken screen.
  useEffect(() => {
    const validViews = isKingCourt
      ? KING_COURT_VIEWS
      : isDynamicPairingSocial
        ? DYNAMIC_PAIRING_VIEWS
        : isDynamicTeamQualifier
          ? DYNAMIC_TEAM_QUALIFIER_VIEWS
          : STANDARD_VIEWS;
    if (!validViews.includes(view) || (view !== 'setup' && !started)) {
      setView('setup');
    }
  }, [view, started, isKingCourt, isDynamicPairingSocial, isDynamicTeamQualifier]);

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

  // Sets the player's status, then immediately regenerates the still-
  // 'upcoming' rounds against the updated roster — computed here rather
  // than read back from `players` state (which won't reflect the change
  // until the next render) so the two stay in sync within one click. Only
  // ever wired up for Standard Social Play (see SessionControls,
  // CurrentRoundView's PlayerActionMenu) — Tournament Mode never calls
  // this. If the player is actively assigned to the *current* round's
  // still-unscored match, additionally offers to regenerate that round
  // right now too (see README's "Mid-session player and court changes") —
  // 'resting-this-round' is excluded here since that case is handled by
  // the swap flow instead (pulling in a specific replacement, not a full
  // regeneration).
  function handleSetPlayerAvailability(playerId: string, status: PlayerAvailabilityStatus) {
    setAvailabilityStatus(playerId, status);
    const updatedPlayers = players.map((p) => (p.id === playerId ? { ...p, availabilityStatus: status } : p));
    regenerateFutureRounds(updatedPlayers, teams, teamPlayers);

    if (status === 'available' || status === 'resting-this-round') return;
    const currentRound = rounds.find((round) => round.status === 'current');
    if (!currentRound) return;
    const inCurrentMatch = currentRound.matches.some(
      (match) => match.teamA.playerIds.includes(playerId) || match.teamB.playerIds.includes(playerId),
    );
    if (!inCurrentMatch) return;
    const hasScores = currentRound.matches.some((match) => match.scoreA != null || match.scoreB != null);
    if (hasScores) return;
    if (window.confirm('Regenerate the current round with updated player availability? Existing match assignments for this round will change.')) {
      regenerateCurrentRound(updatedPlayers, teams, teamPlayers);
    }
  }

  function handleChangeCourts(newCourts: number, regenerateCurrent: boolean) {
    changeCourtCount(newCourts, players, teams, teamPlayers, regenerateCurrent);
  }

  function handleSwapPlayer(activePlayerId: string, byePlayerId: string) {
    return swapPlayerInCurrentRound(activePlayerId, byePlayerId, teams);
  }

  function handleReset() {
    const confirmed = window.confirm(
      isKingCourt
        ? 'Are you sure you want to reset King Court? This will clear all players, court assignments, cycles, scores, and stats.'
        : isDynamicPairingSocial
          ? 'Are you sure you want to reset Dynamic Pairing Social? This will clear all players, settings, rounds, scores, rankings, and rest history.'
          : isDynamicTeamQualifier
            ? 'Are you sure you want to reset Dynamic Team Qualifier? This will clear all teams, check-in status, the rest schedule, rounds, scores, standings, and the medal bracket.'
            : isSocial
              ? 'Are you sure you want to reset Social Play? This will clear all players, teams, rounds, scores, and stats.'
              : 'Are you sure you want to reset the tournament? This will clear all players, teams, rounds, scores, and stats.',
    );
    if (confirmed) {
      resetTournament();
      poolsKnockout.resetPoolsKnockout();
      kingCourt.resetKingCourt();
      dynamicPairing.resetDynamicPairing();
      dynamicTeamQualifier.resetDynamicTeamQualifier();
      removeAllPlayers();
      removeAllTeams();
      setView('setup');
    }
  }

  // Top nav's Tournament/Social buttons — replaces the old single "Setup"
  // tab plus the in-page Play Mode toggle that used to live on
  // TournamentSetup: picking a mode and landing on Setup are now the same
  // click. Mirrors the removed toggle's exact behaviour: switching to
  // Social from Tournament defaults into Standard Social Play; re-clicking
  // Social while already somewhere in the social group (Standard, Dynamic
  // Pairing, or King Court) is a no-op on playMode — only the Social
  // Format toggle on the Setup screen switches between those three.
  function handleGoToTournamentSetup() {
    updateSettings({ ...settings, playMode: 'tournament' });
    setView('setup');
  }

  function handleGoToSocialSetup() {
    if (!isSocialGroup) {
      updateSettings({ ...settings, playMode: 'social', socialFormat: 'standard-social' });
    }
    setView('setup');
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
          <button
            type="button"
            className={view === 'setup' && !isSocialGroup ? 'tab active' : 'tab'}
            onClick={handleGoToTournamentSetup}
          >
            Tournament
          </button>
          <button
            type="button"
            className={view === 'setup' && isSocialGroup ? 'tab active' : 'tab'}
            onClick={handleGoToSocialSetup}
          >
            Social
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
          ) : isDynamicTeamQualifier ? (
            <>
              <button
                type="button"
                className={view === 'dtq-rounds' ? 'tab active' : 'tab'}
                onClick={() => setView('dtq-rounds')}
                disabled={!started}
              >
                Rounds
              </button>
              <button
                type="button"
                className={view === 'dtq-standings' ? 'tab active' : 'tab'}
                onClick={() => setView('dtq-standings')}
                disabled={!started}
              >
                Standings
              </button>
              <button
                type="button"
                className={view === 'dtq-bracket' ? 'tab active' : 'tab'}
                onClick={() => setView('dtq-bracket')}
                disabled={!started || !dynamicTeamQualifier.medalBracket}
              >
                Medal Bracket
              </button>
              <button
                type="button"
                className={view === 'dtq-results' ? 'tab active' : 'tab'}
                onClick={() => setView('dtq-results')}
                disabled={!started}
              >
                Final Results
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
            playerCount={players.length}
            fixedTeamCount={teams.length}
            tournamentInProgress={started}
          />

          {!isKingCourt && !isDynamicPairingSocial && !isDynamicTeamQualifier && (
            <NumberOfCourtsSetup settings={settings} onChange={updateSettings} />
          )}

          {isKingCourt ? (
            <>
              <KingCourtSetup
                players={players}
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
              onAddPlayersBulk={dynamicPairing.addPlayersBulk}
              onUpdatePlayer={dynamicPairing.updatePlayer}
              onRemovePlayer={dynamicPairing.removePlayer}
              onRemoveAllPlayers={dynamicPairing.removeAllPlayers}
              teams={dynamicPairing.teams}
              onMakeTeam={dynamicPairing.makeTeam}
              onUnmakeTeam={dynamicPairing.unmakeTeam}
              onUpdateTeamSeedAndRating={dynamicPairing.updateTeamSeedAndRating}
              onUpdateEntrantSkillLevel={dynamicPairing.updateEntrantSkillLevel}
              onStartSession={() => {
                dynamicPairing.startSession();
                setView('dp-rounds');
              }}
              started={dynamicPairing.started}
              gradingPhaseComplete={dynamicPairing.gradingPhaseComplete}
              onGoToRounds={() => setView('dp-rounds')}
            />
          ) : isDynamicTeamQualifier ? (
            <>
              <DynamicTeamQualifierSetup
                settings={dynamicTeamQualifier.settings}
                onChangeSettings={dynamicTeamQualifier.updateSettings}
                started={dynamicTeamQualifier.started}
              />
              <DynamicTeamRoster
                teams={dynamicTeamQualifier.teams}
                settings={dynamicTeamQualifier.settings}
                onAddTeamsBulk={dynamicTeamQualifier.addTeamsBulk}
                onUpdateTeam={dynamicTeamQualifier.updateTeam}
                onSetCheckedIn={dynamicTeamQualifier.setCheckedIn}
                onCheckInAllTeams={dynamicTeamQualifier.checkInAllTeams}
                onRemoveTeam={dynamicTeamQualifier.removeTeam}
                onRemoveAllTeams={dynamicTeamQualifier.removeAllTeams}
                started={dynamicTeamQualifier.started}
                startError={dynamicTeamQualifier.startError}
                onStartQualifying={() => {
                  const result = dynamicTeamQualifier.startQualifying();
                  if (result.ok) setView('dtq-rounds');
                }}
                onRegenerateSeed={dynamicTeamQualifier.regenerateRandomSeed}
                onGoToRounds={() => setView('dtq-rounds')}
              />
            </>
          ) : (
            <>
              <RosterSetup
                settings={settings}
                players={players}
                onAddPlayersBulk={addPlayersBulk}
                onUpdatePlayer={updatePlayer}
                onRemovePlayer={removePlayer}
                onRemoveAllPlayers={removeAllPlayers}
                teams={teams}
                teamPlayers={teamPlayers}
                onMakeTeam={handleMakeTeam}
                onUpdateTeamPlayer={updateTeamPlayer}
                onRemoveTeam={removeTeam}
                onUnmakeTeam={handleUnmakeTeam}
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
          sessionAdjustments={kingCourt.sessionAdjustments}
          confirmError={kcConfirmError}
          onSetGameScore={kingCourt.setGameScore}
          onAdvanceGame={kingCourt.advanceGame}
          onSetManualTiebreakOrder={kingCourt.setManualTiebreakOrder}
          onSetManualMovementOverride={kingCourt.setManualMovementOverride}
          onConfirmMovement={() => {
            const result = kingCourt.confirmMovementAndAdvance(players);
            setKcConfirmError(result.ok ? null : result.reason);
          }}
          onSetAvailability={setAvailabilityStatus}
          onSubstitute={kingCourt.substitutePlayer}
          onChangeCourts={kingCourt.changeCourtsSession}
        />
      )}

      {view === 'kc-standings' && <KingCourtStandings players={players} cycles={kingCourt.cycles} />}

      {view === 'kc-history' && <KingCourtCycleHistory players={players} cycles={kingCourt.cycles} />}

      {view === 'dp-rounds' && started && (
        <DynamicPairingRoundsPage
          rounds={dynamicPairing.rounds}
          currentRound={dynamicPairing.currentRound}
          players={dynamicPairing.players}
          teams={dynamicPairing.teams}
          awaitingSkillReview={dynamicPairing.awaitingSkillReview}
          onSetScore={(courtNumber, score1, score2) => {
            if (!dynamicPairing.currentRound) return;
            dynamicPairing.setCourtScore(dynamicPairing.currentRound.id, courtNumber, score1, score2);
          }}
          onGenerateNextRound={dynamicPairing.generateNextRound}
          onUpdateEntrantSkillLevel={dynamicPairing.updateEntrantSkillLevel}
          onConfirmSkillReview={dynamicPairing.confirmSkillReviewAndStartRankingRounds}
          onSetAvailability={dynamicPairing.setAvailabilityStatus}
          onSwap={dynamicPairing.swapPlayerInCurrentRound}
        />
      )}

      {view === 'dp-rankings' && started && (
        <DynamicPairingRankings players={dynamicPairing.players} teams={dynamicPairing.teams} rounds={dynamicPairing.rounds} />
      )}

      {view === 'dp-resting' && started && (
        <DynamicPairingRestingPlayers
          players={dynamicPairing.players}
          teams={dynamicPairing.teams}
          rounds={dynamicPairing.rounds}
          currentRound={dynamicPairing.currentRound}
          numberOfCourts={dynamicPairing.settings.numberOfCourts}
          sessionAdjustments={dynamicPairing.sessionAdjustments}
          onSetAvailability={dynamicPairing.setAvailabilityStatus}
          onChangeCourts={dynamicPairing.changeCourtCount}
          onSwap={dynamicPairing.swapPlayerInCurrentRound}
        />
      )}

      {view === 'dp-history' && started && (
        <DynamicPairingSessionHistory settings={dynamicPairing.settings} rounds={dynamicPairing.rounds} />
      )}

      {view === 'dtq-rounds' && started && (
        <DynamicTeamQualifierRoundsPage
          teams={dynamicTeamQualifier.teams}
          rounds={dynamicTeamQualifier.rounds}
          restAssignments={dynamicTeamQualifier.restAssignments}
          medalBracket={dynamicTeamQualifier.medalBracket}
          qualifyingRounds={dynamicTeamQualifier.settings.qualifyingRounds}
          stage={dynamicTeamQualifier.stage}
          onSetScore={(matchId, result) => dynamicTeamQualifier.setMatchScore(matchId, result)}
          onCloseRound={dynamicTeamQualifier.closeCurrentRound}
          onGenerateNextRound={dynamicTeamQualifier.generateNextRound}
          onGenerateMedalBracket={dynamicTeamQualifier.startMedalBracket}
        />
      )}

      {view === 'dtq-standings' && started && (
        <DynamicTeamQualifierStandings
          teams={dynamicTeamQualifier.teams}
          rounds={dynamicTeamQualifier.rounds}
          restAssignments={dynamicTeamQualifier.restAssignments}
          stage={dynamicTeamQualifier.stage}
        />
      )}

      {view === 'dtq-bracket' && started && (
        <DynamicTeamQualifierMedalBracket
          bracket={dynamicTeamQualifier.medalBracket}
          teams={dynamicTeamQualifier.teams}
          onSetScore={dynamicTeamQualifier.setBracketScore}
        />
      )}

      {view === 'dtq-results' && started && (
        <DynamicTeamQualifierFinalResults bracket={dynamicTeamQualifier.medalBracket} teams={dynamicTeamQualifier.teams} />
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
          <>
            <RoundsPage
              players={effectivePlayers}
              settings={settings}
              rounds={rounds}
              plannedRounds={plannedRounds}
              onNextRound={() => {
                // "This round" is ending — resting-this-round players are
                // available again starting now (see revertRestingPlayers'
                // file comment). Computed and applied before generating so
                // the new round's scheduling sees it immediately, not one
                // round late. A no-op in Tournament Mode, which never sets
                // this status.
                const revertedPlayers = revertRestingPlayers(players);
                if (revertedPlayers !== players) setPlayersBulk(revertedPlayers);
                nextRound(revertedPlayers, teams, teamPlayers);
              }}
              onFinishSession={handleFinishSession}
              onSetScore={setMatchScore}
              teams={teams}
              onSetAvailability={settings.playMode === 'social' ? handleSetPlayerAvailability : undefined}
              onSwap={settings.playMode === 'social' ? handleSwapPlayer : undefined}
            />
            {settings.playMode === 'social' && (
              <SessionControls
                players={players}
                teams={teams}
                teamPlayers={teamPlayers}
                playersPerCourt={playersNeededPerMatch(settings.matchType)}
                currentRound={rounds.find((round) => round.status === 'current')}
                courts={settings.courts}
                sessionAdjustments={sessionAdjustments}
                onSetAvailability={handleSetPlayerAvailability}
                onChangeCourts={handleChangeCourts}
                onSwap={handleSwapPlayer}
              />
            )}
          </>
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
