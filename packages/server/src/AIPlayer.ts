import {
  GameState, Card, Player, ReservationType, AnnouncementType, Suit, Trick
} from '@dokoapp/shared';
import {
  getValidCards, isKaroAs, cardBeats,
  countTrumps, countKreuzDamen, countKaroAsse, isKreuzDame, isKreuzBauer
} from '@dokoapp/shared';

export class AIPlayer {
  private playerId: string;

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  // ============================================================
  // Card memory helpers
  // ============================================================

  private getPlayedCardIds(state: GameState): Set<string> {
    const played = new Set<string>();
    for (const trick of state.completedTricks) {
      for (const tc of trick.cards) played.add(tc.cardId);
    }
    if (state.currentTrick) {
      for (const tc of state.currentTrick.cards) played.add(tc.cardId);
    }
    return played;
  }

  private getRemainingCards(state: GameState, myHand: Card[]): Card[] {
    const played = this.getPlayedCardIds(state);
    const myIds = new Set(myHand.map(c => c.id));
    return state.cardDeck.filter(c => !played.has(c.id) && !myIds.has(c.id));
  }

  // How many trumps are still unseen (not in my hand, not played)
  private countRemainingTrumps(state: GameState, myHand: Card[]): number {
    return this.getRemainingCards(state, myHand).filter(c => c.isTrump).length;
  }

  // Are all Kreuz-Damen gone (played or in my hand)?
  private allKreuzDamenAccountedFor(state: GameState, myHand: Card[]): boolean {
    const played = this.getPlayedCardIds(state);
    const inMyHand = new Set(myHand.map(c => c.id));
    return state.cardDeck
      .filter(c => isKreuzDame(c))
      .every(c => played.has(c.id) || inMyHand.has(c.id));
  }

  // Has a suit been voided by any opponent (they couldn't follow)?
  private isSuitVoidedByOpponents(state: GameState, suit: Suit): boolean {
    for (const trick of state.completedTricks) {
      if (trick.cards.length < 2) continue;
      const leadCard = state.cardDeck.find(c => c.id === trick.cards[0].cardId);
      if (!leadCard || leadCard.isTrump || leadCard.suit !== suit) continue;
      for (let i = 1; i < trick.cards.length; i++) {
        const tc = trick.cards[i];
        const card = state.cardDeck.find(c => c.id === tc.cardId);
        if (!card) continue;
        if (card.isTrump || card.suit !== suit) return true; // discarded or trumped = void
      }
    }
    return false;
  }

  // Count how many cards of a suit (non-trump) have been played
  private countSuitPlayed(state: GameState, suit: Suit): number {
    const played = this.getPlayedCardIds(state);
    return state.cardDeck.filter(c => !c.isTrump && c.suit === suit && played.has(c.id)).length;
  }

  // Total non-trump cards per suit (without duplicates distinction — just deck count)
  private totalSuitCards(state: GameState, suit: Suit): number {
    return state.cardDeck.filter(c => !c.isTrump && c.suit === suit).length;
  }

  // ============================================================
  // Partner detection
  // ============================================================

  // Identify likely partner based on announcements and played Kreuz-Damen
  private findLikelyPartner(state: GameState, player: Player): string | null {
    const myTeam = player.team;
    if (!myTeam) return null;
    for (const p of state.players) {
      if (p.id === player.id) continue;
      if (p.team === myTeam) return p.id; // known from game state
    }
    return null;
  }

  // ============================================================
  // Main entry
  // ============================================================

  chooseCard(state: GameState): string {
    const player = state.players.find(p => p.id === this.playerId)!;
    const hand = player.cards.map(id => state.cardDeck.find(c => c.id === id)!).filter(Boolean);
    const isLeader = !state.currentTrick || state.currentTrick.cards.length === 0;
    const validCards = getValidCards(hand, state.currentTrick, isLeader, state.cardDeck);

    if (validCards.length === 0) return hand[0]?.id ?? '';
    if (validCards.length === 1) return validCards[0].id;

    if (isLeader) return this.chooseLeadCard(state, player, validCards, hand);
    return this.chooseFollowCard(state, player, validCards, hand);
  }

