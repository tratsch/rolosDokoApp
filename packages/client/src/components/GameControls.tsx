import React, { useState } from 'react';
import type { ReservationType, AnnouncementType, Card as CardType, CardId } from '@dokoapp/shared';
import { CardComponent } from './Card';

// ============================================================
// Reservation Dialog
// ============================================================

interface ReservationDialogProps {
  options: ReservationType[];
  phase: 'solo' | 'armut' | 'small';
  onSelect: (type: ReservationType) => void;
}

const RESERVATION_NAMES: Record<ReservationType, string> = {
  'none': 'Kein Vorbehalt',
  'hochzeit': 'Hochzeit',
  'schwein': 'Schwein',
  'armut': 'Armut',
  'damen-solo': 'Damen-Solo',
  'bauern-solo': 'Bauern-Solo',
  'koenig-solo': 'König-Solo',
  'fleischlos': 'Fleischlos',
  'kreuz-solo': 'Kreuz-Solo',
  'pik-solo': 'Pik-Solo',
  'herz-solo': 'Herz-Solo',
  'trumpf-solo': 'Trumpf-Solo',
  'stille-hochzeit': 'Stille Hochzeit',
};

const RESERVATION_DESCRIPTIONS: Partial<Record<ReservationType, string>> = {
  'none': 'Normal spielen',
  'hochzeit': 'Beide Kreuz-Damen – Partner = erster der einen Nicht-Trumpf-Stich macht',
  'schwein': 'Beide Karo-Asse – werden höchste Trümpfe',
  'armut': '≤3 Trümpfe – Karten werden angeboten',
  'damen-solo': 'Nur Damen sind Trumpf',
  'bauern-solo': 'Nur Buben sind Trumpf',
  'koenig-solo': 'Nur Könige sind Trumpf',
  'fleischlos': 'Kein Trumpf',
  'kreuz-solo': 'Kreuz als Trumpffarbe',
  'pik-solo': 'Pik als Trumpffarbe',
  'herz-solo': 'Herz als Trumpffarbe',
};

