import { Server, Socket } from 'socket.io';
import nodemailer from 'nodemailer';
import {
  GameState, Player, ClientGameState, Card, CardId, ReservationType,
  AnnouncementType, RoundScore
} from '@dokoapp/shared';
import { createInitialGameState, sortHand } from '@dokoapp/shared';
import { GameEngine } from './GameEngine';
import { AIPlayer } from './AIPlayer';

// ============================================================
// Game Room - manages players and game state
// ============================================================

let botCounter = 1;

export class GameRoom {
  public roomId: string;
  private io: Server;
  private players: Map<string, { socketId: string; player: Player }> = new Map();
  private bots: Map<string, AIPlayer> = new Map();
  private engine: GameEngine | null = null;
  private currentState: GameState | null = null;
  private dealerPosition = 0;
  private roundNumber = 0;
  private scores: Record<string, number> = {};

  constructor(roomId: string, io: Server) {
    this.roomId = roomId;
    this.io = io;
  }

  // ============================================================
  // Player Management
  // ============================================================

  addPlayer(socketId: string, playerId: string, playerName: string): { error?: string } {
    if (this.players.size >= 4 && !this.players.has(playerId)) {
      return { error: 'Raum ist voll' };
    }

    const position = this.getNextPosition();
    const player: Player = {
      id: playerId,
      name: playerName,
      position: position as 0 | 1 | 2 | 3,
      isBot: false,
      isConnected: true,
      cards: [],
      cardCount: 0,
      reservationDeclared: false,
      points: this.scores[playerId] ?? 0,
      tricksWon: 0,
      trickPoints: 0,
    };

    this.players.set(playerId, { socketId, player });
    this.scores[playerId] = this.scores[playerId] ?? 0;

    this.broadcastRoomUpdate();
    return {};
  }

  addBot(): void {
    if (this.players.size >= 4) return;

    const botId = `bot-${botCounter++}`;
    const botName = `Bot ${botCounter - 1}`;
    const position = this.getNextPosition();

    const player: Player = {
      id: botId,
      name: botName,
      position: position as 0 | 1 | 2 | 3,
      isBot: true,
      isConnected: true,
      cards: [],
      cardCount: 0,
      reservationDeclared: false,
      points: 0,
      tricksWon: 0,
      trickPoints: 0,
    };

    this.players.set(botId, { socketId: '', player });
    this.bots.set(botId, new AIPlayer(botId));
    this.scores[botId] = 0;

    this.broadcastRoomUpdate();
  }

  removePlayer(socketId: string): void {
    for (const [playerId, data] of this.players.entries()) {
      if (data.socketId === socketId) {
        if (data.player.isBot) {
          this.players.delete(playerId);
          this.bots.delete(playerId);
        } else {
          data.player.isConnected = false;
          // Keep player in room, mark as disconnected
        }
        break;
      }
    }
    this.broadcastRoomUpdate();
  }

