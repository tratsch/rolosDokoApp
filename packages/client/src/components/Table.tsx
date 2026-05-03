import React from 'react';
import type { ClientGameState, CardId, ReservationType, AnnouncementType } from '@dokoapp/shared';
import { getValidAnnouncements } from '@dokoapp/shared';
import { Hand } from './Hand';
import { PlayerArea } from './PlayerArea';
import { TrickDisplay } from './Trick';
import { Scoreboard, RoundScoreDisplay } from './Scoreboard';
import {
  ReservationDialog, AnnouncementPanel, ArmutAcceptDialog, ArmutReturnDialog
} from './GameControls';

interface TableProps {
  gameState: ClientGameState;
  selectedCard: CardId | null;
  reservationOptions: ReservationType[] | null;
  reservationPhase: 'solo' | 'armut' | 'small' | null;
  armutOffer: { fromPlayer: string; cardCount: number } | null;
  showRoundScore: boolean;
  onCardClick: (cardId: CardId) => void;
  onDeclareReservation: (type: ReservationType) => void;
  onAcceptArmut: (accept: boolean) => void;
  onReturnArmutCards: (cardIds: CardId[]) => void;
  onMakeAnnouncement: (type: AnnouncementType) => void;
  onNewRound: () => void;
  onAcknowledgeTrick: () => void;
  onCloseRoom: () => void;
}

// Relative positions: player positions around the table from my perspective
// My position = bottom (index 0 relative)
// Left opponent = position 1 (relative)
// Across opponent = position 2 (relative)
// Right opponent = position 3 (relative)

function getRelativePosition(playerPos: number, myPos: number): number {
  return (playerPos - myPos + 4) % 4;
}

