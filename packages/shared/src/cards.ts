import { Card, Suit, Rank, ReservationType } from './types';

// ============================================================
// Card Points
// ============================================================

export const RANK_POINTS: Record<Rank, number> = {
  'as': 11,
  '10': 10,
  'koenig': 4,
  'dame': 3,
  'bauer': 2,
};

// ============================================================
// Trump Order (lower index = higher trump)
// Normal game trump order:
// 0: Herz-10 (Dulle) - second beats first
// 1: Kreuz-Dame
// 2: Pik-Dame
// 3: Herz-Dame
// 4: Karo-Dame
// 5: Kreuz-Bauer
// 6: Pik-Bauer
// 7: Herz-Bauer
// 8: Karo-Bauer
// 9: Karo-As
// 10: Karo-10
// 11: Karo-Koenig
// ============================================================

function getTrumpOrder(suit: Suit, rank: Rank, reservation?: ReservationType): number | undefined {
  // Special solos handled separately
  if (reservation === 'damen-solo') {
    if (rank === 'dame') {
      const order = ['kreuz', 'pik', 'herz', 'karo'].indexOf(suit);
      return order >= 0 ? order : undefined;
    }
    return undefined;
  }
  if (reservation === 'bauern-solo') {
    if (rank === 'bauer') {
      const order = ['kreuz', 'pik', 'herz', 'karo'].indexOf(suit);
      return order >= 0 ? order : undefined;
    }
    return undefined;
  }
  if (reservation === 'koenig-solo') {
    if (rank === 'koenig') {
      const order = ['kreuz', 'pik', 'herz', 'karo'].indexOf(suit);
      return order >= 0 ? order : undefined;
    }
    return undefined;
  }
  if (reservation === 'fleischlos') {
    return undefined; // no trumps
  }
  if (reservation === 'kreuz-solo') {
    return getColorSoloOrder(suit, rank, 'kreuz');
  }
  if (reservation === 'pik-solo') {
    return getColorSoloOrder(suit, rank, 'pik');
  }
  if (reservation === 'herz-solo') {
    return getColorSoloOrder(suit, rank, 'herz');
  }
  if (reservation === 'trumpf-solo') {
    // Trumpf-Solo = Karo-Farbensolo (normal trump order)
    return getNormalTrumpOrder(suit, rank);
  }

  // Normal game (also hochzeit, schwein)
  return getNormalTrumpOrder(suit, rank);
}

function getNormalTrumpOrder(suit: Suit, rank: Rank): number | undefined {
  // Herz-10 (Dulle)
  if (suit === 'herz' && rank === '10') return 0;
  // Damen
  if (rank === 'dame') {
    const suitOrder: Record<Suit, number> = { kreuz: 1, pik: 2, herz: 3, karo: 4 };
    return suitOrder[suit];
  }
  // Buben
  if (rank === 'bauer') {
    const suitOrder: Record<Suit, number> = { kreuz: 5, pik: 6, herz: 7, karo: 8 };
    return suitOrder[suit];
  }
  // Karo cards
  if (suit === 'karo') {
    if (rank === 'as') return 9;
    if (rank === '10') return 10;
    if (rank === 'koenig') return 11;
  }
  return undefined;
}

function getColorSoloOrder(suit: Suit, rank: Rank, trumpSuit: Suit): number | undefined {
  // In color solo: Damen and Buben are still trump
  if (rank === 'dame') {
    const suitOrder: Record<Suit, number> = { kreuz: 0, pik: 1, herz: 2, karo: 3 };
    return suitOrder[suit];
  }
  if (rank === 'bauer') {
    const suitOrder: Record<Suit, number> = { kreuz: 4, pik: 5, herz: 6, karo: 7 };
    return suitOrder[suit];
  }
  // Trump suit cards (As > 10 > Koenig, no Herz-10 special)
  if (suit === trumpSuit) {
    if (rank === 'as') return 8;
    if (rank === '10') return 9;
    if (rank === 'koenig') return 10;
  }
  return undefined;
}

// ============================================================
// Create the 40-card deck
// ============================================================

export function createDeck(reservation?: ReservationType): Card[] {
  const suits: Suit[] = ['kreuz', 'pik', 'herz', 'karo'];
  const ranks: Rank[] = ['as', '10', 'koenig', 'dame', 'bauer'];
  const cards: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      // Skip 7, 8, 9 (not in Doppelkopf)
      // Skip Herz-10 second copy handled separately
      for (let copy = 1; copy <= 2; copy++) {
        const id = `${suit}-${rank}-${copy}`;
        const trumpOrder = getTrumpOrder(suit, rank, reservation);
        cards.push({
          id,
          suit,
          rank,
          points: RANK_POINTS[rank],
          isTrump: trumpOrder !== undefined,
          trumpOrder,
        });
      }
    }
  }

  return cards;
}

// ============================================================
// Trump check helpers
// ============================================================

export function isTrumpCard(card: Card): boolean {
  return card.isTrump;
}

export function isKreuzDame(card: Card): boolean {
  return card.suit === 'kreuz' && card.rank === 'dame';
}

export function isKaroAs(card: Card): boolean {
  return card.suit === 'karo' && card.rank === 'as';
}

