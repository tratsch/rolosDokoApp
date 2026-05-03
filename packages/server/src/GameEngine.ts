import {
  GameState, Player, Card, Trick, TrickCard, ReservationType,
  AnnouncementType, Team, Announcement, CardId, ArmutExchange
} from '@dokoapp/shared';
import {
  createDeck, shuffleDeck, cardBeats, getValidCards, getEffectiveSuit,
  isKreuzDame, isKaroAs, isHerzZehn, isKreuzBauer,
  countKreuzDamen, countKaroAsse, countTrumps, hasKreuzDame,
  getSmallReservationOptions, determineTrickWinner,
  checkTrickSpecials, getValidAnnouncements,
  calculateRoundScore
} from '@dokoapp/shared';

// ============================================================
// Game Engine - handles all game state transitions
// ============================================================

export class GameEngine {
  private state: GameState;
  private onStateChange: (state: GameState) => void;

  constructor(initialState: GameState, onStateChange: (state: GameState) => void) {
    this.state = initialState;
    this.onStateChange = onStateChange;
  }

  getState(): GameState {
    return this.state;
  }

  private setState(updates: Partial<GameState>): void {
    this.state = { ...this.state, ...updates };
  }

  private log(message: string): void {
    this.state = { ...this.state, gameLog: [...this.state.gameLog, message] };
  }

  // ============================================================
  // Reservation Phase
  // ============================================================

  handleReservation(playerId: string, type: ReservationType): { error?: string } {
    const state = this.state;

    if (state.phase !== 'reservations') {
      return { error: 'Keine Vorbehaltsphase' };
    }

    const resPhase = state.reservationPhase!;
    const currentPlayer = state.players[resPhase.currentPlayerIndex];

    if (currentPlayer.id !== playerId) {
      return { error: 'Nicht dein Zug' };
    }

    // Update player reservation
    const players = state.players.map(p => {
      if (p.id === playerId) {
        return { ...p, reservation: type, reservationDeclared: true };
      }
      return p;
    });
    this.setState({ players });

    const player = players.find(p => p.id === playerId)!;
    this.log(`${player.name} meldet: ${this.getReservationName(type)}`);

    // Process based on current phase
    if (resPhase.phase === 'solo') {
      this.processSoloPhaseStep(playerId, type);
    } else if (resPhase.phase === 'armut') {
      this.processArmutPhaseStep(playerId, type);
    } else if (resPhase.phase === 'small') {
      this.processSmallPhaseStep(playerId, type);
    }

    this.onStateChange(this.state);
    return {};
  }

