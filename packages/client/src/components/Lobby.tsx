import React, { useState } from 'react';
import type { Player } from '@dokoapp/shared';

interface LobbyProps {
  roomId: string;
  playerName: string;
  players: { id: string; name: string; isBot: boolean; isConnected: boolean; position: number }[];
  connected: boolean;
  connecting: boolean;
  error: string | null;
  onSetRoomId: (id: string) => void;
  onSetName: (name: string) => void;
  onJoin: () => void;
  onAddBot: () => void;
  onStartGame: () => void;
  onClearError: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  roomId,
  playerName,
  players,
  connected,
  connecting,
  error,
  onSetRoomId,
  onSetName,
  onJoin,
  onAddBot,
  onStartGame,
  onClearError,
}) => {
  const [nameInput, setNameInput] = useState(playerName);
  const [roomInput, setRoomInput] = useState(roomId);

  const canStart = players.length === 4 && connected;
  const isInRoom = connected && players.length > 0;

  return (
    <div className="min-h-screen felt-table flex items-center justify-center p-4">
      <div className="bg-gray-900 text-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">♠♥♦♣</div>
          <h1 className="text-4xl font-bold text-yellow-300 font-card">Rolos-Doppelkopf</h1>
          <p className="text-gray-400 mt-2 text-sm">Remote-Doppelkopf vom Feinsten</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-900 border border-red-600 text-red-200 rounded-lg p-3 mb-4 flex items-start justify-between">
            <span className="text-sm">{error}</span>
            <button onClick={onClearError} className="text-red-400 hover:text-red-200 ml-2 text-lg leading-none">×</button>
          </div>
        )}

        {!isInRoom ? (
          /* Join Form */
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Dein Name</label>
              <input
                type="text"
                value={nameInput}
                onChange={e => {
                  setNameInput(e.target.value);
                  onSetName(e.target.value);
                }}
                onKeyDown={e => { if (e.key === 'Enter') onJoin(); }}
                placeholder="z.B. Klaus"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Raumname</label>
              <input
                type="text"
                value={roomInput}
                onChange={e => {
                  setRoomInput(e.target.value);
                  onSetRoomId(e.target.value);
                }}
                onKeyDown={e => { if (e.key === 'Enter') onJoin(); }}
                placeholder="z.B. zimmer1"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                maxLength={20}
              />
            </div>

            <button
              onClick={onJoin}
              disabled={connecting || !nameInput.trim()}
              className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray-900 font-bold py-3 rounded-xl text-lg transition-colors"
            >
              {connecting ? 'Verbinde...' : 'Raum betreten'}
            </button>

            <div className="text-center text-gray-500 text-xs mt-2">
              Kein Konto nötig – einfach Namen eingeben und spielen!
            </div>
          </div>
        ) : (
          /* Lobby - waiting for players */
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-sm text-gray-400 mb-1">Raum</div>
              <div className="text-lg font-bold text-yellow-300">{roomId}</div>
            </div>

            {/* Player list */}
            <div className="space-y-2">
              <div className="text-sm text-gray-400">
                Spieler ({players.length}/4):
              </div>
              {players
                .sort((a, b) => a.position - b.position)
                .map(player => (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2"
                  >
                    <div className={`w-2 h-2 rounded-full ${player.isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="flex-1 font-medium">{player.name}</span>
                    {player.isBot && (
                      <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">Bot</span>
                    )}
                    <span className="text-xs text-gray-500">Pos {player.position + 1}</span>
                  </div>
                ))}

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-800 bg-opacity-50 rounded-lg px-3 py-2 border border-dashed border-gray-600">
                  <div className="w-2 h-2 rounded-full bg-gray-600" />
                  <span className="text-gray-500 italic text-sm">Warte auf Spieler...</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              {players.length < 4 && (
                <button
                  onClick={onAddBot}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                  🤖 Bot hinzufügen
                </button>
              )}

              <button
                onClick={onStartGame}
                disabled={!canStart}
                className={`w-full font-bold py-3 rounded-xl text-lg transition-colors ${
                  canStart
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {players.length < 4
                  ? `Warte auf ${4 - players.length} Spieler...`
                  : 'Spiel starten!'}
              </button>
            </div>

            <div className="text-center text-xs text-gray-500">
              Teile den Raumnamen mit anderen Spielern, damit sie beitreten können.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Lobby;
