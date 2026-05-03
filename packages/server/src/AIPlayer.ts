import {
  GameState, Card, Player, ReservationType, AnnouncementType, Suit
} from '@dokoapp/shared';
import {
  getValidCards, cardBeats,
  countTrumps, countKreuzDamen, countKaroAsse,
  isKreuzDame, isKreuzBauer, isKaroAs, isHerzZehn
} from '@dokoapp/shared';

export class AIPlayer {
  private playerId: string;

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  // ============================================================
  // Card memory
  // ============================================================

  private getPlayedIds(state: GameState): Set<string> {
    const s = new Set<string>();
    for (const t of state.completedTricks)
      for (const tc of t.cards) s.add(tc.cardId);
    if (state.currentTrick)
      for (const tc of state.currentTrick.cards) s.add(tc.cardId);
    return s;
  }

  private unseenCards(state: GameState, myHand: Card[]): Card[] {
    const played = this.getPlayedIds(state);
    const mine = new Set(myHand.map(c => c.id));
    return state.cardDeck.filter(c => !played.has(c.id) && !mine.has(c.id));
  }

  private remainingTrumps(state: GameState, myHand: Card[]): Card[] {
    return this.unseenCards(state, myHand).filter(c => c.isTrump);
  }

  private remainingInSuit(state: GameState, myHand: Card[], suit: Suit): Card[] {
    return this.unseenCards(state, myHand).filter(c => !c.isTrump && c.suit === suit);
  }

  // Is a specific trump rank still unseen (dangerous out there)?
  private trumpStillOut(state: GameState, myHand: Card[], predicate: (c: Card) => boolean): boolean {
    return this.unseenCards(state, myHand).some(predicate);
  }

  // Has any opponent voided this suit?
  private suitVoidedByOpponent(state: GameState, suit: Suit, myTeam: string | undefined): boolean {
    for (const trick of state.completedTricks) {
      const leadCard = state.cardDeck.find(c => c.id === trick.cards[0]?.cardId);
      if (!leadCard || leadCard.isTrump || leadCard.suit !== suit) continue;
      for (let i = 1; i < trick.cards.length; i++) {
        const tc = trick.cards[i];
        const card = state.cardDeck.find(c => c.id === tc.cardId);
        const player = state.players.find(p => p.id === tc.playerId);
        if (!card) continue;
        // Opponent voided the suit
        if ((card.isTrump || card.suit !== suit) && player?.team !== myTeam) return true;
      }
    }
    return false;
  }

  // ============================================================
  // Partner detection from played Kreuz-Damen
  // ============================================================

  private findKnownPartner(state: GameState, myTeam: string | undefined): string | null {
    if (!myTeam) return null;
    for (const p of state.players) {
      if (p.id === this.playerId) continue;
      if (p.team === myTeam) return p.id;
    }
    return null;
  }

  private isKnownPartner(state: GameState, playerId: string, myTeam: string | undefined): boolean {
    if (!myTeam) return false;
    const p = state.players.find(p => p.id === playerId);
    return p?.team === myTeam;
  }

  // ============================================================
  // Entry point
  // ============================================================

  chooseCard(state: GameState): string {
    const player = state.players.find(p => p.id === this.playerId)!;
    const hand = player.cards.map(id => state.cardDeck.find(c => c.id === id)!).filter(Boolean);
    const isLeader = !state.currentTrick || state.currentTrick.cards.length === 0;
    const valid = getValidCards(hand, state.currentTrick, isLeader, state.cardDeck);

    if (valid.length === 0) return hand[0]?.id ?? '';
    if (valid.length === 1) return valid[0].id;

    return isLeader
      ? this.lead(state, player, valid, hand)
      : this.follow(state, player, valid, hand);
  }

  // ============================================================
  // Lead card
  // ============================================================