  // ============================================================
  // Lead card selection
  // ============================================================

  private chooseLeadCard(
    state: GameState,
    player: Player,
    validCards: Card[],
    hand: Card[]
  ): string {
    const trumps = validCards.filter(c => c.isTrump);
    const nonTrumps = validCards.filter(c => !c.isTrump);
    const myTrumpCount = countTrumps(hand);
    const remainingTrumps = this.countRemainingTrumps(state, hand);
    const totalTricksLeft = 10 - state.completedTricks.length;
    const myHasKreuzDame = hand.some(isKreuzDame);
    const allDamenGone = this.allKreuzDamenAccountedFor(state, hand);
    const partnerId = this.findLikelyPartner(state, player);

    // --- Trump lead strategy ---
    const shouldLeadTrump =
      // Have Kreuz-Dame(n) and opponent trumps still out — flush them
      (myHasKreuzDame && remainingTrumps > 4) ||
      // Trump-heavy hand with many remaining — force opponents
      (myTrumpCount >= 7 && remainingTrumps > 3) ||
      // All Kreuz-Damen gone, play remaining trumps freely
      (allDamenGone && myTrumpCount > remainingTrumps / 2 && myTrumpCount >= 4);

    if (shouldLeadTrump && trumps.length > 0) {
      return this.bestTrumpToLead(trumps, hand, myHasKreuzDame);
    }

    // --- Ace lead (safe side suit control) ---
    const aces = nonTrumps.filter(c => c.rank === 'as');
    for (const ace of aces) {
      const suit = ace.suit as Suit;
      // Lead ace if opponents haven't voided this suit yet
      if (!this.isSuitVoidedByOpponents(state, suit)) {
        return ace.id;
      }
    }

    // --- Safe non-trump lead ---
    // Lead a suit where we have length and haven't been voided yet
    const safeSuits = (['kreuz', 'pik', 'herz'] as Suit[]).filter(suit => {
      if (suit === 'karo') return false; // Karo is often trump-related
      const myInSuit = nonTrumps.filter(c => c.suit === suit);
      return myInSuit.length >= 2 && !this.isSuitVoidedByOpponents(state, suit);
    });

    for (const suit of safeSuits) {
      const inSuit = nonTrumps.filter(c => c.suit === suit).sort((a, b) => a.points - b.points);
      if (inSuit.length > 0) return inSuit[0].id;
    }

    // --- Discard lowest non-trump ---
    if (nonTrumps.length > 0) {
      const sorted = [...nonTrumps].sort((a, b) => a.points - b.points);
      return sorted[0].id;
    }

    // --- Must lead trump ---
    if (trumps.length > 0) {
      // Lead weakest trump to probe
      const sorted = [...trumps].sort((a, b) => (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0));
      return sorted[0].id;
    }

    return validCards[0].id;
  }

  // Choose which trump to lead: if we have Kreuz-Dame, start with it to score;
  // otherwise lead a mid-strength trump to pull out opponents' trumps
  private bestTrumpToLead(trumps: Card[], hand: Card[], myHasKreuzDame: boolean): string {
    const damen = trumps.filter(isKreuzDame);
    if (damen.length > 0) return damen[0].id; // Lead Kreuz-Dame to score

    const bauern = trumps.filter(isKreuzBauer);
    if (bauern.length > 0 && !myHasKreuzDame) return bauern[0].id; // Lead Bauer

    // Lead weakest trump to avoid wasting high ones early
    const sorted = [...trumps].sort((a, b) => (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0));
    return sorted[0].id;
  }

  // ============================================================
  // Follow card selection
  // ============================================================