  private getReservationName(type: ReservationType): string {
    const names: Record<ReservationType, string> = {
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
    return names[type];
  }

  private isSoloType(type: ReservationType): boolean {
    return ['damen-solo', 'bauern-solo', 'koenig-solo', 'fleischlos',
      'kreuz-solo', 'pik-solo', 'herz-solo', 'trumpf-solo', 'stille-hochzeit'].includes(type);
  }

  private processSoloPhaseStep(playerId: string, type: ReservationType): void {
    const state = this.state;
    const resPhase = state.reservationPhase!;

    // Track solo player (first solo declared wins — closest to dealer's left gets priority,
    // which is the order we ask them)
    let soloPlayer = resPhase.soloPlayer;
    if (this.isSoloType(type) && !soloPlayer) {
      soloPlayer = playerId;
    }

    // Find next player who hasn't declared in this phase
    const startIdx = (state.dealerPosition + 1) % 4;
    const currentIdx = resPhase.currentPlayerIndex;
    const playedCount = state.players.filter(p => p.reservationDeclared).length;

    if (playedCount >= 4) {
      // All players have declared
      if (soloPlayer) {
        this.setState({ reservationPhase: { ...resPhase, soloPlayer } });
        this.startSoloGame(soloPlayer);
      } else {
        // No solo - move to armut phase, reset reservationDeclared for armut phase
        const players = this.state.players.map(p => ({ ...p, reservationDeclared: false }));
        this.setState({
          players,
          reservationPhase: {
            currentPlayerIndex: startIdx,
            phase: 'armut',
          },
        });
        this.autoAdvanceArmutPhase();
      }
    } else {
      // Move to next undeclared player
      let nextIdx = (currentIdx + 1) % 4;
      while (state.players[nextIdx]?.reservationDeclared) {
        nextIdx = (nextIdx + 1) % 4;
      }
      this.setState({
        reservationPhase: { ...resPhase, soloPlayer, currentPlayerIndex: nextIdx },
      });
    }
  }

  private processArmutPhaseStep(playerId: string, type: ReservationType): void {
    const state = this.state;
    const resPhase = state.reservationPhase!;

    let armutPlayer = resPhase.armutPlayer;
    if (type === 'armut') {
      if (armutPlayer) {
        // Two armuts -> new deal
        this.log('Zwei Armuten – Neu geben!');
        this.setState({ phase: 'game-over' });
        return;
      }
      armutPlayer = playerId;
    }

    // Check how many players have declared
    const playedCount = state.players.filter(p => p.reservationDeclared).length;
    const startIdx = (state.dealerPosition + 1) % 4;

    if (playedCount >= 4) {
      // All players have declared armut phase
      if (armutPlayer) {
        this.setState({ reservationPhase: { ...resPhase, armutPlayer } });
        this.startArmutExchange(armutPlayer);
      } else {
        // No armut - move to small phase; autoAdvanceSmallPhase will skip players without options
        const players = this.state.players.map(p => ({ ...p, reservationDeclared: false }));
        this.setState({
          players,
          reservationPhase: {
            currentPlayerIndex: startIdx,
            phase: 'small',
          },
        });
        this.autoAdvanceSmallPhase();
      }
    } else {
      let nextIdx = (resPhase.currentPlayerIndex + 1) % 4;
      while (state.players[nextIdx]?.reservationDeclared) {
        nextIdx = (nextIdx + 1) % 4;
      }
      this.setState({
        reservationPhase: { ...resPhase, armutPlayer, currentPlayerIndex: nextIdx },
      });
      this.autoAdvanceArmutPhase();
    }
  }

  private autoAdvanceArmutPhase(): void {
    while (true) {
      const state = this.state;
      const resPhase = state.reservationPhase;
      if (!resPhase || resPhase.phase !== 'armut') return;

      const allDeclared = state.players.every(p => p.reservationDeclared);
      if (allDeclared) {
        // Re-enter processArmutPhaseStep to finalize
        this.processArmutPhaseStep('', 'none');
        return;
      }

      const currentPlayer = state.players[resPhase.currentPlayerIndex];
      if (!currentPlayer || currentPlayer.reservationDeclared) return;

      const hand = currentPlayer.cards
        .map(id => state.cardDeck.find(c => c.id === id)!)
        .filter(Boolean);
      const trumpCount = hand.filter(c => c.isTrump).length;

      if (trumpCount <= 3) {
        // Player can declare armut — ask them
        this.sendNextReservationRequest();
        return;
      }

      // Player has >3 trumps — silently skip
      const updatedPlayers = state.players.map(p =>
        p.id === currentPlayer.id
          ? { ...p, reservationDeclared: true, reservation: 'none' as ReservationType }
          : p
      );
      // Only search for next undeclared player if any remain (avoid infinite inner loop)
      const allNowDeclared = updatedPlayers.every(p => p.reservationDeclared);
      let nextIdx = (resPhase.currentPlayerIndex + 1) % 4;
      if (!allNowDeclared) {
        while (updatedPlayers[nextIdx]?.reservationDeclared) {
          nextIdx = (nextIdx + 1) % 4;
        }
      }
      this.setState({
        players: updatedPlayers,
        reservationPhase: { ...resPhase, currentPlayerIndex: nextIdx },
      });
    }
  }

  private processSmallPhaseStep(playerId: string, type: ReservationType): void {
    const resPhase = this.state.reservationPhase!;

    let hochzeitPlayer = resPhase.hochzeitPlayer;
    let schweinPlayer = resPhase.schweinPlayer;

    if (type === 'hochzeit') hochzeitPlayer = playerId;
    if (type === 'schwein') schweinPlayer = playerId;

    const playedCount = this.state.players.filter(p => p.reservationDeclared).length;

    if (playedCount >= 4) {
      this.setState({ reservationPhase: { ...resPhase, hochzeitPlayer, schweinPlayer } });
      this.finalizeReservations();
    } else {
      let nextIdx = (resPhase.currentPlayerIndex + 1) % 4;
      while (this.state.players[nextIdx]?.reservationDeclared) {
        nextIdx = (nextIdx + 1) % 4;
      }
      this.setState({
        reservationPhase: { ...resPhase, hochzeitPlayer, schweinPlayer, currentPlayerIndex: nextIdx },
      });
      this.autoAdvanceSmallPhase();
    }
  }

  // Skip players in the small phase who have no Hochzeit/Schwein options.
  // Loops until finding a player with options (then sends request) or all declared (then finalizes).
  private autoAdvanceSmallPhase(): void {
    while (true) {
      const state = this.state;
      const resPhase = state.reservationPhase;
      if (!resPhase || resPhase.phase !== 'small') return;

      const allDeclared = state.players.every(p => p.reservationDeclared);
      if (allDeclared) { this.finalizeReservations(); return; }

      const currentPlayer = state.players[resPhase.currentPlayerIndex];
      if (!currentPlayer || currentPlayer.reservationDeclared) return;

      if (this.playerHasSmallOptions(currentPlayer)) {
        this.sendNextReservationRequest();
        return;
      }

      // No options — silently skip this player
      const updatedPlayers = state.players.map(p =>
        p.id === currentPlayer.id
          ? { ...p, reservationDeclared: true, reservation: 'none' as ReservationType }
          : p
      );
      const allNowDeclared = updatedPlayers.every(p => p.reservationDeclared);
      let nextIdx = (resPhase.currentPlayerIndex + 1) % 4;
      if (!allNowDeclared) {
        while (updatedPlayers[nextIdx]?.reservationDeclared) {
          nextIdx = (nextIdx + 1) % 4;
        }
      }
      this.setState({
        players: updatedPlayers,
        reservationPhase: { ...resPhase, currentPlayerIndex: nextIdx },
      });
    }
  }

  private playerHasSmallOptions(player: Player): boolean {
    const hand = player.cards
      .map(id => this.state.cardDeck.find(c => c.id === id)!)
      .filter(Boolean);
    const kreuzDamen = hand.filter(c => c.suit === 'kreuz' && c.rank === 'dame').length;
    const karoAsse = hand.filter(c => c.suit === 'karo' && c.rank === 'as').length;
    return kreuzDamen === 2 || karoAsse === 2;
  }

  // Trigger state change so room can send reservation request to next player
  private sendNextReservationRequest(): void {
    this.onStateChange(this.state);
  }

  private startSoloGame(soloPlayerId: string): void {
    const state = this.state;
    const soloPlayer = state.players.find(p => p.id === soloPlayerId)!;
    const soloType = soloPlayer.reservation as ReservationType;

    // Rebuild deck for solo - apply trump rules based on solo type
    const updatedDeck = state.cardDeck.map(card => {
      const trumpOrder = this.getSoloTrumpOrder(card.suit, card.rank, soloType);
      return {
        ...card,
        isTrump: trumpOrder !== undefined,
        trumpOrder,
      };
    });

    // Determine teams
    const players = state.players.map(p => ({
      ...p,
      team: (p.id === soloPlayerId ? 're' : 'contra') as Team,
    }));

    // Solo player leads first
    const soloPlayerIdx = players.findIndex(p => p.id === soloPlayerId);

    this.setState({
      phase: 'playing',
      players,
      soloPlayerId,
      activeReservation: soloType,
      cardDeck: updatedDeck,
      currentPlayerIndex: soloPlayerIdx,
      trickLeaderPosition: soloPlayerIdx,
      reservationPhase: undefined,
      currentTrick: {
        id: 0,
        cards: [],
        points: 0,
        isComplete: false,
      },
    });

    this.log(`${soloPlayer.name} spielt ${this.getReservationName(soloType)}!`);
  }

  private getSoloTrumpOrder(suit: string, rank: string, soloType: ReservationType): number | undefined {
    if (soloType === 'damen-solo') {
      if (rank === 'dame') {
        const suitOrder: Record<string, number> = { kreuz: 0, pik: 1, herz: 2, karo: 3 };
        return suitOrder[suit];
      }
      return undefined;
    }
    if (soloType === 'bauern-solo') {
      if (rank === 'bauer') {
        const suitOrder: Record<string, number> = { kreuz: 0, pik: 1, herz: 2, karo: 3 };
        return suitOrder[suit];
      }
      return undefined;
    }
    if (soloType === 'koenig-solo') {
      if (rank === 'koenig') {
        const suitOrder: Record<string, number> = { kreuz: 0, pik: 1, herz: 2, karo: 3 };
        return suitOrder[suit];
      }
      return undefined;
    }
    if (soloType === 'fleischlos') {
      return undefined;
    }
    if (soloType === 'trumpf-solo') {
      // Normal trump order (= Karo-Farbensolo)
      if (suit === 'herz' && rank === '10') return 0;
      if (rank === 'dame') { const o: Record<string,number> = {kreuz:1,pik:2,herz:3,karo:4}; return o[suit]; }
      if (rank === 'bauer') { const o: Record<string,number> = {kreuz:5,pik:6,herz:7,karo:8}; return o[suit]; }
      if (suit === 'karo') { if (rank === 'as') return 9; if (rank === '10') return 10; if (rank === 'koenig') return 11; }
      return undefined;
    }
    // Color solos
    const colorSuitMap: Partial<Record<ReservationType, string>> = {
      'kreuz-solo': 'kreuz',
      'pik-solo': 'pik',
      'herz-solo': 'herz',
    };
    const trumpSuit = colorSuitMap[soloType];
    if (trumpSuit) {
      if (rank === 'dame') {
        const suitOrder: Record<string, number> = { kreuz: 0, pik: 1, herz: 2, karo: 3 };
        return suitOrder[suit];
      }
      if (rank === 'bauer') {
        const suitOrder: Record<string, number> = { kreuz: 4, pik: 5, herz: 6, karo: 7 };
        return suitOrder[suit];
      }
      if (suit === trumpSuit) {
        if (rank === 'as') return 8;
        if (rank === '10') return 9;
        if (rank === 'koenig') return 10;
      }
      return undefined;
    }
    // Normal game
    return undefined;
  }

  private startArmutExchange(armutPlayerId: string): void {
    const state = this.state;
    const armutPlayer = state.players.find(p => p.id === armutPlayerId)!;
    const hand = armutPlayer.cards.map(id => state.cardDeck.find(c => c.id === id)!).filter(Boolean);
    const trumps = hand.filter(c => c.isTrump);

    // Start offering to left neighbor
    const armutPlayerIdx = state.players.findIndex(p => p.id === armutPlayerId);
    const nextPlayerIdx = (armutPlayerIdx + 1) % 4;

    this.setState({
      armutExchange: {
        offeringPlayerId: armutPlayerId,
        currentOfferId: nextPlayerIdx,
        offeredCardIds: trumps.map(c => c.id),
        phase: 'offering',
      },
      reservationPhase: undefined,
    });

    this.log(`${armutPlayer.name} hat Armut (${trumps.length} Trümpfe) und bietet Karten an`);
  }

  handleAcceptArmut(playerId: string, accept: boolean): { error?: string } {
    const state = this.state;
    if (!state.armutExchange) return { error: 'Keine Armut aktiv' };

    const exchange = state.armutExchange;
    const currentOfferPlayer = state.players[exchange.currentOfferId];

    if (currentOfferPlayer.id !== playerId) {
      return { error: 'Du bist nicht an der Reihe' };
    }

    if (accept) {
      const trumpCards = exchange.offeredCardIds ?? [];

      // Give all trump cards to accepting player, remove from armut player
      const players = state.players.map(p => {
        if (p.id === exchange.offeringPlayerId) {
          return {
            ...p,
            cards: p.cards.filter(id => !trumpCards.includes(id)),
            cardCount: p.cards.length - trumpCards.length,
          };
        }
        if (p.id === playerId) {
          return {
            ...p,
            cards: [...p.cards, ...trumpCards],
            cardCount: p.cards.length + trumpCards.length,
          };
        }
        return p;
      });

      this.setState({
        players,
        armutExchange: {
          ...exchange,
          acceptedById: playerId,
          phase: 'returning',
        },
      });

      this.log(`${currentOfferPlayer.name} nimmt die Armut-Karten an`);
      this.onStateChange(this.state);
    } else {
      this.log(`${currentOfferPlayer.name} lehnt ab`);
      // Try next player
      const armutPlayerIdx = state.players.findIndex(p => p.id === exchange.offeringPlayerId);
      const nextIdx = (exchange.currentOfferId + 1) % 4;

      if (nextIdx === armutPlayerIdx) {
        // No one took the armut -> new deal
        this.log('Niemand nimmt die Armut – Neu geben!');
        this.setState({ phase: 'game-over' });
      } else {
        this.setState({
          armutExchange: { ...exchange, currentOfferId: nextIdx },
        });
      }

      this.onStateChange(this.state);
    }

    return {};
  }

  handleReturnArmutCards(playerId: string, cardIds: CardId[]): { error?: string } {
    const state = this.state;
    if (!state.armutExchange) return { error: 'Keine Armut aktiv' };

    const exchange = state.armutExchange;
    if (exchange.acceptedById !== playerId) return { error: 'Nicht berechtigt' };
    if (exchange.phase !== 'returning') return { error: 'Falsche Phase' };

    const expectedCount = exchange.offeredCardIds?.length ?? 0;
    if (cardIds.length !== expectedCount) {
      return { error: `Bitte genau ${expectedCount} Karten zurückgeben` };
    }

    const armutPlayerId = exchange.offeringPlayerId;
    const acceptingPlayerId = playerId;

    // Transfer cards back to armut player
    const players = state.players.map(p => {
      if (p.id === acceptingPlayerId) {
        const newCards = p.cards.filter(id => !cardIds.includes(id));
        return { ...p, cards: newCards, cardCount: newCards.length };
      }
      if (p.id === armutPlayerId) {
        const newCards = [...p.cards, ...cardIds];
        return { ...p, cards: newCards, cardCount: newCards.length };
      }
      return p;
    });

    // Determine teams: Armut player and accepting player are Re
    const finalPlayers = players.map(p => ({
      ...p,
      team: (p.id === armutPlayerId || p.id === acceptingPlayerId ? 're' : 'contra') as Team,
    }));

    // First player (left of dealer) leads
    const firstPlayerIdx = (state.dealerPosition + 1) % 4;

    this.setState({
      phase: 'playing',
      players: finalPlayers,
      armutPlayerId,
      activeReservation: 'armut',
      armutExchange: undefined,
      currentPlayerIndex: firstPlayerIdx,
      trickLeaderPosition: firstPlayerIdx,
      currentTrick: {
        id: 0,
        cards: [],
        points: 0,
        isComplete: false,
      },
    });

    this.log('Armut-Tausch abgeschlossen. Spiel beginnt!');
    this.onStateChange(this.state);
    return {};
  }

  private finalizeReservations(): void {
    const state = this.state;
    const resPhase = state.reservationPhase!;

    const hochzeitPlayer = state.players.find(p => p.reservation === 'hochzeit');
    const schweinPlayer = state.players.find(p => p.reservation === 'schwein');

    // Update deck if schwein
    let deck = state.cardDeck;
    let schweinActive = false;
    let schweinPlayerId: string | undefined;

    if (schweinPlayer) {
      schweinActive = true;
      schweinPlayerId = schweinPlayer.id;
      deck = deck.map(card => {
        if (isKaroAs(card)) {
          return { ...card, isTrump: true, trumpOrder: -1 };
        }
        return card;
      });
      this.log(`${schweinPlayer.name} hat Schwein!`);
    }

    // Determine teams for normal game
    let players: Player[] = state.players.map(p => ({ ...p }));

    if (hochzeitPlayer) {
      // Hochzeit: team determined dynamically
      players = players.map(p => ({
        ...p,
        team: p.id === hochzeitPlayer.id ? 're' as Team : undefined,
      }));
      this.log(`${hochzeitPlayer.name} hat Hochzeit!`);
    } else {
      // Normal: Kreuz-Dame determines team
      players = players.map(p => {
        const hand = p.cards.map(id => deck.find(c => c.id === id)!).filter(Boolean);
        return { ...p, team: (hand.some(isKreuzDame) ? 're' : 'contra') as Team };
      });
    }

    // First player left of dealer starts
    const firstPlayerIdx = (state.dealerPosition + 1) % 4;

    this.setState({
      phase: 'playing',
      players,
      hochzeitPlayerId: hochzeitPlayer?.id,
      schweinPlayerId,
      schweinActive,
      activeReservation: hochzeitPlayer ? 'hochzeit' : schweinPlayer ? 'schwein' : undefined,
      cardDeck: deck,
      currentPlayerIndex: firstPlayerIdx,
      trickLeaderPosition: firstPlayerIdx,
      reservationPhase: undefined,
      currentTrick: {
        id: 0,
        cards: [],
        points: 0,
        isComplete: false,
      },
    });

    this.log('Reservierungsphase abgeschlossen. Spiel beginnt!');
  }

  // ============================================================
  // Playing Phase
  // ============================================================

  handlePlayCard(playerId: string, cardId: CardId): { error?: string } {
    // If the trick winner plays during trick-end, implicitly acknowledge first
    if (this.state.phase === 'trick-end') {
      if (this.state.pendingTrickWinnerId !== playerId) {
        return { error: 'Nicht dein Zug' };
      }
      this.acknowledgeInternal();
      const phaseAfter = this.state.phase as string;
      if (phaseAfter !== 'playing') return {}; // game finished in acknowledgeInternal
    }

    const state = this.state;

    if (state.phase !== 'playing') return { error: 'Falsches Spielphase' };

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) return { error: 'Nicht dein Zug' };

    if (!currentPlayer.cards.includes(cardId)) {
      return { error: 'Karte nicht in deiner Hand' };
    }

    const card = state.cardDeck.find(c => c.id === cardId);
    if (!card) return { error: 'Karte nicht gefunden' };

    // Validate the card
    const hand = currentPlayer.cards.map(id => state.cardDeck.find(c => c.id === id)!).filter(Boolean);
    const isLeader = !state.currentTrick || state.currentTrick.cards.length === 0;
    const validCards = getValidCards(hand, state.currentTrick, isLeader, state.cardDeck);

    if (!validCards.some(c => c.id === cardId)) {
      return { error: 'Ungültige Karte – du musst Farbe/Trumpf bekennen' };
    }

    // Remove card from hand
    const newCards = currentPlayer.cards.filter(id => id !== cardId);
    const players = state.players.map(p => {
      if (p.id === playerId) {
        return { ...p, cards: newCards, cardCount: newCards.length };
      }
      return p;
    });

    // Add to current trick
    const trickCard: TrickCard = { cardId, playerId };
    const prevTrick = state.currentTrick ?? {
      id: state.completedTricks.length,
      cards: [],
      points: 0,
      isComplete: false,
    };
    const updatedTrick: Trick = {
      ...prevTrick,
      cards: [...prevTrick.cards, trickCard],
    };

    // Set lead suit on first card
    if (prevTrick.cards.length === 0) {
      updatedTrick.leadSuit = card.suit;
      updatedTrick.leadPlayerId = playerId;
    }

    // Calculate trick points
    updatedTrick.points = updatedTrick.cards.reduce((sum, tc) => {
      const c = state.cardDeck.find(c => c.id === tc.cardId);
      return sum + (c?.points ?? 0);
    }, 0);

    this.setState({ players, currentTrick: updatedTrick });
    this.log(`${currentPlayer.name} spielt ${this.getCardName(card)}`);

    // Check if trick is complete
    if (updatedTrick.cards.length === 4) {
      this.completeTrick(updatedTrick);
    } else {
      const nextPlayerIdx = (state.currentPlayerIndex + 1) % 4;
      this.setState({ currentPlayerIndex: nextPlayerIdx });
      this.onStateChange(this.state);
    }

    return {};
  }