export const ReservationDialog: React.FC<ReservationDialogProps> = ({
  options,
  phase,
  onSelect,
}) => {
  const phaseTitle = {
    'solo': 'Möchtest du ein Solo spielen?',
    'armut': 'Hast du Trumpfarmut? (≤3 Trümpfe)',
    'small': 'Kleine Vorbehalte',
  }[phase];

  // Group options
  const soloOptions = options.filter(o =>
    ['damen-solo', 'bauern-solo', 'koenig-solo', 'fleischlos', 'kreuz-solo', 'pik-solo', 'herz-solo', 'trumpf-solo'].includes(o)
  );
  const smallOptions = options.filter(o => ['hochzeit', 'schwein', 'armut'].includes(o));
  const noneOption = options.find(o => o === 'none');

  return (
    <div className="absolute inset-0 bg-black bg-opacity-35 flex items-center justify-center z-50">
      <div className="bg-gray-800 text-white rounded-xl p-6 shadow-2xl max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-2 text-center text-yellow-300">{phaseTitle}</h2>
        <p className="text-gray-400 text-sm text-center mb-4">
          Wähle deinen Vorbehalt:
        </p>

        <div className="space-y-2">
          {soloOptions.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Soli</div>
              <div className="grid grid-cols-2 gap-2">
                {soloOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => onSelect(opt)}
                    className="bg-red-700 hover:bg-red-600 text-white rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                  >
                    {RESERVATION_NAMES[opt]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {smallOptions.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2 mt-3">Kleine Vorbehalte</div>
              <div className="grid grid-cols-1 gap-2">
                {smallOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => onSelect(opt)}
                    className="bg-blue-700 hover:bg-blue-600 text-white rounded-lg px-3 py-2 text-sm font-semibold transition-colors text-left"
                  >
                    <span className="font-bold">{RESERVATION_NAMES[opt]}</span>
                    {RESERVATION_DESCRIPTIONS[opt] && (
                      <span className="block text-xs text-blue-200 mt-0.5">
                        {RESERVATION_DESCRIPTIONS[opt]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {noneOption && (
            <button
              onClick={() => onSelect('none')}
              className="w-full bg-gray-600 hover:bg-gray-500 text-white rounded-lg px-3 py-2 text-sm font-semibold transition-colors mt-3"
            >
              Kein Vorbehalt
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Announcement Panel
// ============================================================

interface AnnouncementPanelProps {
  options: AnnouncementType[];
  onAnnounce: (type: AnnouncementType) => void;
}

const ANNOUNCEMENT_NAMES: Record<AnnouncementType, string> = {
  're': 'Re!',
  'contra': 'Contra!',
  'keine90': 'Keine 90',
  'keine60': 'Keine 60',
  'keine30': 'Keine 30',
  'schwarz': 'Schwarz!',
};

export const AnnouncementPanel: React.FC<AnnouncementPanelProps> = ({ options, onAnnounce }) => {
  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onAnnounce(opt)}
          className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
            opt === 're' || opt === 'keine90' || opt === 'keine60' || opt === 'keine30' || opt === 'schwarz'
              ? 'bg-yellow-500 hover:bg-yellow-400 text-yellow-900'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {ANNOUNCEMENT_NAMES[opt]}
        </button>
      ))}
    </div>
  );
};

// ============================================================
// Armut Accept Dialog
// ============================================================

interface ArmutAcceptDialogProps {
  fromPlayerName: string;
  cardCount: number;
  onAccept: (accept: boolean) => void;
}

export const ArmutAcceptDialog: React.FC<ArmutAcceptDialogProps> = ({
  fromPlayerName,
  cardCount,
  onAccept,
}) => {
  return (
    <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-gray-800 text-white rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
        <h2 className="text-xl font-bold mb-3 text-center text-yellow-300">Armut-Angebot</h2>
        <p className="text-center mb-4">
          <span className="font-bold text-white">{fromPlayerName}</span> hat Armut und bietet
          dir <span className="font-bold text-yellow-300">{cardCount} Trumpfkarten</span> an.
          Möchtest du annehmen?
        </p>
        <p className="text-gray-400 text-sm text-center mb-4">
          Du musst die gleiche Anzahl Karten zurückgeben.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => onAccept(true)}
            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg"
          >
            Annehmen
          </button>
          <button
            onClick={() => onAccept(false)}
            className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 rounded-lg"
          >
            Ablehnen
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Armut Return Cards Dialog
// ============================================================

interface ArmutReturnDialogProps {
  myCards: CardType[];
  cardCount: number;
  onReturn: (cardIds: CardId[]) => void;
  deck: CardType[];
}

export const ArmutReturnDialog: React.FC<ArmutReturnDialogProps> = ({
  myCards,
  cardCount,
  onReturn,
  deck,
}) => {
  const [selected, setSelected] = useState<Set<CardId>>(new Set());

  const toggleCard = (cardId: CardId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else if (next.size < cardCount) {
        next.add(cardId);
      }
      return next;
    });
  };

  return (
    <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-gray-800 text-white rounded-xl p-6 shadow-2xl max-w-lg w-full mx-4">
        <h2 className="text-xl font-bold mb-2 text-center text-yellow-300">Karten zurückgeben</h2>
        <p className="text-center text-gray-300 mb-4">
          Wähle {cardCount} Karten zum Zurückgeben:
          <span className={`ml-2 font-bold ${selected.size === cardCount ? 'text-green-400' : 'text-yellow-300'}`}>
            ({selected.size}/{cardCount} ausgewählt)
          </span>
        </p>

        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {myCards.map(card => (
            <CardComponent
              key={card.id}
              card={card}
              isValid={selected.size < cardCount || selected.has(card.id)}
              isSelected={selected.has(card.id)}
              onClick={() => toggleCard(card.id)}
              size="sm"
            />
          ))}
        </div>

        <button
          onClick={() => onReturn(Array.from(selected))}
          disabled={selected.size !== cardCount}
          className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg"
        >
          Zurückgeben
        </button>
      </div>
    </div>
  );
};
