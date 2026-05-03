import {
  GameState, Player, Card, Trick, TrickCard, ReservationType,
  AnnouncementType, Team, Announcement, GamePhase
} from './types';
import {
  createDeck, shuffleDeck, cardBeats, getEffectiveSuit, getValidCards,
  isKreuzDame, isKaroAs, isHerzZehn, isKreuzBauer,
  countKreuzDamen, countKaroAsse, countTrumps, hasKreuzDame
} from './cards';

// ============================================================
// Determine teams based on reservation
// ============================================================

export function determineTeams(
  players: Player[],
  activeReservation: ReservationType | undefined,
  soloPlayerId: string | undefined,
  hochzeitPlayerId: string | undefined,
  deck: Card[]
): void {
  if (soloPlayerId) {
    // Solo: one vs three
    for (const p of players) {
      p.team = p.id === soloPlayerId ? 're' : 'contra';
    }
    return;
  }

  if (hochzeitPlayerId) {
    // Hochzeit: team determined dynamically (partner is first to win non-trump trick)
    for (const p of players) {
      p.team = p.id === hochzeitPlayerId ? 're' : undefined;
    }
    return;
  }

  // Normal game: Kreuz-Dame determines team
  for (const p of players) {
    const hand = p.cards.map(id => deck.find(c => c.id === id)!).filter(Boolean);
    p.team = hand.some(isKreuzDame) ? 're' : 'contra';
  }
}

// ============================================================
// Determine trick winner
// ============================================================

export function determineTrickWinner(
  trick: Trick,
  deck: Card[],
  schweinActive: boolean,
  schweinPlayerId?: string
): string {
  let winnerCard = deck.find(c => c.id === trick.cards[0].cardId)!;
  let winnerId = trick.cards[0].playerId;
  const leadSuit = winnerCard.suit;

  for (let i = 1; i < trick.cards.length; i++) {
    const tc = trick.cards[i];
    const card = deck.find(c => c.id === tc.cardId)!;
    if (cardBeats(card, winnerCard, leadSuit, schweinActive, schweinPlayerId, tc.playerId)) {
      winnerCard = card;
      winnerId = tc.playerId;
    }
  }

  return winnerId;
}

// ============================================================
// Check trick special properties
// ============================================================

export function checkTrickSpecials(trick: Trick, deck: Card[]): void {
  const cards = trick.cards.map(tc => deck.find(c => c.id === tc.cardId)!).filter(Boolean);

  // Sonntag: all Herz
  trick.isSonntag = cards.every(c => c.suit === 'herz' && !c.isTrump);

  // Doppelkopf: all 10s and Aces (Volle)
  trick.isDoublekopf = cards.length === 4 &&
    cards.every(c => c.rank === '10' || c.rank === 'as') &&
    trick.points >= 40;
}

// ============================================================
// Hochzeit partner detection
// ============================================================

export function checkHochzeitPartner(
  trick: Trick,
  hochzeitPlayerId: string,
  players: Player[],
  deck: Card[]
): string | null {
  if (!trick.winnerId || trick.winnerId === hochzeitPlayerId) return null;

  // Check if trick was a non-trump lead
  const firstCard = deck.find(c => c.id === trick.cards[0].cardId);
  if (!firstCard || firstCard.isTrump) return null;

  return trick.winnerId;
}

// ============================================================
// Get valid announcement types
// ============================================================

export function getValidAnnouncements(
  player: Player,
  state: GameState
): AnnouncementType[] {
  if (state.activeReservation?.includes('solo')) {
    return []; // No announcements in solo
  }

  const trickIndex = state.completedTricks.length;
  const team = player.team;
  if (!team) return [];

  const teamAnnouncements = state.announcements.filter(a => a.team === team);
  const myAnnouncements = state.announcements.filter(a => a.playerId === player.id);

  const options: AnnouncementType[] = [];

  // Re/Contra: only before the first card of the 2nd trick (during trick 1 only)
  if (trickIndex < 1) {
    if (team === 're' && !teamAnnouncements.some(a => a.type === 're')) {
      options.push('re');
    }
    if (team === 'contra' && !teamAnnouncements.some(a => a.type === 'contra')) {
      options.push('contra');
    }
  }

  const hasBaseAnnouncement = teamAnnouncements.some(a => a.type === 're' || a.type === 'contra');

  if (hasBaseAnnouncement) {
    // Keine 90: before first card of 3rd trick
    if (trickIndex < 2 && !teamAnnouncements.some(a => a.type === 'keine90')) {
      options.push('keine90');
    }
    // Keine 60: before first card of 4th trick
    if (teamAnnouncements.some(a => a.type === 'keine90') && trickIndex < 3 && !teamAnnouncements.some(a => a.type === 'keine60')) {
      options.push('keine60');
    }
    // Keine 30: before first card of 5th trick
    if (teamAnnouncements.some(a => a.type === 'keine60') && trickIndex < 4 && !teamAnnouncements.some(a => a.type === 'keine30')) {
      options.push('keine30');
    }
    // Schwarz: before first card of 6th trick
    if (teamAnnouncements.some(a => a.type === 'keine30') && trickIndex < 5 && !teamAnnouncements.some(a => a.type === 'schwarz')) {
      options.push('schwarz');
    }
  }

  return options;
}