  private getCardName(card: Card): string {
    const suits: Record<string, string> = { kreuz: '♣', pik: '♠', herz: '♥', karo: '♦' };
    const ranks: Record<string, string> = {
      'as': 'As', '10': '10', 'koenig': 'König', 'dame': 'Dame', 'bauer': 'Bauer'
    };
    return `${suits[card.suit]}${ranks[card.rank]}`;
  }

  private completeTrick(trick: Trick): void {
    const state = this.state;

    // Determine winner
    const winnerId = determineTrickWinner(trick, state.cardDeck, state.schweinActive, state.schweinPlayerId);
    const winnerPlayer = state.players.find(p => p.id === winnerId)!;
    const winnerTeam = winnerPlayer.team;

    // Check trick specials
    checkTrickSpecials(trick, state.cardDeck);

    const completedTrick: Trick = {
      ...trick,
      winnerId,
      isComplete: true,
    };

    // Check Hochzeit partner (within first 3 tricks)
    let players = state.players;
    let hochzeitPartnerFoundOnTrick = state.hochzeitPartnerFoundOnTrick;

    if (state.hochzeitPlayerId && hochzeitPartnerFoundOnTrick === undefined) {
      const trickNumber = state.completedTricks.length; // 0-based index of this trick
      const leadCard = state.cardDeck.find(c => c.id === trick.cards[0]?.cardId);

      if (trickNumber < 3) {
        if (leadCard && !leadCard.isTrump && winnerId !== state.hochzeitPlayerId) {
          // Non-trump trick won by someone else -> partner found
          hochzeitPartnerFoundOnTrick = trickNumber;
          players = players.map(p => ({
            ...p,
            team: (p.id === state.hochzeitPlayerId || p.id === winnerId ? 're' : 'contra') as Team,
          }));
          this.setState({ players, hochzeitPartnerFoundOnTrick });
          this.log(`${winnerPlayer.name} ist Hochzeit-Partner!`);
        }

        if (trickNumber === 2 && hochzeitPartnerFoundOnTrick === undefined) {
          // After 3 tricks without finding partner -> Stille Hochzeit (solo)
          players = players.map(p => ({
            ...p,
            team: (p.id === state.hochzeitPlayerId ? 're' : 'contra') as Team,
          }));
          this.setState({
            players,
            hochzeitPartnerFoundOnTrick: -1,
            soloPlayerId: state.hochzeitPlayerId,
          });
          this.log('Stille Hochzeit! Hochzeit-Spieler spielt Solo.');
        }
      }
    }

    // Update player stats
    const updatedPlayers = this.state.players.map(p => {
      if (p.id === winnerId) {
        return {
          ...p,
          tricksWon: p.tricksWon + 1,
          trickPoints: p.trickPoints + trick.points,
        };
      }
      return p;
    });

    const completedTricks = [...state.completedTricks, completedTrick];

    this.log(`${winnerPlayer.name} gewinnt Stich ${completedTricks.length} (${trick.points} Pkt.)`);

    const winnerIdx = this.state.players.findIndex(p => p.id === winnerId);

    // After the last trick skip trick-end and go directly to scoring
    if (completedTricks.length === 10) {
      this.setState({
        players: updatedPlayers,
        completedTricks,
        currentTrick: completedTrick,
        pendingTrickWinnerId: undefined,
        currentPlayerIndex: winnerIdx,
      });
      this.finishGame();
      this.onStateChange(this.state);
      return;
    }

    // Pause at trick-end so players can see the completed trick
    this.setState({
      players: updatedPlayers,
      completedTricks,
      currentTrick: completedTrick,
      phase: 'trick-end',
      pendingTrickWinnerId: winnerId,
      currentPlayerIndex: winnerIdx,
      trickLeaderPosition: winnerIdx,
    });
    this.onStateChange(this.state);
  }