  private lead(state: GameState, player: Player, valid: Card[], hand: Card[]): string {
    const trumps = valid.filter(c => c.isTrump);
    const nonTrumps = valid.filter(c => !c.isTrump);
    const myTrumps = countTrumps(hand);
    const remTrumps = this.remainingTrumps(state, hand);
    const hasDame = hand.some(isKreuzDame);
    const hasBauer = hand.some(isKreuzBauer);
    const allDamenGone = !this.trumpStillOut(state, hand, isKreuzDame) && !hasDame;
    const schwein = state.schweinActive ?? false;
    const myTeam = player.team;
    const partnerKnown = !!this.findKnownPartner(state, myTeam);

    // --- When to lead trump ---
    const shouldLeadTrump = (
      // Schwein player: always lead Karo-As to dominate
      (schwein && hand.some(isKaroAs) && trumps.some(isKaroAs)) ||
      // Kreuz-Dame: lead it to score and signal to partner
      (hasDame && remTrumps.length > 3) ||
      // Very many trumps relative to remaining
      (myTrumps >= 7 && remTrumps.length > 2) ||
      // All Damen gone → free to pull remaining trump
      (allDamenGone && myTrumps >= 4 && myTrumps > remTrumps.length / 2)
    );

    if (shouldLeadTrump && trumps.length > 0) {
      return this.bestTrumpLead(trumps, hand, hasDame, schwein);
    }

    // --- Lead an Ace if safe ---
    const aces = nonTrumps.filter(c => c.rank === 'as');
    for (const ace of aces) {
      const suit = ace.suit as Suit;
      if (!this.suitVoidedByOpponent(state, suit, myTeam) &&
          this.remainingInSuit(state, hand, suit).length > 0) {
        return ace.id;
      }
    }

    // --- Lead King if Ace already played/gone in that suit ---
    const kings = nonTrumps.filter(c => c.rank === 'koenig');
    for (const king of kings) {
      const suit = king.suit as Suit;
      const aceGone = !this.unseenCards(state, hand).some(c => !c.isTrump && c.suit === suit && c.rank === 'as')
                   && !hand.some(c => !c.isTrump && c.suit === suit && c.rank === 'as');
      if (aceGone && !this.suitVoidedByOpponent(state, suit, myTeam)) {
        return king.id;
      }
    }

    // --- Lead a suit where I have length (2+) and opponents aren't void ---
    const suits: Suit[] = ['kreuz', 'pik', 'herz'];
    for (const suit of suits) {
      const inSuit = nonTrumps.filter(c => c.suit === suit);
      if (inSuit.length >= 2 && !this.suitVoidedByOpponent(state, suit, myTeam)) {
        return inSuit.sort((a, b) => a.points - b.points)[0].id;
      }
    }

    // --- Fallback: discard lowest non-trump ---
    if (nonTrumps.length > 0) {
      return nonTrumps.sort((a, b) => a.points - b.points)[0].id;
    }

    // Must lead trump → weakest
    return trumps.sort((a, b) => (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0))[0]?.id ?? valid[0].id;
  }

  private bestTrumpLead(trumps: Card[], hand: Card[], hasDame: boolean, schwein: boolean): string {
    // Schwein active: Karo-As is highest trump — lead it
    if (schwein) {
      const karoAsse = trumps.filter(isKaroAs).sort((a, b) => (a.trumpOrder ?? 99) - (b.trumpOrder ?? 99));
      if (karoAsse.length > 0) return karoAsse[0].id;
    }
    // Lead Kreuz-Dame to score and signal Re
    const damen = trumps.filter(isKreuzDame);
    if (damen.length > 0) return damen[0].id;
    // Lead Kreuz-Bauer as second-best opener
    const bauern = trumps.filter(isKreuzBauer);
    if (bauern.length > 0) return bauern[0].id;
    // Lead Herz-Zehn (third strongest)
    const herzZehn = trumps.filter(isHerzZehn);
    if (herzZehn.length > 0) return herzZehn[0].id;
    // Lead weakest trump to probe
    return trumps.sort((a, b) => (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0))[0].id;
  }

  // ============================================================
  // Follow card
  // ============================================================

