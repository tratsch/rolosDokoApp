import React, { useEffect, useRef, useState } from 'react';
import type { Player, ReservationType } from '@dokoapp/shared';
import { CardBack } from './Card';

const RESERVATION_LABELS: Partial<Record<ReservationType, string>> = {
  'hochzeit': 'Hochzeit!',
  'schwein': 'Schwein!',
  'armut': 'Armut!',
  'damen-solo': 'Damen-Solo!',
  'bauern-solo': 'Bauern-Solo!',
  'koenig-solo': 'König-Solo!',
  'fleischlos': 'Fleischlos!',
  'kreuz-solo': 'Kreuz-Solo!',
  'pik-solo': 'Pik-Solo!',
  'herz-solo': 'Herz-Solo!',
  'trumpf-solo': 'Trumpf-Solo!',
  'stille-hochzeit': 'Stille Hochzeit!',
};

interface PlayerAreaProps {
  player: Player;
  position: 'top' | 'left' | 'right';
  isCurrentTurn: boolean;
  myPlayerId: string;
}

const TEAM_COLORS: Record<string, string> = {
  re: 'text-yellow-300',
  contra: 'text-blue-300',
};

export const PlayerArea: React.FC<PlayerAreaProps> = ({
  player,
  position,
  isCurrentTurn,
  myPlayerId,
}) => {
  const isTop = position === 'top';
  const isLeft = position === 'left';
  const isRight = position === 'right';

  // Speech bubble for reservation announcements
  const [showBubble, setShowBubble] = useState(false);
  const prevReservation = useRef<ReservationType | undefined>(undefined);

  useEffect(() => {
    const res = player.reservation;
    if (res && res !== 'none' && res !== prevReservation.current && RESERVATION_LABELS[res]) {
      prevReservation.current = res;
      setShowBubble(true);
      const t = setTimeout(() => setShowBubble(false), 5500);
      return () => clearTimeout(t);
    }
    if (!res) prevReservation.current = undefined;
  }, [player.reservation]);

  // Render opponent's hand (face down) – xl cards (104×156)
  const cardCount = player.cardCount;
  const visibleCards = Math.min(cardCount, 12);

  const bubbleLabel = player.reservation ? RESERVATION_LABELS[player.reservation] : null;

  return (
    <div
      className={`flex flex-col items-center gap-1 ${
        isTop ? 'flex-col' : isLeft ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Speech bubble */}
      {showBubble && bubbleLabel && (
        <div className="relative flex-shrink-0">
          <div className={`
            bg-white text-gray-900 font-bold text-sm px-3 py-1.5 rounded-xl shadow-lg
            border border-gray-200 whitespace-nowrap
            ${isTop ? 'mb-1' : isLeft ? 'mr-2' : 'ml-2'}
          `}>
            {bubbleLabel}
            {/* Tail */}
            <div className={`absolute w-0 h-0 ${
              isTop
                ? 'bottom-[-6px] left-1/2 -translate-x-1/2 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white'
                : isLeft
                ? 'right-[-6px] top-1/2 -translate-y-1/2 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[6px] border-l-white'
                : 'left-[-6px] top-1/2 -translate-y-1/2 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-white'
            }`} />
          </div>
        </div>
      )}

      {/* Player name badge */}
      <div
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold
          ${isCurrentTurn
            ? 'bg-yellow-400 text-yellow-900 animate-pulse shadow-lg shadow-yellow-400/30'
            : 'bg-black bg-opacity-40 text-white'
          }
        `}
      >
        {!player.isConnected && <span className="text-red-400 text-xs">●</span>}
        {player.isBot && <span className="text-gray-400 text-xs">🤖</span>}
        <span>{player.name}</span>
        <span className="text-xs text-gray-400">
          {cardCount} Karten{player.tricksWon > 0 ? ` · ${player.tricksWon} Stiche` : ''}
        </span>
      </div>

      {/* Face-down cards */}
      <div
        className={`flex ${
          isLeft || isRight ? 'flex-col' : 'flex-row'
        } items-center`}
        style={{
          gap: isLeft || isRight ? '-20px' : '-30px',
          position: 'relative',
        }}
      >
        {Array.from({ length: visibleCards }).map((_, i) => (
          <CardBack
            key={i}
            size="xl"
            style={{
              position: 'relative',
              marginLeft: isLeft || isRight ? 0 : i > 0 ? -62 : 0,
              marginTop: isLeft || isRight ? (i > 0 ? -104 : 0) : 0,
              transform: isLeft
                ? `rotate(90deg) translateX(${i * -3}px)`
                : isRight
                ? `rotate(-90deg) translateX(${i * 3}px)`
                : `rotate(${(i - visibleCards / 2) * 2}deg)`,
              zIndex: i,
            }}
          />
        ))}
      </div>

    </div>
  );
};

export default PlayerArea;