  private finishGame(): void {
    const roundScore = calculateRoundScore(this.state);

    // Update accumulated scores
    const scores = { ...this.state.scores };
    for (const [playerId, delta] of Object.entries(roundScore.scoreChange)) {
      scores[playerId] = (scores[playerId] ?? 0) + delta;
    }

    const players = this.state.players.map(p => ({
      ...p,
      points: scores[p.id] ?? 0,
    }));

    this.setState({
      phase: 'scoring',
      scores,
      players,
      lastRoundScore: roundScore,
    });

    this.log(`Spiel beendet! ${roundScore.winner === 're' ? 'Re' : 'Contra'} gewinnt! Re: ${roundScore.rePoints}, Contra: ${roundScore.contraPoints}`);
    this.onStateChange(this.state);
  }

  // ============================================================
  // Announcements
  // ============================================================

  handleAnnouncement(playerId: string, type: AnnouncementType): { error?: string } {
    const state = this.state;

    if (state.phase !== 'playing') return { error: 'Falsches Spielphase' };

    const player = state.players.find(p => p.id === playerId);
    if (!player) return { error: 'Spieler nicht gefunden' };

    const validOptions = getValidAnnouncements(player, state);
    if (!validOptions.includes(type)) {
      return { error: 'Ansage nicht erlaubt' };
    }

    const announcement: Announcement = {
      type,
      playerId,
      team: player.team!,
      trickIndex: state.completedTricks.length,
    };

    this.setState({
      announcements: [...state.announcements, announcement],
    });

    this.log(`${player.name} sagt ${type.toUpperCase()} an!`);
    this.onStateChange(this.state);
    return {};
  }