  private chooseFollowCard(
    state: GameState,
    player: Player,
    validCards: Card[],
    hand: Card[]
  ): string {
    const trick = state.currentTrick!;
    const myTeam = player.team;
    const isLastToPlay = trick.cards.length === 3;
    const isSecondToPlay = trick.cards.length === 1;

    const { winnerId: currentWinnerId } = this.getCurrentTrickWinner(state, trick);
    const currentWinnerTeam = state.players.find(p => p.id === currentWinnerId)?.team;
    const teamIsWinning = currentWinnerTeam === myTeam;

    const leadCardId = trick.cards[0].cardId;
    const leadCard = state.cardDeck.find(c => c.id === leadCardId);
    const winnerCardId = trick.cards.find(tc => tc.playerId === currentWinnerId)?.cardId;
    const winnerCard = state.cardDeck.find(c => c.id === winnerCardId);

    // Calculate trick value (points already in trick)
    const trickValue = trick.cards.reduce((sum, tc) => {
      const card = state.cardDeck.find(c => c.id === tc.cardId);
      return sum + (card?.points ?? 0);
    }, 0);

    const winningCards = validCards.filter(c => {
      if (!winnerCard || !leadCard) return false;
      return cardBeats(c, winnerCard, leadCard.suit as Suit, state.schweinActive);
    });

    // --- Team is currently winning ---
    if (teamIsWinning) {
      if (isLastToPlay) {
        // Dump highest point card to maximize trick value
        const sorted = [...validCards].sort((a, b) => b.points - a.points);
        return sorted[0].id;
      }

      // Not last: if trick is valuable (≥10 pts), don't risk partner losing it
      // Play a safe card — lowest non-trump, or lowest trump if forced
      const nonTrumpLow = validCards.filter(c => !c.isTrump).sort((a, b) => a.points - b.points);
      if (nonTrumpLow.length > 0) return nonTrumpLow[0].id;

      // Only have trumps — play lowest
      const sorted = [...validCards].sort((a, b) => (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0));
      return sorted[0].id;
    }

    // --- Team is losing: try to win ---
    if (winningCards.length > 0) {
      // If trick value is low (< 5 pts) and we'd have to spend a trump, don't bother
      const trumpWins = winningCards.filter(c => c.isTrump);
      const nonTrumpWins = winningCards.filter(c => !c.isTrump);

      // Prefer winning with non-trump
      if (nonTrumpWins.length > 0) {
        const sorted = [...nonTrumpWins].sort((a, b) => a.points - b.points);
        return sorted[0].id;
      }

      // Use trump only if trick is worth it (≥5 pts) or it's the last card and we must
      if (trickValue >= 5 || isLastToPlay) {
        // Play cheapest winning trump (don't waste Kreuz-Dame on low-value tricks)
        const sortedTrumps = [...trumpWins].sort((a, b) => {
          // Prefer weaker trumps first (higher trumpOrder = weaker)
          return (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0);
        });
        // But don't waste Kreuz-Dame on tricks worth < 10 unless last resort
        if (trickValue < 10 && isKreuzDame(sortedTrumps[0]) && sortedTrumps.length > 1) {
          return sortedTrumps[1]?.id ?? sortedTrumps[0].id;
        }
        return sortedTrumps[0].id;
      }
    }

    // --- Can't or won't win: smart discard ---
    return this.chooseBestDiscard(validCards, hand, state);
  }

  // When we can't win, discard the least valuable card strategically
  private chooseBestDiscard(validCards: Card[], hand: Card[], state: GameState): string {
    // 1. Discard non-trump with 0 points first (König, 9 if exists)
    const zeroPtNonTrump = validCards.filter(c => !c.isTrump && c.points === 0);
    if (zeroPtNonTrump.length > 0) return zeroPtNonTrump[0].id;

    // 2. Discard low-point non-trump
    const lowNonTrump = validCards.filter(c => !c.isTrump && c.points <= 3);
    if (lowNonTrump.length > 0) {
      return lowNonTrump.sort((a, b) => a.points - b.points)[0].id;
    }

    // 3. If forced to give away points, discard weakest non-trump
    const nonTrumps = validCards.filter(c => !c.isTrump);
    if (nonTrumps.length > 0) {
      return nonTrumps.sort((a, b) => a.points - b.points)[0].id;
    }

    // 4. Must discard a trump — play the weakest one
    const sorted = [...validCards].sort((a, b) => (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0));
    return sorted[0].id;
  }