  private follow(state: GameState, player: Player, valid: Card[], hand: Card[]): string {
    const trick = state.currentTrick!;
    const myTeam = player.team;
    const isLast = trick.cards.length === 3;
    const schwein = state.schweinActive ?? false;

    const { winnerId } = this.trickWinner(state, trick);
    const winnerTeam = state.players.find(p => p.id === winnerId)?.team;
    const teamWinning = winnerTeam === myTeam;
    const partnerWinning = teamWinning && winnerId !== this.playerId;

    const leadCardId = trick.cards[0].cardId;
    const leadCard = state.cardDeck.find(c => c.id === leadCardId)!;
    const winnerCardId = trick.cards.find(tc => tc.playerId === winnerId)?.cardId;
    const winnerCard = state.cardDeck.find(c => c.id === winnerCardId);

    const trickValue = trick.cards.reduce((s, tc) =>
      s + (state.cardDeck.find(c => c.id === tc.cardId)?.points ?? 0), 0);

    const winning = valid.filter(c =>
      winnerCard && cardBeats(c, winnerCard, leadCard?.suit as Suit, schwein));

    // === Team is winning ===
    if (teamWinning) {
      if (isLast) {
        // Dump highest-value card to maximize trick score
        return valid.sort((a, b) => b.points - a.points)[0].id;
      }
      // Partner is winning: play safe (lowest), don't risk overpowering
      // Exception: if another opponent still to play and trick is valuable,
      // consider overtrumping to protect it
      if (partnerWinning && trickValue >= 10 && !isLast) {
        // Check if opponents can still overtake — if we have a guaranteed winner, use it
        const safeTrumpWin = winning.filter(c => c.isTrump && !isKreuzDame(c) && !isKaroAs(c));
        if (safeTrumpWin.length > 0 && trickValue >= 15) {
          // Use a mid-strength trump to protect the valuable trick
          return safeTrumpWin.sort((a, b) => (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0))[0].id;
        }
      }
      // Otherwise: play lowest card
      const low = valid.sort((a, b) => a.points - b.points);
      // Prefer low non-trump to save trumps
      const lowNT = low.filter(c => !c.isTrump);
      return lowNT.length > 0 ? lowNT[0].id : low[0].id;
    }

    // === Team is losing: try to win ===
    if (winning.length > 0) {
      const ntWin = winning.filter(c => !c.isTrump);
      const tWin = winning.filter(c => c.isTrump);

      // Win with non-trump if possible
      if (ntWin.length > 0) return ntWin.sort((a, b) => a.points - b.points)[0].id;

      // Use trump only if trick is worth it
      if (trickValue >= 4 || isLast) {
        return this.cheapestWinningTrump(tWin, trickValue);
      }
    }

    // === Can't or won't win: smart discard ===
    return this.discard(valid, hand, state, myTeam);
  }

  // Choose cheapest trump that wins without wasting premium cards needlessly
  private cheapestWinningTrump(trumpWins: Card[], trickValue: number): string {
    // Sort weakest first (highest trumpOrder = weakest)
    const sorted = trumpWins.sort((a, b) => (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0));
    // Don't waste Karo-As or Kreuz-Dame on low-value tricks
    if (trickValue < 10) {
      const cheap = sorted.filter(c => !isKaroAs(c) && !isKreuzDame(c));
      if (cheap.length > 0) return cheap[0].id;
    }
    return sorted[0].id;
  }