// ============================================================
// Check win conditions
// ============================================================

export function checkWinCondition(
  rePoints: number,
  contraPoints: number,
  announcements: Announcement[],
  isSolo: boolean
): { winner: Team; reWin: boolean } {
  const totalPoints = rePoints + contraPoints;
  const threshold = isSolo ? 121 : 121; // Both need 121 to win outright

  const reWin = rePoints > 120;
  const contraWin = contraPoints >= (isSolo ? 120 : 120); // Contra wins at 120:120

  if (rePoints === 120 && contraPoints === 120) {
    // 120:120 -> Re loses
    return { winner: 'contra', reWin: false };
  }

  return {
    winner: reWin ? 're' : 'contra',
    reWin,
  };
}

// ============================================================
// Reservation phase helpers
// ============================================================

export function getReservationOptions(
  player: Player,
  deck: Card[],
  allPlayers: Player[]
): ReservationType[] {
  const hand = player.cards.map(id => deck.find(c => c.id === id)!).filter(Boolean);
  const options: ReservationType[] = ['none'];

  // Check for solo options
  // Any hand can declare a solo
  options.push('damen-solo');
  options.push('bauern-solo');
  options.push('koenig-solo');
  options.push('fleischlos');
  options.push('kreuz-solo');
  options.push('pik-solo');
  options.push('herz-solo');

  return options;
}

export function getSmallReservationOptions(
  player: Player,
  deck: Card[],
  phase: 'small'
): ReservationType[] {
  const hand = player.cards.map(id => deck.find(c => c.id === id)!).filter(Boolean);
  const options: ReservationType[] = ['none'];

  // Hochzeit: both Kreuz-Damen
  if (countKreuzDamen(hand) === 2) {
    options.push('hochzeit');
  }

  // Schwein: both Karo-Asse
  if (countKaroAsse(hand) === 2) {
    options.push('schwein');
  }

  // Armut: <= 3 trumps
  if (countTrumps(hand) <= 3) {
    options.push('armut');
  }

  return options;
}

// ============================================================
// Check for Schmeissen (5+ Koenige)
// ============================================================

export function checkSchmeissen(player: Player, deck: Card[]): boolean {
  const hand = player.cards.map(id => deck.find(c => c.id === id)!).filter(Boolean);
  const koenige = hand.filter(c => c.rank === 'koenig').length;
  return koenige >= 5;
}

// ============================================================
// Initialize new game
// ============================================================

export function createInitialGameState(
  roomId: string,
  players: Player[],
  dealerPosition: number,
  roundNumber: number,
  scores: Record<string, number>
): GameState {
  const deck = createDeck();
  const shuffled = shuffleDeck(deck);

  // Deal 10 cards to each player
  const playersCopy = players.map(p => ({ ...p }));
  const cardsPerPlayer = 10;

  for (let i = 0; i < playersCopy.length; i++) {
    const startIdx = i * cardsPerPlayer;
    playersCopy[i].cards = shuffled.slice(startIdx, startIdx + cardsPerPlayer).map(c => c.id);
    playersCopy[i].cardCount = cardsPerPlayer;
    playersCopy[i].team = undefined;
    playersCopy[i].reservation = undefined;
    playersCopy[i].reservationDeclared = false;
    playersCopy[i].tricksWon = 0;
    playersCopy[i].trickPoints = 0;
  }

  // First player to the left of dealer starts reservation phase
  const firstReservationPlayer = (dealerPosition + 1) % 4;

  return {
    id: `game-${Date.now()}`,
    roomId,
    phase: 'reservations',
    roundNumber,
    players: playersCopy,
    dealerPosition,
    currentPlayerIndex: firstReservationPlayer,
    currentTrick: null,
    completedTricks: [],
    announcements: [],
    reservationPhase: {
      currentPlayerIndex: firstReservationPlayer,
      phase: 'solo',
    },
    schweinActive: false,
    scores: { ...scores },
    validCards: [],
    cardDeck: shuffled,
    trickLeaderPosition: firstReservationPlayer,
    gameLog: [`Runde ${roundNumber} beginnt. Geber: ${players[dealerPosition].name}`],
  };
}
