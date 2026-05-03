import React from 'react';
import type { Card as CardType, CardId } from '@dokoapp/shared';
import { CardComponent } from './Card';

interface HandProps {
  cards: CardType[];
  validCards: CardId[];
  selectedCard: CardId | null;
  onCardClick: (cardId: CardId) => void;
  isMyTurn: boolean;
}

export const Hand: React.FC<HandProps> = ({
  cards,
  validCards,
  selectedCard,
  onCardClick,
  isMyTurn,
}) => {
  const validSet = new Set(validCards);

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-end justify-center" style={{ minHeight: 160 }}>
        <div className="flex items-end" style={{ position: 'relative' }}>
          {cards.map((card, idx) => {
            const isPlayable = isMyTurn && validSet.has(card.id);
            const isInvalid = isMyTurn && !validSet.has(card.id);
            const isSelected = selectedCard === card.id;
            // Fan layout
            const totalCards = cards.length;
            const offset = totalCards > 1
              ? (idx - (totalCards - 1) / 2) * (totalCards > 8 ? 48 : 56)
              : 0;
            const rotation = totalCards > 1
              ? (idx - (totalCards - 1) / 2) * 2
              : 0;
            const yOffset = Math.abs(idx - (totalCards - 1) / 2) * 1.5;

            return (
              <div
                key={card.id}
                style={{
                  position: 'absolute',
                  left: `calc(50% + ${offset}px - 52px)`,
                  bottom: isSelected ? 22 : 0,
                  transform: `rotate(${rotation}deg) translateY(${yOffset}px)`,
                  transition: 'all 0.15s ease',
                  zIndex: idx + (isSelected ? 50 : 0),
                }}
              >
                <CardComponent
                  card={card}
                  isValid={!isInvalid}
                  isSelected={isSelected}
                  onClick={isPlayable ? () => onCardClick(card.id) : undefined}
                  size="xl"
                />
              </div>
            );
          })}
          {/* Spacer for absolute positioned cards */}
          <div style={{ width: cards.length > 1 ? (cards.length - 1) * 56 + 104 : 104, height: 156 }} />
        </div>
      </div>

      {/* Turn indicator */}
      {isMyTurn && (
        <div className="mt-2 text-yellow-300 text-sm font-semibold animate-pulse">
          Du bist dran! {selectedCard ? '→ Klicke nochmal zum Spielen' : '→ Wähle eine Karte'}
        </div>
      )}
    </div>
  );
};

export default Hand;