  reconnectPlayer(socketId: string, playerId: string): boolean {
    const data = this.players.get(playerId);
    if (data) {
      data.socketId = socketId;
      data.player.isConnected = true;
      this.broadcastRoomUpdate();
      if (this.currentState) {
        this.sendGameStateToPlayer(playerId);
      }
      return true;
    }
    return false;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  private getNextPosition(): 0 | 1 | 2 | 3 {
    const usedPositions = new Set<number>(
      Array.from(this.players.values()).map(d => d.player.position as number)
    );
    for (let i = 0; i < 4; i++) {
      if (!usedPositions.has(i)) return i as 0 | 1 | 2 | 3;
    }
    return (this.players.size % 4) as 0 | 1 | 2 | 3;
  }

  // ============================================================
  // Game Management
  // ============================================================

  startGame(requestingPlayerId: string): { error?: string } {
    if (this.players.size !== 4) {
      return { error: 'Es werden 4 Spieler benötigt' };
    }

    if (this.currentState?.phase === 'playing' || this.currentState?.phase === 'reservations') {
      return { error: 'Spiel läuft bereits' };
    }

    this.roundNumber++;
    const players = Array.from(this.players.values()).map(d => ({
      ...d.player,
      cards: [],
      cardCount: 0,
      team: undefined,
      reservation: undefined,
      reservationDeclared: false,
      tricksWon: 0,
      trickPoints: 0,
    }));

    // Sort by position
    players.sort((a, b) => a.position - b.position);

    const newState = createInitialGameState(
      this.roomId,
      players,
      this.dealerPosition,
      this.roundNumber,
      this.scores
    );

    this.currentState = newState;
    this.engine = new GameEngine(newState, (state) => {
      this.currentState = state;
      this.broadcastGameState();
      this.processBotsIfNeeded();
    });

    this.broadcastGameState();
    this.processBotsIfNeeded();
    return {};
  }

  startNewRound(): void {
    if (!this.currentState) return;

    // Sync accumulated scores from the finished round before starting a new one
    this.scores = { ...this.currentState.scores };
    this.dealerPosition = (this.dealerPosition + 1) % 4;
    this.startGame('');
  }

  // ============================================================
  // Game Actions
  // ============================================================

  acknowledgeTrick(): void {
    if (!this.engine || this.currentState?.phase !== 'trick-end') return;
    this.engine.acknowledgeTrick();
    this.currentState = this.engine.getState();
    this.processBotsIfNeeded();
  }

  handlePlayCard(playerId: string, cardId: CardId): { error?: string } {
    if (!this.engine) return { error: 'Kein Spiel aktiv' };
    const result = this.engine.handlePlayCard(playerId, cardId);
    if (!result.error) {
      this.currentState = this.engine.getState();
    }
    return result;
  }

  handleDeclareReservation(playerId: string, type: ReservationType): { error?: string } {
    if (!this.engine) return { error: 'Kein Spiel aktiv' };
    const result = this.engine.handleReservation(playerId, type);
    if (!result.error) {
      this.currentState = this.engine.getState();
    }
    return result;
  }

  handleAcceptArmut(playerId: string, accept: boolean): { error?: string } {
    if (!this.engine) return { error: 'Kein Spiel aktiv' };
    const result = this.engine.handleAcceptArmut(playerId, accept);
    if (!result.error) {
      this.currentState = this.engine.getState();
    }
    return result;
  }

  handleReturnArmutCards(playerId: string, cardIds: CardId[]): { error?: string } {
    if (!this.engine) return { error: 'Kein Spiel aktiv' };
    const result = this.engine.handleReturnArmutCards(playerId, cardIds);
    if (!result.error) {
      this.currentState = this.engine.getState();
    }
    return result;
  }

  handleAnnouncement(playerId: string, type: AnnouncementType): { error?: string } {
    if (!this.engine) return { error: 'Kein Spiel aktiv' };
    const result = this.engine.handleAnnouncement(playerId, type);
    if (!result.error) {
      this.currentState = this.engine.getState();
    }
    return result;
  }

  // ============================================================
  // Bot Processing
  // ============================================================

  private async processBotsIfNeeded(): Promise<void> {
    if (!this.currentState || !this.engine) return;

    const state = this.currentState;

    // Handle reservation phase for bots
    if (state.phase === 'reservations') {
      const resPhase = state.reservationPhase;
      if (!resPhase) return;

      const currentPlayer = state.players[resPhase.currentPlayerIndex];
      if (currentPlayer?.isBot && !currentPlayer.reservationDeclared) {
        await this.delay(800);
        const bot = this.bots.get(currentPlayer.id);
        if (!bot) return;

        const options = this.engine.getReservationOptionsForPlayer(currentPlayer.id);
        const choice = bot.chooseReservation(state, options);
        this.handleDeclareReservation(currentPlayer.id, choice);
        return;
      }
    }

    // Handle armut acceptance for bots
    if (state.armutExchange?.phase === 'offering') {
      const currentPlayerIdx = state.armutExchange.currentOfferId;
      const currentPlayer = state.players[currentPlayerIdx];
      if (currentPlayer?.isBot) {
        await this.delay(800);
        // Bot always accepts if it has space
        const botHand = currentPlayer.cards.length;
        const accept = botHand <= 8; // Accept if not too many cards
        this.handleAcceptArmut(currentPlayer.id, accept);
        return;
      }
    }

    // Handle armut return for bots
    if (state.armutExchange?.phase === 'returning') {
      const accepterId = state.armutExchange.acceptedById;
      const accepter = state.players.find(p => p.id === accepterId);
      if (accepter?.isBot) {
        await this.delay(800);
        const bot = this.bots.get(accepterId!);
        if (!bot) return;
        const count = state.armutExchange.offeredCardIds?.length ?? 3;
        const cardIds = bot.chooseArmutCards(state, count);
        this.handleReturnArmutCards(accepterId!, cardIds);
        return;
      }
    }

    // Handle trick-end phase: auto-acknowledge only when all players are bots
    // If any human is in the game, they must click to continue
    if (state.phase === 'trick-end') {
      const allBots = state.players.every(p => p.isBot);
      if (allBots) {
        await this.delay(1200);
        this.acknowledgeTrick();
        return;
      }
    }

    // Handle playing phase for bots
    if (state.phase === 'playing') {
      const currentPlayer = state.players[state.currentPlayerIndex];
      if (currentPlayer?.isBot) {
        await this.delay(1000);
        const bot = this.bots.get(currentPlayer.id);
        if (!bot) return;

        // Make announcement if possible
        // (simplified - just play the card)
        const cardId = bot.chooseCard(state);
        this.handlePlayCard(currentPlayer.id, cardId);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // State Broadcasting
  // ============================================================

  broadcastGameState(): void {
    if (!this.currentState) return;

    for (const [playerId, data] of this.players.entries()) {
      if (!data.player.isBot && data.player.isConnected) {
        this.sendGameStateToPlayer(playerId);
      }
    }
  }

  private sendGameStateToPlayer(playerId: string): void {
    if (!this.currentState) return;

    const data = this.players.get(playerId);
    if (!data || !data.socketId) return;

    const clientState = this.buildClientState(playerId);
    this.io.to(data.socketId).emit('game-state', clientState);

    // Also send reservation request if needed
    if (this.currentState.phase === 'reservations' && this.engine) {
      const resPhase = this.currentState.reservationPhase;
      if (resPhase) {
        const currentPlayer = this.currentState.players[resPhase.currentPlayerIndex];
        if (currentPlayer && currentPlayer.id === playerId && !currentPlayer.reservationDeclared) {
          const options = this.engine.getReservationOptionsForPlayer(playerId);
          this.io.to(data.socketId).emit('reservation-request', {
            phase: resPhase.phase,
            options,
          });
        }
      }
    }

    // Send armut offer if player needs to decide
    if (this.currentState.armutExchange?.phase === 'offering') {
      const exchange = this.currentState.armutExchange;
      const currentOfferPlayer = this.currentState.players[exchange.currentOfferId];
      if (currentOfferPlayer && currentOfferPlayer.id === playerId) {
        const offeringPlayer = this.currentState.players.find(p => p.id === exchange.offeringPlayerId);
        this.io.to(data.socketId).emit('armut-offer', {
          fromPlayer: offeringPlayer?.name ?? '',
          cardCount: exchange.offeredCardIds?.length ?? 0,
        });
      }
    }
  }

  private buildClientState(playerId: string): ClientGameState {
    const state = this.currentState!;
    const myPlayer = state.players.find(p => p.id === playerId)!;

    // Get my cards with full card objects
    const myCards = myPlayer.cards
      .map(id => state.cardDeck.find(c => c.id === id)!)
      .filter(Boolean);

    // Get valid cards
    let validCards: CardId[] = [];
    if (state.phase === 'playing' && this.engine) {
      validCards = this.engine.getValidCardsForPlayer(playerId);
    } else if (state.phase === 'trick-end' && state.pendingTrickWinnerId === playerId) {
      // Winner can play any card from their hand (leads the next trick)
      validCards = myPlayer.cards;
    }

    // Filter other players' cards (hide them)
    const filteredPlayers = state.players.map(p => {
      if (p.id === playerId) return p;
      return { ...p, cards: [] }; // Hide other players' cards
    });

    return {
      ...state,
      players: filteredPlayers,
      myPlayerId: playerId,
      myCards: sortHand(myCards),
      validCards,
      cardDeck: state.cardDeck,
    };
  }

  broadcastRoomUpdate(): void {
    const playerInfo = Array.from(this.players.values()).map(d => ({
      id: d.player.id,
      name: d.player.name,
      isBot: d.player.isBot,
      isConnected: d.player.isConnected,
      position: d.player.position,
    }));

    this.io.to(this.roomId).emit('room-update', { players: playerInfo });
  }

  isPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  getSocketId(playerId: string): string | undefined {
    return this.players.get(playerId)?.socketId;
  }

  // ============================================================
  // Close Room
  // ============================================================

  async closeRoom(): Promise<void> {
    this.io.to(this.roomId).emit('room-closed', { message: 'Der Raum wurde geschlossen.' });
    this.sendResultEmail().catch(err => console.error('[Email] unhandled:', err));
  }

  private buildResultHtml(): string {
    const state = this.currentState;
    const players = Array.from(this.players.values()).map(d => d.player);
    const sorted = [...players].sort((a, b) => (this.scores[a.id] ?? 0) - (this.scores[b.id] ?? 0));

    const rows = sorted.map((p, i) => {
      const pts = this.scores[p.id] ?? 0;
      const medal = ['🥇', '🥈', '🥉', ''][i] ?? '';
      return `<tr>
        <td style="padding:6px 12px">${medal} ${i + 1}.</td>
        <td style="padding:6px 12px"><b>${p.name}</b>${p.isBot ? ' 🤖' : ''}</td>
        <td style="padding:6px 12px;text-align:right"><b>${pts}</b> Strafpunkte</td>
      </tr>`;
    }).join('');

    const reservation = state?.activeReservation
      ? state.activeReservation.replace(/-/g, ' ')
      : 'Normalspiel';

    return `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1a3a8f">🃏 Doppelkopf – Spielergebnis</h2>
        <p>Raum: <b>${this.roomId}</b> &nbsp;|&nbsp; Runde: <b>${this.roundNumber}</b> &nbsp;|&nbsp; ${reservation}</p>
        <table style="border-collapse:collapse;width:100%;background:#f5f5f5;border-radius:8px">
          <thead><tr style="background:#1a3a8f;color:white">
            <th style="padding:8px 12px">Platz</th>
            <th style="padding:8px 12px">Spieler</th>
            <th style="padding:8px 12px">Punkte</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#888;font-size:12px;margin-top:16px">
          Niedrigste Strafpunktzahl gewinnt.
        </p>
      </div>`;
  }

  private async sendResultEmail(): Promise<void> {
    const to = process.env.RESULT_EMAIL ?? 'roland.wuerth@gmail.com';
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      console.log('[Email] SMTP_USER/SMTP_PASS not set — skipping email');
      return;
    }

    console.log(`[Email] Sende an ${to} via ${smtpUser}@smtp.gmail.com`);
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT ?? '587'),
        secure: false,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: `"Doppelkopf" <${smtpUser}>`,
        to,
        subject: `🃏 Doppelkopf Ergebnis – Raum ${this.roomId}`,
        html: this.buildResultHtml(),
      });

      console.log(`[Email] Ergebnis gesendet an ${to}`);
    } catch (err: any) {
      console.error('[Email] Fehler beim Senden:', err?.message ?? err);
    }
  }
}