  // ============================================================
  // Trick winner helper
  // ============================================================

  private getCurrentTrickWinner(
    state: GameState,
    trick: NonNullable<GameState['currentTrick']>
  ): { winnerId: string; winnerCard: Card | undefined } {
    if (trick.cards.length === 0) return { winnerId: '', winnerCard: undefined };

    let winnerId = trick.cards[0].playerId;
    let winnerCard = state.cardDeck.find(c => c.id === trick.cards[0].cardId);
    const leadCard = winnerCard;
    const leadSuit: Suit = leadCard?.suit ?? 'karo';

    for (let i = 1; i < trick.cards.length; i++) {
      const tc = trick.cards[i];
      const card = state.cardDeck.find(c => c.id === tc.cardId);
      if (!card || !winnerCard) continue;
      if (cardBeats(card, winnerCard, leadSuit, state.schweinActive)) {
        winnerCard = card;
        winnerId = tc.playerId;
      }
    }

    return { winnerId, winnerCard };
  }

  // ============================================================
  // Reservation
  // ============================================================

  chooseReservation(state: GameState, options: ReservationType[]): ReservationType {
    const player = state.players.find(p => p.id === this.playerId)!;
    const hand = player.cards.map(id => state.cardDeck.find(c => c.id === id)!).filter(Boolean);

    if (options.includes('hochzeit') && countKreuzDamen(hand) === 2) return 'hochzeit';
    if (options.includes('schwein') && countKaroAsse(hand) === 2) return 'schwein';
    if (options.includes('armut') && countTrumps(hand) <= 2) return 'armut';

    return 'none';
  }

  // ============================================================
  // Announcement — much stricter thresholds
  // ============================================================

  chooseAnnouncement(state: GameState, options: AnnouncementType[]): AnnouncementType | null {
    if (options.length === 0) return null;

    const player = state.players.find(p => p.id === this.playerId)!;
    const hand = player.cards.map(id => state.cardDeck.find(c => c.id === id)!).filter(Boolean);
    const trumpCount = countTrumps(hand);
    const myTeam = player.team;
    const hasDame = hand.some(isKreuzDame);
    const hasBauer = hand.some(isKreuzBauer);

    // Re: only announce with clearly superior trump hand
    // Need ≥8 trumps, or ≥7 + Kreuz-Dame, or both Damen
    if (options.includes('re') && myTeam === 're') {
      const bothDamen = countKreuzDamen(hand) === 2;
      if (bothDamen || trumpCount >= 8 || (trumpCount >= 7 && hasDame)) {
        return 're';
      }
    }

    // Contra: announce if opponent has declared Re AND we have strong hand
    // ≥7 trumps, or ≥6 + Kreuz-Dame
    if (options.includes('contra') && myTeam === 'contra') {
      const reAnnounced = state.announcements.some(a => a.type === 're');
      if (reAnnounced && (trumpCount >= 7 || (trumpCount >= 6 && hasDame))) {
        return 'contra';
      }
      // Also announce Contra proactively with very strong hand
      if (!reAnnounced && trumpCount >= 8) {
        return 'contra';
      }
    }

    return null;
  }

  // ============================================================
  // Armut card exchange
  // ============================================================

  chooseArmutCards(state: GameState, count: number): string[] {
    const player = state.players.find(p => p.id === this.playerId)!;
    const hand = player.cards.map(id => state.cardDeck.find(c => c.id === id)!).filter(Boolean);

    // Give away non-trumps with lowest value first, then weakest trumps last
    const nonTrumps = hand.filter(c => !c.isTrump).sort((a, b) => a.points - b.points);
    const trumps = hand.filter(c => c.isTrump).sort((a, b) => (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0));

    return [...nonTrumps, ...trumps].slice(0, count).map(c => c.id);
  }
}
