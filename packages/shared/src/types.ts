// ============================================================
// Core Types for Doppelkopf
// ============================================================

export type Suit = 'kreuz' | 'pik' | 'herz' | 'karo';
export type Rank = 'as' | '10' | 'koenig' | 'dame' | 'bauer';

export interface Card {
  id: string;         // e.g. "kreuz-dame-1", "kreuz-dame-2"
  suit: Suit;
  rank: Rank;
  points: number;
  isTrump: boolean;
  trumpOrder?: number; // lower = higher trump (0 = highest)
}

export type CardId = string;

// ============================================================
// Game Phases
// ============================================================

export type GamePhase =
  | 'waiting'           // Waiting for players
  | 'dealing'           // Cards being dealt
  | 'reservations'      // Vorbehalt phase
  | 'armut-exchange'    // Trumpfarmut card exchange
  | 'playing'           // Main game
  | 'trick-end'         // Trick complete, waiting for acknowledgment
  | 'scoring'           // Calculating scores
  | 'game-over';        // Game ended

export type ReservationType =
  | 'none'
  | 'hochzeit'
  | 'schwein'
  | 'armut'
  | 'damen-solo'
  | 'bauern-solo'
  | 'koenig-solo'
  | 'fleischlos'
  | 'kreuz-solo'
  | 'pik-solo'
  | 'herz-solo'
  | 'trumpf-solo'
  | 'stille-hochzeit';

export type AnnouncementType = 're' | 'contra' | 'keine90' | 'keine60' | 'keine30' | 'schwarz';

export type Team = 're' | 'contra';

// ============================================================
// Player
// ============================================================

export interface Player {
  id: string;
  name: string;
  position: 0 | 1 | 2 | 3;    // seat position
  isBot: boolean;
  isConnected: boolean;
  cards: CardId[];              // cards in hand (only visible to own player on client)
  cardCount: number;            // always visible
  team?: Team;                  // revealed during play
  reservation?: ReservationType;
  reservationDeclared: boolean;
  points: number;               // accumulated across rounds
  tricksWon: number;
  trickPoints: number;          // points from tricks this round
}

// ============================================================
// Trick
// ============================================================

export interface TrickCard {
  cardId: CardId;
  playerId: string;
}

export interface Trick {
  id: number;
  cards: TrickCard[];
  leadSuit?: Suit;
  leadPlayerId?: string;
  winnerId?: string;
  points: number;
  isComplete: boolean;
  isSonntag?: boolean;     // all Herz
  isDoublekopf?: boolean;  // all 10s and Aces (Vollen)
}

// ============================================================
// Announcements
// ============================================================

export interface Announcement {
  type: AnnouncementType;
  playerId: string;
  team: Team;
  trickIndex: number;     // made before which trick (0-based)
}

// ============================================================
// Scoring
// ============================================================

export interface RoundScore {
  roundNumber: number;
  reTeam: string[];
  contraTeam: string[];
  rePoints: number;
  contraPoints: number;
  winner: Team;
  scoreChange: Record<string, number>;  // playerId -> score delta
  extraPoints: ExtraPoint[];
  announcements: Announcement[];
  details: string[];
}

export interface ExtraPoint {
  type: ExtraPointType;
  team: Team;
  playerId?: string;
  description: string;
}

export type ExtraPointType =
  | 'gegen-die-alten'
  | 'sonntag'
  | 'doppelkopf'
  | 'fuchs-gefangen'
  | 'fuchs-letzter-stich'
  | 'herz10-gefangen'
  | 'charly'
  | 'charly-gefangen';

// ============================================================
// Game State
// ============================================================

export interface ArmutExchange {
  offeringPlayerId: string;
  currentOfferId: number;        // which player is being offered (position index)
  offeredCardIds?: CardId[];     // cards offered (server only)
  acceptedById?: string;
  returnCardIds?: CardId[];
  phase: 'offering' | 'returning' | 'complete';
}

export interface GameState {
  id: string;
  roomId: string;
  phase: GamePhase;
  roundNumber: number;
  players: Player[];
  dealerPosition: number;
  currentPlayerIndex: number;    // whose turn it is
  currentTrick: Trick | null;
  completedTricks: Trick[];
  announcements: Announcement[];
  reservationPhase?: {
    currentPlayerIndex: number;
    phase: 'solo' | 'armut' | 'small';
    soloPlayer?: string;
    hochzeitPlayer?: string;
    schweinPlayer?: string;
    armutPlayer?: string;
    hochzeitPartnerFoundOnTrick?: number;
  };
  armutExchange?: ArmutExchange;
  activeReservation?: ReservationType;
  soloPlayerId?: string;
  hochzeitPlayerId?: string;
  schweinPlayerId?: string;
  armutPlayerId?: string;
  schweinActive: boolean;        // Schwein announced and aces become top trump
  hochzeitPartnerFoundOnTrick?: number;
  pendingTrickWinnerId?: string; // set during 'trick-end' phase
  scores: Record<string, number>; // accumulated scores
  lastRoundScore?: RoundScore;
  validCards?: CardId[];         // for the current player's client
  cardDeck: Card[];              // full deck info (always visible)
  trickLeaderPosition: number;
  gameLog: string[];
}

// ============================================================
// Socket Events
// ============================================================

export interface ServerToClientEvents {
  'game-state': (state: ClientGameState) => void;
  'your-turn': (data: { validCards: CardId[] }) => void;
  'reservation-request': (data: { phase: 'solo' | 'armut' | 'small'; options: ReservationType[] }) => void;
  'armut-offer': (data: { fromPlayer: string; cardCount: number }) => void;
  'announcement-options': (data: { options: AnnouncementType[] }) => void;
  'game-over': (data: { roundScore: RoundScore; totalScores: Record<string, number> }) => void;
  'error': (data: { message: string }) => void;
  'room-update': (data: { players: Pick<Player, 'id' | 'name' | 'isBot' | 'isConnected' | 'position'>[] }) => void;
  'chat': (data: { from: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'join-room': (data: { roomId: string; playerName: string }) => void;
  'play-card': (data: { cardId: CardId }) => void;
  'declare-reservation': (data: { type: ReservationType }) => void;
  'accept-armut': (data: { accept: boolean }) => void;
  'return-armut-cards': (data: { cardIds: CardId[] }) => void;
  'make-announcement': (data: { type: AnnouncementType }) => void;
  'add-bot': (data: Record<string, never>) => void;
  'start-game': (data: Record<string, never>) => void;
  'chat': (data: { message: string }) => void;
  'new-round': (data: Record<string, never>) => void;
  'acknowledge-trick': (data: Record<string, never>) => void;
}

// Client-side game state (filtered - player only sees own cards)
export interface ClientGameState extends Omit<GameState, 'cardDeck'> {
  myPlayerId: string;
  myCards: Card[];
  validCards: CardId[];
  cardDeck: Card[];
}