  // ============================================================
  // Acknowledge trick-end (human clicked or bot auto-acks)
  // ============================================================

  private acknowledgeInternal(): void {
    const state = this.state;
    if (state.phase !== 'trick-end') return;

    const completedTricks = state.completedTricks;
    const winnerIdx = state.currentPlayerIndex;

    this.setState({
      phase: 'playing',
      currentTrick: {
        id: completedTricks.length,
        cards: [],
        points: 0,
        isComplete: false,
      },
      currentPlayerIndex: winnerIdx,
      trickLeaderPosition: winnerIdx,
      pendingTrickWinnerId: undefined,
    });
  }

  acknowledgeTrick(): void {
    if (this.state.phase !== 'trick-end') return;
    this.acknowledgeInternal();
    const phaseAfter = this.state.phase as string;
    if (phaseAfter === 'playing') {
      this.onStateChange(this.state);
    }
  }

  // ============================================================
  // Get valid cards for current player
  // ============================================================

  getValidCardsForPlayer(playerId: string): CardId[] {
    const state = this.state;
    const playerIdx = state.players.findIndex(p => p.id === playerId);
    if (playerIdx !== state.currentPlayerIndex) return [];

    const player = state.players[playerIdx];
    const hand = player.cards.map(id => state.cardDeck.find(c => c.id === id)!).filter(Boolean);
    const isLeader = !state.currentTrick || state.currentTrick.cards.length === 0;
    return getValidCards(hand, state.currentTrick, isLeader, state.cardDeck).map(c => c.id);
  }

  // ============================================================
  // Get reservation options for player
  // ============================================================

  getReservationOptionsForPlayer(playerId: string): ReservationType[] {
    const state = this.state;
    const player = state.players.find(p => p.id === playerId);
    if (!player) return ['none'];

    const resPhase = state.reservationPhase;
    if (!resPhase) return ['none'];

    if (resPhase.phase === 'solo') {
      return ['none', 'damen-solo', 'bauern-solo', 'koenig-solo', 'fleischlos',
        'kreuz-solo', 'pik-solo', 'herz-solo', 'trumpf-solo'];
    } else if (resPhase.phase === 'armut') {
      const hand = player.cards.map(id => state.cardDeck.find(c => c.id === id)!).filter(Boolean);
      const options: ReservationType[] = ['none'];
      if (countTrumps(hand) <= 3) options.push('armut');
      return options;
    } else if (resPhase.phase === 'small') {
      return getSmallReservationOptions(player, state.cardDeck, 'small');
    }

    return ['none'];
  }
}
