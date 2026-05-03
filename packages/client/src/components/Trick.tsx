import React from 'react';
import type { Trick as TrickType, Player, Card } from '@dokoapp/shared';
import { CardComponent } from './Card';

interface TrickProps {
  trick: TrickType | null;
  players: Player[];
  myPlayerId: string;
  deck: Card[];
}

// Map player positions to visual positions around the table
// Position 0 = bottom (me), 1 = left, 2 = top, 3 = right
function getVisualPosition(
  playerPosition: number,
  myPosition: number
): 'bottom' | 'left' | 'top' | 'right' {
  const relative = (playerPosition - myPosition + 4) % 4;
  const map: Record<number, 'bottom' | 'left' | 'top' | 'right'> = {
    0: 'bottom',
    1: 'left',
    2: 'top',
    3: 'right',
  };
  return map[relative];
}

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  top: {
    gridColumn: '2',
    gridRow: '1',
    justifySelf: 'center',
    alignSelf: 'end',
  },
  left: {
    gridColumn: '1',
    gridRow: '2',
    justifySelf: 'end',
    alignSelf: 'center',
    transform: 'rotate(-5deg)',
  },
  bottom: {
    gridColumn: '2',
    gridRow: '3',
    justifySelf: 'center',
    alignSelf: 'start',
  },
  right: {
    gridColumn: '3',
    gridRow: '2',
    justifySelf: 'start',
    alignSelf: 'center',
    transform: 'rotate(5deg)',
  },
};

export const TrickDisplay: React.FC<TrickProps> = ({ trick, players, myPlayerId, deck }) => {
  const myPlayer = players.find(p => p.id === myPlayerId);
  const myPosition = myPlayer?.position ?? 0;

  // Create a map of position -> card
  const trickCards: Record<string, { card: Card; playerId: string }> = {};

  if (trick) {
    for (const tc of trick.cards) {
      const player = players.find(p => p.id === tc.playerId);
      if (!player) continue;
      const card = deck.find(c => c.id === tc.cardId);
      if (!card) continue;
      const visualPos = getVisualPosition(player.position, myPosition);
      trickCards[visualPos] = { card, playerId: tc.playerId };
    }
  }

  // Card size xl = 104×156
  const CARD_W = 104;
  const CARD_H = 156;
  const COL_SIDE = CARD_W + 12;  // 116
  const COL_MID  = 80;
  const ROW_SIDE = CARD_H + 8;   // 164
  const ROW_MID  = CARD_H;       // left/right cards determine middle row height

  return (
    <div
      className="relative"
      style={{
        display: 'grid',
        gridTemplateColumns: `${COL_SIDE}px ${COL_MID}px ${COL_SIDE}px`,
        gridTemplateRows: `${ROW_SIDE}px ${ROW_MID}px ${ROW_SIDE}px`,
        width: COL_SIDE * 2 + COL_MID,
        height: ROW_SIDE * 2 + ROW_MID,
        gap: 0,
      }}
    >
      {/* Green felt center */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(64,145,108,0.3) 0%, transparent 70%)',
        }}
      />

      {(['top', 'left', 'bottom', 'right'] as const).map(pos => {
        const tc = trickCards[pos];
        return (
          <div
            key={pos}
            style={POSITION_STYLES[pos]}
            className="flex items-center justify-center"
          >
            {tc ? (
              <div className="relative">
                <CardComponent
                  card={tc.card}
                  size="xl"
                  className="animate-deal"
                />
                {trick?.winnerId === tc.playerId && trick.isComplete && (
                  <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold z-10">
                    ★
                  </div>
                )}
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-white border-opacity-20 rounded-lg"
                style={{ width: CARD_W, height: CARD_H }}
              />
            )}
          </div>
        );
      })}

      {/* Trick points display */}
      {trick && trick.cards.length > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <div className="bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">
            {trick.points} Pkt.
          </div>
        </div>
      )}
    </div>
  );
};

export default TrickDisplay;
