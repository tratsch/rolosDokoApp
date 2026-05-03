import React, { useEffect } from 'react';
import useGameStore, { initSocketListeners } from './store/gameStore';
import { Lobby } from './components/Lobby';
import { Table } from './components/Table';
import socket from './socket';

// Initialize socket listeners once
let listenersInitialized = false;

function App() {
  const {
    connected,
    connecting,
    error,
    roomId,
    playerName,
    gameState,
    myPlayerId,
    selectedCard,
    reservationOptions,
    reservationPhase,
    armutOffer,
    lastRoundScore,
    lobbyPlayers,
    setRoomId,
    setPlayerName,
    joinRoom,
    addBot,
    startGame,
    playCard,
    declareReservation,
    acceptArmut,
    returnArmutCards,
    makeAnnouncement,
    startNewRound,
    acknowledgeTrick,
    clearError,
    selectCard,
    closeRoom,
    showRoundScore,
    setShowRoundScore,
  } = useGameStore();

  // Initialize socket listeners
  useEffect(() => {
    if (!listenersInitialized) {
      initSocketListeners();
      listenersInitialized = true;
    }
  }, []);

  // Room players: use game-state during game, lobbyPlayers in lobby
  const roomPlayers = gameState?.players?.map(p => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    isConnected: p.isConnected,
    position: p.position,
  })) ?? lobbyPlayers;

  const isInGame = gameState !== null &&
    (gameState.phase === 'playing' ||
     gameState.phase === 'trick-end' ||
     gameState.phase === 'reservations' ||
     gameState.phase === 'scoring' ||
     gameState.phase === 'armut-exchange');

  const isInLobby = !isInGame || gameState?.phase === 'waiting';

  // Handle card clicks: first click selects, second click plays
  const handleCardClick = (cardId: string) => {
    if (selectedCard === cardId) {
      // Play the card
      socket.emit('play-card', { cardId });
      selectCard(null);
    } else {
      selectCard(cardId);
    }
  };

  const handleNewRound = () => {
    setShowRoundScore(false);
    startNewRound();
  };


  if (isInLobby || !gameState || !myPlayerId) {
    return (
      <Lobby
        roomId={roomId}
        playerName={playerName}
        players={roomPlayers}
        connected={connected}
        connecting={connecting}
        error={error}
        onSetRoomId={setRoomId}
        onSetName={setPlayerName}
        onJoin={joinRoom}
        onAddBot={addBot}
        onStartGame={startGame}
        onClearError={clearError}
      />
    );
  }

  return (
    <>
      {/* Error toast */}
      {error && (
        <div className="fixed top-4 right-4 bg-red-800 text-white px-4 py-2 rounded-lg shadow-lg z-50 max-w-xs">
          {error}
        </div>
      )}

      {/* Connection indicator */}
      {!connected && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-orange-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          Verbindung unterbrochen – versuche erneut...
        </div>
      )}

      <Table
        gameState={gameState}
        selectedCard={selectedCard}
        reservationOptions={reservationOptions}
        reservationPhase={reservationPhase}
        armutOffer={armutOffer}
        showRoundScore={showRoundScore}
        onCardClick={handleCardClick}
        onDeclareReservation={declareReservation}
        onAcceptArmut={acceptArmut}
        onReturnArmutCards={returnArmutCards}
        onMakeAnnouncement={makeAnnouncement}
        onNewRound={handleNewRound}
        onAcknowledgeTrick={acknowledgeTrick}
        onCloseRoom={closeRoom}
      />
    </>
  );
}

export default App;
