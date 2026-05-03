import { create } from 'zustand';
import type {
  ClientGameState, CardId, ReservationType, AnnouncementType, RoundScore
} from '@dokoapp/shared';
import socket from '../socket';

// ============================================================
// Game Store (Zustand)
// ============================================================

interface GameStore {
  // Connection
  connected: boolean;
  connecting: boolean;
  error: string | null;

  // Room
  roomId: string;
  playerName: string;
  myPlayerId: string | null;
  lobbyPlayers: { id: string; name: string; isBot: boolean; isConnected: boolean; position: number }[];

  // Game
  gameState: ClientGameState | null;
  lastRoundScore: RoundScore | null;

  // Reservation
  reservationOptions: ReservationType[] | null;
  reservationPhase: 'solo' | 'armut' | 'small' | null;

  // Armut
  armutOffer: { fromPlayer: string; cardCount: number } | null;

  // UI
  selectedCard: CardId | null;
  showRoundScore: boolean;
  chatMessages: { from: string; message: string }[];

  // Actions
  setRoomId: (roomId: string) => void;
  setPlayerName: (name: string) => void;
  joinRoom: () => void;
  addBot: () => void;
  startGame: () => void;
  playCard: (cardId: CardId) => void;
  declareReservation: (type: ReservationType) => void;
  acceptArmut: (accept: boolean) => void;
  returnArmutCards: (cardIds: CardId[]) => void;
  makeAnnouncement: (type: AnnouncementType) => void;
  selectCard: (cardId: CardId | null) => void;
  startNewRound: () => void;
  acknowledgeTrick: () => void;
  sendChat: (message: string) => void;
  clearError: () => void;
  closeRoom: () => void;
  setShowRoundScore: (show: boolean) => void;
}

const useGameStore = create<GameStore>((set, get) => ({
  connected: false,
  connecting: false,
  error: null,
  roomId: 'zimmer1',
  playerName: '',
  myPlayerId: null,
  lobbyPlayers: [],
  gameState: null,
  lastRoundScore: null,
  reservationOptions: null,
  reservationPhase: null,
  armutOffer: null,
  showRoundScore: false,
  selectedCard: null,
  chatMessages: [],

  setRoomId: (roomId) => set({ roomId }),
  setPlayerName: (name) => set({ playerName: name }),

  joinRoom: () => {
    const { roomId, playerName } = get();
    if (!playerName.trim()) {
      set({ error: 'Bitte gib einen Namen ein' });
      return;
    }

    set({ connecting: true, error: null });

    const doJoin = () => {
      socket.emit('join-room', {
        roomId: roomId.trim() || 'zimmer1',
        playerName: playerName.trim(),
      });
    };

    if (socket.connected) {
      doJoin();
    } else {
      socket.once('connect', doJoin);
      socket.connect();
    }
  },

  addBot: () => {
    socket.emit('add-bot', {});
  },

  startGame: () => {
    socket.emit('start-game', {});
  },

  playCard: (cardId) => {
    const { selectedCard, gameState } = get();

    // If clicking same card, deselect
    if (selectedCard === cardId) {
      // Play the card
      socket.emit('play-card', { cardId });
      set({ selectedCard: null });
    } else {
      // Select the card first
      set({ selectedCard: cardId });
    }
  },

  declareReservation: (type) => {
    socket.emit('declare-reservation', { type });
    set({ reservationOptions: null, reservationPhase: null });
  },

  acceptArmut: (accept) => {
    socket.emit('accept-armut', { accept });
    set({ armutOffer: null });
  },

  returnArmutCards: (cardIds) => {
    socket.emit('return-armut-cards', { cardIds });
  },

  makeAnnouncement: (type) => {
    socket.emit('make-announcement', { type });
  },

  selectCard: (cardId) => set({ selectedCard: cardId }),

  startNewRound: () => {
    socket.emit('new-round', {});
    set({ lastRoundScore: null });
  },

  acknowledgeTrick: () => {
    socket.emit('acknowledge-trick', {});
  },

  sendChat: (message) => {
    socket.emit('chat', { message });
  },

  clearError: () => set({ error: null }),

  closeRoom: () => {
    socket.emit('close-room', {});
  },

  setShowRoundScore: (show) => set({ showRoundScore: show }),
}));

// ============================================================
// Socket Event Listeners
// ============================================================

export function initSocketListeners(): void {
  socket.on('connect', () => {
    useGameStore.setState({ connected: true, connecting: false });
  });

  socket.on('disconnect', () => {
    useGameStore.setState({ connected: false });
  });

  socket.on('connect_error', (err) => {
    useGameStore.setState({
      error: `Verbindungsfehler: ${err.message}`,
      connecting: false,
    });
  });

  socket.on('game-state', (state) => {
    useGameStore.setState({
      gameState: state,
      myPlayerId: state.myPlayerId,
      ...(state.phase === 'scoring' ? { showRoundScore: true } : {}),
    });
  });

  socket.on('reservation-request', ({ phase, options }) => {
    useGameStore.setState({
      reservationPhase: phase,
      reservationOptions: options,
    });
  });

  socket.on('armut-offer', (data) => {
    useGameStore.setState({ armutOffer: data });
  });

  socket.on('game-over', ({ roundScore }) => {
    useGameStore.setState({ lastRoundScore: roundScore });
  });

  socket.on('error', ({ message }) => {
    useGameStore.setState({ error: message });
    setTimeout(() => useGameStore.setState({ error: null }), 4000);
  });

  socket.on('room-update', ({ players }) => {
    useGameStore.setState({ lobbyPlayers: players, connecting: false, connected: true });
  });

  socket.on('chat', (msg) => {
    useGameStore.setState(state => ({
      chatMessages: [...state.chatMessages.slice(-49), msg],
    }));
  });

  socket.on('room-closed', () => {
    useGameStore.setState({
      gameState: null,
      lastRoundScore: null,
      lobbyPlayers: [],
      reservationOptions: null,
      reservationPhase: null,
      armutOffer: null,
      selectedCard: null,
      myPlayerId: null,
      showRoundScore: false,
    });
  });
}

export default useGameStore;
