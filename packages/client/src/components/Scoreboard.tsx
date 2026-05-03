import React from 'react';
import type { Player, Announcement, RoundScore, Trick } from '@dokoapp/shared';

interface ScoreboardProps {
  players: Player[];
  announcements: Announcement[];
  completedTricks: Trick[];
  scores: Record<string, number>;
  gameLog: string[];
  phase: string;
}

const ANNOUNCEMENT_DISPLAY: Record<string, string> = {
  're': 'Re',
  'contra': 'Contra',
  'keine90': 'Keine 90',
  'keine60': 'Keine 60',
  'keine30': 'Keine 30',
  'schwarz': 'Schwarz',
};

export const Scoreboard: React.FC<ScoreboardProps> = ({
  players,
  announcements,
  completedTricks,
  scores,
  gameLog,
  phase,
}) => {
  const roundOver = phase === 'scoring';

  return (
    <div className="flex flex-col gap-3 h-full text-sm">
      {/* Leaderboard – sorted ascending (lowest penalty = leading) */}
      <div className="bg-black bg-opacity-30 rounded-lg p-3">
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Rangliste</div>
        {[...players]
          .sort((a, b) => (scores[a.id] ?? 0) - (scores[b.id] ?? 0))
          .map((player, idx) => {
            const pts = scores[player.id] ?? 0;
            const rankColors = ['text-yellow-300', 'text-gray-300', 'text-amber-600', 'text-gray-500'];
            return (
              <div key={player.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-4 ${rankColors[idx]}`}>{idx + 1}.</span>
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      roundOver
                        ? player.team === 're' ? 'bg-yellow-400' : player.team === 'contra' ? 'bg-blue-400' : 'bg-gray-500'
                        : 'bg-gray-500'
                    }`}
                  />
                  <span className="text-white font-medium">{player.name}</span>
                  {player.isBot && <span className="text-gray-500 text-xs">Bot</span>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {!roundOver && player.tricksWon > 0 && (
                    <span className="text-gray-400">{player.tricksWon} St.</span>
                  )}
                  <span className={`font-bold tabular-nums ${pts === 0 ? 'text-green-400' : 'text-orange-300'}`}>
                    {pts}
                  </span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Stiche-Zähler nur bei Rundenende */}
      {roundOver && (
        <div className="bg-black bg-opacity-30 rounded-lg p-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Stichpunkte</div>
          {players.map(player => (
            <div key={player.id} className="flex justify-between py-0.5">
              <span className="text-gray-300">{player.name}</span>
              <span className="text-yellow-200 font-semibold">{player.trickPoints} Pkt.</span>
            </div>
          ))}
        </div>
      )}

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="bg-black bg-opacity-30 rounded-lg p-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Ansagen</div>
          <div className="flex flex-wrap gap-1.5">
            {announcements.map((ann, i) => {
              const player = players.find(p => p.id === ann.playerId);
              return (
                <div
                  key={i}
                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                    ann.team === 're'
                      ? 'bg-yellow-500 text-yellow-900'
                      : 'bg-blue-600 text-white'
                  }`}
                  title={`${player?.name} (Stich ${ann.trickIndex + 1})`}
                >
                  {ANNOUNCEMENT_DISPLAY[ann.type]}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Game log */}
      <div className="bg-black bg-opacity-30 rounded-lg p-3 flex-1 overflow-hidden">
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Spielverlauf</div>
        <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: 200 }}>
          {[...gameLog].reverse().map((entry, i) => (
            <div key={i} className="text-gray-300 text-xs">
              {entry}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Round Score Display
// ============================================================

interface RoundScoreDisplayProps {
  roundScore: RoundScore;
  players: Player[];
  onNewRound: () => void;
  onContinue: () => void;
  onCloseRoom: () => void;
}

export const RoundScoreDisplay: React.FC<RoundScoreDisplayProps> = ({
  roundScore,
  players,
  onNewRound,
  onContinue,
  onCloseRoom,
}) => {
  const reTeamPlayers = players.filter(p => roundScore.reTeam.includes(p.id));
  const contraTeamPlayers = players.filter(p => roundScore.contraTeam.includes(p.id));

  return (
    <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 text-white rounded-xl p-6 shadow-2xl max-w-lg w-full">
        <h2 className="text-2xl font-bold text-center mb-4">
          {roundScore.winner === 're' ? '🏆 Re gewinnt!' : '🏆 Contra gewinnt!'}
        </h2>

        {/* Points */}
        <div className="flex justify-around mb-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-300">{roundScore.rePoints}</div>
            <div className="text-sm text-gray-400">Re</div>
            <div className="text-xs text-gray-500">
              {reTeamPlayers.map(p => p.name).join(' & ')}
            </div>
          </div>
          <div className="text-2xl text-gray-500 self-center">:</div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-300">{roundScore.contraPoints}</div>
            <div className="text-sm text-gray-400">Contra</div>
            <div className="text-xs text-gray-500">
              {contraTeamPlayers.map(p => p.name).join(' & ')}
            </div>
          </div>
        </div>

        {/* Details */}
        {roundScore.details.length > 0 && (
          <div className="bg-black bg-opacity-30 rounded-lg p-3 mb-4">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Details</div>
            {roundScore.details.map((d, i) => (
              <div key={i} className="text-xs text-gray-300 py-0.5">{d}</div>
            ))}
          </div>
        )}

        {/* Extra points */}
        {roundScore.extraPoints.length > 0 && (
          <div className="bg-black bg-opacity-30 rounded-lg p-3 mb-4">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Sonderpunkte</div>
            {roundScore.extraPoints.map((ep, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5">
                <span className="text-gray-300">{ep.description}</span>
                <span className={ep.team === 're' ? 'text-yellow-300' : 'text-blue-300'}>
                  {ep.team === 're' ? 'Re' : 'Contra'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Score changes */}
        <div className="bg-black bg-opacity-30 rounded-lg p-3 mb-4">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Strafpunkte diese Runde</div>
          {[...players]
            .sort((a, b) => (roundScore.scoreChange[a.id] ?? 0) - (roundScore.scoreChange[b.id] ?? 0))
            .map(player => {
              const delta = roundScore.scoreChange[player.id] ?? 0;
              return (
                <div key={player.id} className="flex justify-between py-0.5">
                  <span className="text-gray-300">{player.name}</span>
                  <span className={`font-bold ${delta === 0 ? 'text-green-400' : 'text-orange-300'}`}>
                    {delta === 0 ? '✓ 0' : `${delta}`}
                  </span>
                </div>
              );
            })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onNewRound}
            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg text-lg"
          >
            Nächste Runde
          </button>
          <button
            onClick={onCloseRoom}
            className="bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg text-lg"
            title="Raum schließen und Ergebnis per E-Mail senden"
          >
            Beenden
          </button>
        </div>
      </div>
    </div>
  );
};

export default Scoreboard;
