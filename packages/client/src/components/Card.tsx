import React from 'react';
import type { Card as CardType } from '@dokoapp/shared';

interface CardProps {
  card: CardType;
  isValid?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  faceDown?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const SUIT_SYMBOLS: Record<string, string> = {
  kreuz: '♣',
  pik: '♠',
  herz: '♥',
  karo: '♦',
};

const RANK_DISPLAY: Record<string, string> = {
  'as': 'A',
  '10': '10',
  'koenig': 'K',
  'dame': 'D',
  'bauer': 'B',
};

const RANK_FULL: Record<string, string> = {
  'as': 'As',
  '10': 'Zehn',
  'koenig': 'König',
  'dame': 'Dame',
  'bauer': 'Bauer',
};

const SUIT_FULL: Record<string, string> = {
  kreuz: 'Kreuz',
  pik: 'Pik',
  herz: 'Herz',
  karo: 'Karo',
};

// Card center symbol/artwork based on rank
function CardArtwork({ rank, suit, isRed, size }: {
  rank: string; suit: string; isRed: boolean; size: string;
}) {
  const symbol = SUIT_SYMBOLS[suit];
  const color = isRed ? '#dc2626' : '#1a1a1a';
  const fs = size === 'sm' ? '14px' : (size === 'lg' || size === 'xl') ? '22px' : '18px';

  if (rank === 'as') {
    return (
      <div className="flex items-center justify-center h-full">
        <span style={{ fontSize: size === 'sm' ? '28px' : (size === 'lg' || size === 'xl') ? '52px' : '38px', color, lineHeight: 1 }}>
          {symbol}
        </span>
      </div>
    );
  }

  if (rank === 'koenig') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-0.5">
        <span style={{ fontSize: fs, color }}>♛</span>
        <span style={{ fontSize: fs, color, opacity: 0.7 }}>{symbol}</span>
      </div>
    );
  }

  if (rank === 'dame') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-0.5">
        <span style={{ fontSize: fs, color }}>♕</span>
        <span style={{ fontSize: fs, color, opacity: 0.7 }}>{symbol}</span>
      </div>
    );
  }

  if (rank === 'bauer') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-0.5">
        <span style={{ fontSize: fs, color }}>♞</span>
        <span style={{ fontSize: fs, color, opacity: 0.7 }}>{symbol}</span>
      </div>
    );
  }

  // 10
  return (
    <div className="flex items-center justify-center h-full">
      <span style={{ fontSize: fs, color }}>{symbol}</span>
    </div>
  );
}

export const CardComponent: React.FC<CardProps> = ({
  card,
  isValid = true,
  isSelected = false,
  onClick,
  size = 'md',
  faceDown = false,
  className = '',
  style,
}) => {
  const isRed = card.suit === 'herz' || card.suit === 'karo';
  const symbol = SUIT_SYMBOLS[card.suit];
  const rankDisp = RANK_DISPLAY[card.rank];
  const textColor = isRed ? 'text-red-600' : 'text-gray-900';

  const dimensions = {
    sm: { w: 52, h: 78, textSize: 'text-xs', borderRadius: '6px' },
    md: { w: 72, h: 108, textSize: 'text-sm', borderRadius: '8px' },
    lg: { w: 90, h: 135, textSize: 'text-base', borderRadius: '10px' },
    xl: { w: 104, h: 156, textSize: 'text-base', borderRadius: '12px' },
  }[size];

  if (faceDown) {
    return (
      <div
        className={`relative inline-block ${className}`}
        style={{
          width: dimensions.w,
          height: dimensions.h,
          borderRadius: dimensions.borderRadius,
          ...style,
        }}
      >
        <div
          className="w-full h-full card-back border-2 border-blue-800 rounded-lg"
          style={{ borderRadius: dimensions.borderRadius }}
        >
          {/* Back pattern */}
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ borderRadius: dimensions.borderRadius }}
          >
            <div
              className="border border-blue-600 opacity-50"
              style={{
                width: '85%',
                height: '85%',
                borderRadius: '4px',
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.05) 4px, rgba(255,255,255,0.05) 8px)',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const handleClick = () => {
    if (isValid && onClick) onClick();
  };

  const cardClasses = [
    'card-base',
    card.isTrump ? 'card-trump' : 'card-normal',
    isValid && onClick ? 'card-playable card-hover' : '',
    isSelected ? 'card-selected' : '',
    !isValid ? 'card-invalid' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cardClasses}
      style={{
        width: dimensions.w,
        height: dimensions.h,
        borderRadius: dimensions.borderRadius,
        position: 'relative',
        ...style,
      }}
      onClick={handleClick}
      title={`${SUIT_FULL[card.suit]} ${RANK_FULL[card.rank]}${card.isTrump ? ' (Trumpf)' : ''}`}
    >
      {/* Trump indicator */}
      {card.isTrump && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, transparent 60%)',
            borderRadius: dimensions.borderRadius,
          }}
        />
      )}

      {/* Top-left corner */}
      <div
        className={`absolute top-1 left-1.5 flex flex-col items-center leading-none ${textColor}`}
        style={{ fontSize: size === 'sm' ? '11px' : (size === 'lg' || size === 'xl') ? '18px' : '13px', fontWeight: 'bold' }}
      >
        <span>{rankDisp}</span>
        <span style={{ fontSize: size === 'sm' ? '10px' : (size === 'lg' || size === 'xl') ? '16px' : '12px' }}>
          {symbol}
        </span>
      </div>

      {/* Center artwork */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ padding: '20px 8px' }}>
        <CardArtwork rank={card.rank} suit={card.suit} isRed={isRed} size={size} />
      </div>

      {/* Bottom-right corner (rotated) */}
      <div
        className={`absolute bottom-1 right-1.5 flex flex-col items-center leading-none ${textColor}`}
        style={{
          fontSize: size === 'sm' ? '11px' : (size === 'lg' || size === 'xl') ? '18px' : '13px',
          fontWeight: 'bold',
          transform: 'rotate(180deg)',
        }}
      >
        <span>{rankDisp}</span>
        <span style={{ fontSize: size === 'sm' ? '10px' : (size === 'lg' || size === 'xl') ? '16px' : '12px' }}>
          {symbol}
        </span>
      </div>

    </div>
  );
};

// Card back (for opponents)
export const CardBack: React.FC<{ size?: 'sm' | 'md' | 'lg' | 'xl'; style?: React.CSSProperties }> = ({
  size = 'md',
  style,
}) => {
  const dimensions = {
    sm: { w: 52, h: 78 },
    md: { w: 72, h: 108 },
    lg: { w: 90, h: 135 },
    xl: { w: 104, h: 156 },
  }[size];

  const margin = size === 'sm' ? 4 : 6;
  return (
    <div
      className="card-back rounded-lg flex-shrink-0 overflow-hidden"
      style={{
        width: dimensions.w,
        height: dimensions.h,
        borderRadius: 8,
        ...style,
      }}
    >
      {/* Inner white frame */}
      <div style={{
        margin,
        height: dimensions.h - margin * 2 - 6,
        border: '2px solid rgba(255,255,255,0.75)',
        borderRadius: 3,
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(255,255,255,0.13) 0px, rgba(255,255,255,0.13) 1px, transparent 1px, transparent 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.13) 0px, rgba(255,255,255,0.13) 1px, transparent 1px, transparent 6px)',
        backgroundColor: '#1a3a8f',
      }} />
    </div>
  );
};

export default CardComponent;