export const Table: React.FC<TableProps> = ({
  gameState,
  selectedCard,
  reservationOptions,
  reservationPhase,
  armutOffer,
  showRoundScore,
  onCardClick,
  onDeclareReservation,
  onAcceptArmut,
  onReturnArmutCards,
  onMakeAnnouncement,
  onNewRound,
  onAcknowledgeTrick,
  onCloseRoom,
}) => {
  const { myPlayerId, players, myCards, validCards, currentTrick, phase } = gameState;
  const myPlayer = players.find(p => p.id === myPlayerId);
  const myPos = myPlayer?.position ?? 0;

  // Determine other players' visual positions
  const otherPlayers = players.filter(p => p.id !== myPlayerId);
  const leftPlayer = otherPlayers.find(p => getRelativePosition(p.position, myPos) === 1);
  const topPlayer = otherPlayers.find(p => getRelativePosition(p.position, myPos) === 2);
  const rightPlayer = otherPlayers.find(p => getRelativePosition(p.position, myPos) === 3);

  const isTrickEnd = phase === 'trick-end';
  const trickWinner = isTrickEnd
    ? players.find(p => p.id === gameState.pendingTrickWinnerId)
    : null;
  const iWonTrick = isTrickEnd && gameState.pendingTrickWinnerId === myPlayerId;

  const isMyTurn =
    (phase === 'playing' && players[gameState.currentPlayerIndex]?.id === myPlayerId) ||
    iWonTrick;

  // Check if we need to show armut return dialog
  const needsReturnCards = gameState.armutExchange?.phase === 'returning' &&
    gameState.armutExchange?.acceptedById === myPlayerId;

  // Valid announcements
  const validAnnouncements = myPlayer && phase === 'playing'
    ? getValidAnnouncements(myPlayer, gameState)
    : [];

  // Find player from armut offer
  const armutOfferingPlayer = armutOffer
    ? players.find(p => p.id === gameState.armutExchange?.offeringPlayerId)
    : null;

  return (
    <div className="flex h-screen bg-table-darkGreen overflow-hidden">

      {/* ============================================================
          Left Sidebar - Scoreboard
          ============================================================ */}
      <div className="w-64 flex-shrink-0 bg-black bg-opacity-40 border-r border-white border-opacity-10 p-3 flex flex-col gap-3 overflow-y-auto">
        {/* Room info */}
        <div className="bg-black bg-opacity-30 rounded-lg p-2">
          <div className="text-xs text-gray-400">Raum</div>
          <div className="text-sm text-white font-medium">{gameState.roomId}</div>
          <div className="text-xs text-gray-400">
            Runde {gameState.roundNumber} |{' '}
            {gameState.activeReservation
              ? gameState.activeReservation.replace(/-/g, ' ')
              : 'Normalspiel'}
          </div>
        </div>

        <Scoreboard
          players={players}
          announcements={gameState.announcements}
          completedTricks={gameState.completedTricks}
          scores={gameState.scores}
          gameLog={gameState.gameLog}
          phase={phase}
        />
      </div>

      {/* ============================================================
          Main Table Area
          ============================================================ */}
      <div className="flex-1 felt-table flex flex-col relative">

        {/* Top player */}
        <div className="flex justify-center pt-4">
          {topPlayer ? (
            <PlayerArea
              player={topPlayer}
              position="top"
              isCurrentTurn={players[gameState.currentPlayerIndex]?.id === topPlayer.id}
              myPlayerId={myPlayerId}
            />
          ) : (
            <div className="text-gray-500 text-sm italic py-4">Platz frei</div>
          )}
        </div>

        {/* Middle row: left | trick | right */}
        <div className="flex-1 flex items-center justify-between px-4 gap-4">
          {/* Left player */}
          <div className="w-40">
            {leftPlayer ? (
              <PlayerArea
                player={leftPlayer}
                position="left"
                isCurrentTurn={players[gameState.currentPlayerIndex]?.id === leftPlayer.id}
                myPlayerId={myPlayerId}
              />
            ) : (
              <div className="text-gray-500 text-sm italic text-center">Platz frei</div>
            )}
          </div>

          {/* Center: Current Trick */}
          <div className="flex flex-col items-center gap-4">
            {/* Phase indicator */}
            {phase === 'reservations' && (
              <div className="bg-yellow-500 text-yellow-900 px-4 py-2 rounded-full text-sm font-bold">
                Vorbehaltsphase
              </div>
            )}
            {phase === 'armut-exchange' && (
              <div className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-bold">
                Armut-Tausch
              </div>
            )}

            {/* Trick display */}
            <div
              className={isTrickEnd && !iWonTrick ? 'cursor-pointer' : ''}
              onClick={isTrickEnd && !iWonTrick ? onAcknowledgeTrick : undefined}
            >
              <TrickDisplay
                trick={currentTrick}
                players={players}
                myPlayerId={myPlayerId}
                deck={gameState.cardDeck}
              />
              {isTrickEnd && !iWonTrick && (
                <div className="mt-3 text-center animate-pulse">
                  <div className="bg-black bg-opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-full border border-yellow-400">
                    {trickWinner?.name ?? 'Jemand'} gewinnt · Klicken zum Weiterspielen
                  </div>
                </div>
              )}
              {iWonTrick && (
                <div className="mt-3 text-center">
                  <div className="bg-green-700 bg-opacity-80 text-white text-sm font-semibold px-4 py-2 rounded-full border border-green-400">
                    Du gewinnst · Spiele deine nächste Karte
                  </div>
                </div>
              )}
            </div>

            {/* Completed tricks count */}
            {gameState.completedTricks.length > 0 && (
              <div className="text-gray-300 text-xs text-center">
                {gameState.completedTricks.length} / 10 Stiche gespielt
              </div>
            )}

            {/* Announcement panel */}
            {validAnnouncements.length > 0 && (
              <AnnouncementPanel
                options={validAnnouncements}
                onAnnounce={onMakeAnnouncement}
              />
            )}
          </div>

          {/* Right player */}
          <div className="w-40">
            {rightPlayer ? (
              <PlayerArea
                player={rightPlayer}
                position="right"
                isCurrentTurn={players[gameState.currentPlayerIndex]?.id === rightPlayer.id}
                myPlayerId={myPlayerId}
              />
            ) : (
              <div className="text-gray-500 text-sm italic text-center">Platz frei</div>
            )}
          </div>
        </div>

        {/* Bottom: My hand */}
        <div className="pb-6 px-4">
          {myPlayer && (
            <div className="flex flex-col items-center gap-2">
              {/* My player info */}
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <span className="font-semibold text-white">{myPlayer.name}</span>
                {myPlayer.team && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    myPlayer.team === 're'
                      ? 'bg-yellow-500 text-yellow-900'
                      : 'bg-blue-600 text-white'
                  }`}>
                    {myPlayer.team === 're' ? 'Re' : 'Contra'}
                  </span>
                )}
                <span className="text-gray-400">{myCards.length} Karten</span>
              </div>

              {/* Hand */}
              <Hand
                cards={myCards}
                validCards={validCards}
                selectedCard={selectedCard}
                onCardClick={onCardClick}
                isMyTurn={isMyTurn}
              />
            </div>
          )}
        </div>

        {/* ============================================================
            Dialogs & Overlays (inside table area → centered correctly)
            ============================================================ */}

        {/* Reservation dialog */}
        {reservationOptions && reservationPhase && (
          <ReservationDialog
            options={reservationOptions}
            phase={reservationPhase}
            onSelect={onDeclareReservation}
          />
        )}

        {/* Armut accept dialog */}
        {armutOffer && armutOfferingPlayer && (
          <ArmutAcceptDialog
            fromPlayerName={armutOfferingPlayer.name}
            cardCount={armutOffer.cardCount}
            onAccept={onAcceptArmut}
          />
        )}

        {/* Armut return cards dialog */}
        {needsReturnCards && gameState.armutExchange && (
          <ArmutReturnDialog
            myCards={myCards}
            cardCount={gameState.armutExchange.offeredCardIds?.length ?? 3}
            onReturn={onReturnArmutCards}
            deck={gameState.cardDeck}
          />
        )}

        {/* Round score */}
        {showRoundScore && gameState.lastRoundScore && (
          <RoundScoreDisplay
            roundScore={gameState.lastRoundScore}
            players={players}
            onNewRound={onNewRound}
            onContinue={onNewRound}
            onCloseRoom={onCloseRoom}
          />
        )}

        {/* Waiting indicator for reservation phase */}
        {phase === 'reservations' && !reservationOptions && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black bg-opacity-60 text-white text-sm px-4 py-2 rounded-full">
            Warte auf andere Spieler...
          </div>
        )}
      </div>
    </div>
  );
};

export default Table;