  // Smart discard: throw away the least valuable card
  private discard(valid: Card[], hand: Card[], state: GameState, myTeam: string | undefined): string {
    // 1. Discard 0-point non-trump first (König)
    const zeroPtNT = valid.filter(c => !c.isTrump && c.points === 0);
    if (zeroPtNT.length > 0) return zeroPtNT.sort((a, b) => a.points - b.points)[0].id;

    // 2. Discard from a suit opponents have voided (no future value)
    const voidedSuitCards = valid.filter(c => {
      if (c.isTrump) return false;
      return this.suitVoidedByOpponent(state, c.suit as Suit, myTeam);
    });
    if (voidedSuitCards.length > 0) {
      return voidedSuitCards.sort((a, b) => a.points - b.points)[0].id;
    }

    // 3. Discard low non-trump (but NOT aces we might still win with)
    const lowNT = valid.filter(c => !c.isTrump && c.rank !== 'as' && c.points <= 4);
    if (lowNT.length > 0) return lowNT.sort((a, b) => a.points - b.points)[0].id;

    // 4. Discard non-ace non-trump
    const nonAceNT = valid.filter(c => !c.isTrump && c.rank !== 'as');
    if (nonAceNT.length > 0) return nonAceNT.sort((a, b) => a.points - b.points)[0].id;

    // 5. Discard an ace if opponents have voided the suit (ace is worthless)
    const voidedAces = valid.filter(c => !c.isTrump && c.rank === 'as'
      && this.suitVoidedByOpponent(state, c.suit as Suit, myTeam));
    if (voidedAces.length > 0) return voidedAces[0].id;

    // 6. Must discard a trump — weakest first
    const trumps = valid.filter(c => c.isTrump);
    if (trumps.length > 0) {
      const sorted = trumps.sort((a, b) => (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0));
      // Don't throw Karo-As or Kreuz-Dame unless only option
      const cheap = sorted.filter(c => !isKaroAs(c) && !isKreuzDame(c));
      return cheap.length > 0 ? cheap[0].id : sorted[0].id;
    }

    return valid.sort((a, b) => a.points - b.points)[0].id;
  }

  // ============================================================
  // Trick winner helper
  // ============================================================

  private trickWinner(state: GameState, trick: NonNullable<GameState['currentTrick']>) {
    if (!trick.cards.length) return { winnerId: '', winnerCard: undefined };
    let winnerId = trick.cards[0].playerId;
    let winnerCard = state.cardDeck.find(c => c.id === trick.cards[0].cardId);
    const leadSuit = winnerCard?.suit ?? 'karo' as Suit;

    for (let i = 1; i < trick.cards.length; i++) {
      const card = state.cardDeck.find(c => c.id === trick.cards[i].cardId);
      if (card && winnerCard && cardBeats(card, winnerCard, leadSuit as Suit, state.schweinActive ?? false)) {
        winnerCard = card;
        winnerId = trick.cards[i].playerId;
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
  // Announcement — calibrated thresholds
  // ============================================================

  chooseAnnouncement(state: GameState, options: AnnouncementType[]): AnnouncementType | null {
    if (!options.length) return null;
    const player = state.players.find(p => p.id === this.playerId)!;
    const hand = player.cards.map(id => state.cardDeck.find(c => c.id === id)!).filter(Boolean);
    const trumpCount = countTrumps(hand);
    const myTeam = player.team;
    const hasDame = hand.some(isKreuzDame);
    const bothDamen = countKreuzDamen(hand) === 2;
    const hasSchwein = state.schweinActive && hand.some(isKaroAs);
    const reAnnounced = state.announcements.some(a => a.type === 're');

    // Re: announce with clear strength
    if (options.includes('re') && myTeam === 're') {
      if (bothDamen || hasSchwein || trumpCount >= 8 || (trumpCount >= 7 && hasDame)) {
        return 're';
      }
    }

    // Contra: respond to Re with 7+, or proactive with 8+
    if (options.includes('contra') && myTeam === 'contra') {
      if ((reAnnounced && (trumpCount >= 7 || (trumpCount >= 6 && hasDame))) ||
          (!reAnnounced && trumpCount >= 8)) {
        return 'contra';
      }
    }

    return null;
  }

  // ============================================================
  // Armut exchange
  // ============================================================

  chooseArmutCards(state: GameState, count: number): string[] {
    const player = state.players.find(p => p.id === this.playerId)!;
    const hand = player.cards.map(id => state.cardDeck.find(c => c.id === id)!).filter(Boolean);
    const nonTrumps = hand.filter(c => !c.isTrump).sort((a, b) => a.points - b.points);
    const trumps = hand.filter(c => c.isTrump)
      .sort((a, b) => (b.trumpOrder ?? 0) - (a.trumpOrder ?? 0)); // weakest first
    return [...nonTrumps, ...trumps].slice(0, count).map(c => c.id);
  }
}