export function isHerzZehn(card: Card): boolean {
  return card.suit === 'herz' && card.rank === '10';
}

export function isKreuzBauer(card: Card): boolean {
  return card.suit === 'kreuz' && card.rank === 'bauer';
}

// ============================================================
// Card comparison
// ============================================================

// Returns true if challenger beats currentWinner in context of leadSuit
export function cardBeats(
  challenger: Card,
  currentWinner: Card,
  leadSuit: Suit,
  schweinActive: boolean,
  schweinPlayerId?: string,
  challengerPlayerId?: string
): boolean {
  const challengerIsTrump = challenger.isTrump;
  const winnerIsTrump = currentWinner.isTrump;

  // Trump beats non-trump
  if (challengerIsTrump && !winnerIsTrump) return true;
  if (!challengerIsTrump && winnerIsTrump) return false;

  // Both trump
  if (challengerIsTrump && winnerIsTrump) {
    return compareTrumps(challenger, currentWinner, schweinActive, schweinPlayerId, challengerPlayerId);
  }

  // Both non-trump: only beats if same suit and higher rank
  if (challenger.suit === leadSuit && currentWinner.suit !== leadSuit) return true;
  if (challenger.suit !== leadSuit && currentWinner.suit === leadSuit) return false;
  if (challenger.suit !== leadSuit && currentWinner.suit !== leadSuit) return false;

  // Same suit, compare by points (As > 10 > Koenig)
  return compareNonTrumpRanks(challenger.rank) > compareNonTrumpRanks(currentWinner.rank);
}

function compareNonTrumpRanks(rank: Rank): number {
  const order: Record<Rank, number> = { 'as': 3, '10': 2, 'koenig': 1, 'dame': 0, 'bauer': 0 };
  return order[rank];
}

function compareTrumps(
  a: Card,
  b: Card,
  schweinActive: boolean,
  schweinPlayerId?: string,
  aPlayerId?: string
): boolean {
  let aOrder = a.trumpOrder ?? 999;
  let bOrder = b.trumpOrder ?? 999;

  // Schwein: Karo-As becomes highest trump (order -1, above Herz-10)
  if (schweinActive) {
    if (isKaroAs(a)) aOrder = -1;
    if (isKaroAs(b)) bOrder = -1;
  }

  // Herz-10 (Dulle): second beats first (both have order 0)
  if (isHerzZehn(a) && isHerzZehn(b)) {
    // The second Dulle wins - we identify "second" as the challenger
    return true; // challenger (a) beats current winner (b)
  }

  return aOrder < bOrder;
}

// ============================================================
// Get effective suit of a card (for following suit)
// ============================================================

export function getEffectiveSuit(card: Card): Suit | 'trump' {
  if (card.isTrump) return 'trump';
  return card.suit;
}

// ============================================================
// Shuffle
// ============================================================

export function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================================
// Valid cards to play
// ============================================================

export function getValidCards(
  hand: Card[],
  trick: { cards: { cardId: string; playerId: string }[]; leadSuit?: import('./types').Suit } | null,
  isLeader: boolean,
  deck: Card[]
): Card[] {
  if (isLeader || !trick || trick.cards.length === 0) {
    return hand; // Can play any card when leading
  }

  const firstCardId = trick.cards[0].cardId;
  const firstCard = deck.find(c => c.id === firstCardId);
  if (!firstCard) return hand;

  const leadEffective = getEffectiveSuit(firstCard);

  // Must follow suit if possible
  const canFollow = hand.filter(c => getEffectiveSuit(c) === leadEffective);
  if (canFollow.length > 0) return canFollow;

  // Cannot follow - can play anything
  return hand;
}

// ============================================================
// Count trumps in hand
// ============================================================

export function countTrumps(hand: Card[]): number {
  return hand.filter(c => c.isTrump).length;
}

// ============================================================
// Check if player has Kreuz-Dame
// ============================================================

export function hasKreuzDame(hand: Card[]): boolean {
  return hand.some(isKreuzDame);
}

export function countKreuzDamen(hand: Card[]): number {
  return hand.filter(isKreuzDame).length;
}

export function countKaroAsse(hand: Card[]): number {
  return hand.filter(isKaroAs).length;
}

// ============================================================
// Get sorted hand for display
// ============================================================

export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    // Trumps first
    if (a.isTrump && !b.isTrump) return -1;
    if (!a.isTrump && b.isTrump) return 1;

    if (a.isTrump && b.isTrump) {
      return (a.trumpOrder ?? 99) - (b.trumpOrder ?? 99);
    }

    // Non-trump: group by suit then rank
    const suitOrder: Record<Suit, number> = { kreuz: 0, pik: 1, herz: 2, karo: 3 };
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];

    const rankOrder: Record<Rank, number> = { 'as': 0, '10': 1, 'koenig': 2, 'dame': 3, 'bauer': 4 };
    return rankOrder[a.rank] - rankOrder[b.rank];
  });
}

// ============================================================
// Rebuild deck with schwein active (Karo-As become top trumps)
// ============================================================

export function rebuildDeckWithSchwein(deck: Card[]): Card[] {
  return deck.map(card => {
    if (isKaroAs(card)) {
      return { ...card, isTrump: true, trumpOrder: -1 };
    }
    return card;
  });
}
