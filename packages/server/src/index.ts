import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameRoom } from './GameRoom';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const httpServer = createServer(app);

const ALLOWED_ORIGINS: string | string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : '*';

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: ALLOWED_ORIGINS !== '*' }));
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: ALLOWED_ORIGINS !== '*',
  },
});

// ============================================================
// Room Management
// ============================================================

const rooms = new Map<string, GameRoom>();
const playerRooms = new Map<string, string>(); // socketId -> roomId
const playerIds = new Map<string, string>(); // socketId -> playerId

function getOrCreateRoom(roomId: string): GameRoom {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new GameRoom(roomId, io));
  }
  return rooms.get(roomId)!;
}

// ============================================================
// Health Check
// ============================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

app.get('/rooms', (req, res) => {
  const roomList = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    playerCount: room.getPlayerCount(),
  }));
  res.json(roomList);
});

// ============================================================
// Socket.io
// ============================================================

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // ============================================================
  // Join Room
  // ============================================================
  socket.on('join-room', ({ roomId, playerName }: { roomId: string; playerName: string }) => {
    try {
      const cleanRoomId = roomId.trim().toLowerCase() || 'default';
      const cleanName = playerName.trim() || `Spieler ${socket.id.slice(0, 4)}`;

      // Assign or retrieve player ID
      let playerId = playerIds.get(socket.id);
      if (!playerId) {
        playerId = uuidv4();
        playerIds.set(socket.id, playerId);
      }

      const room = getOrCreateRoom(cleanRoomId);

      // Leave previous room if any
      const prevRoomId = playerRooms.get(socket.id);
      if (prevRoomId && prevRoomId !== cleanRoomId) {
        socket.leave(prevRoomId);
        const prevRoom = rooms.get(prevRoomId);
        if (prevRoom) prevRoom.removePlayer(socket.id);
      }

      // Join socket.io room first so broadcasts reach this socket
      socket.join(cleanRoomId);
      playerRooms.set(socket.id, cleanRoomId);

      // Try to reconnect or add new player
      const reconnected = room.reconnectPlayer(socket.id, playerId);
      if (!reconnected) {
        const result = room.addPlayer(socket.id, playerId, cleanName);
        if (result.error) {
          socket.emit('error', { message: result.error });
          return;
        }
      }

      console.log(`${cleanName} joined room ${cleanRoomId}`);

      // Always broadcast room update so new player sees current lobby
      room.broadcastRoomUpdate();
      // Additionally broadcast game state if a game is running
      room.broadcastGameState();
    } catch (err) {
      console.error('Error in join-room:', err);
      socket.emit('error', { message: 'Fehler beim Beitreten' });
    }
  });

  // ============================================================
  // Add Bot
  // ============================================================
  socket.on('add-bot', () => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) { socket.emit('error', { message: 'Nicht in einem Raum' }); return; }
    const room = rooms.get(roomId);
    if (!room) return;
    room.addBot();
  });

  // ============================================================
  // Start Game
  // ============================================================
  socket.on('start-game', () => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) { socket.emit('error', { message: 'Nicht in einem Raum' }); return; }
    const room = rooms.get(roomId);
    if (!room) return;

    const playerId = playerIds.get(socket.id) ?? '';
    const result = room.startGame(playerId);
    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  // ============================================================
  // New Round
  // ============================================================
  socket.on('acknowledge-trick', () => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.acknowledgeTrick();
  });

  socket.on('new-round', () => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.startNewRound();
  });

  // ============================================================
  // Play Card
  // ============================================================
  socket.on('play-card', ({ cardId }: { cardId: string }) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) { socket.emit('error', { message: 'Nicht in einem Raum' }); return; }
    const room = rooms.get(roomId);
    if (!room) return;

    const playerId = playerIds.get(socket.id) ?? '';
    const result = room.handlePlayCard(playerId, cardId);
    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  // ============================================================
  // Declare Reservation
  // ============================================================
  socket.on('declare-reservation', ({ type }: { type: string }) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const playerId = playerIds.get(socket.id) ?? '';
    const result = room.handleDeclareReservation(playerId, type as any);
    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  // ============================================================
  // Accept Armut
  // ============================================================
  socket.on('accept-armut', ({ accept }: { accept: boolean }) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const playerId = playerIds.get(socket.id) ?? '';
    const result = room.handleAcceptArmut(playerId, accept);
    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  // ============================================================
  // Return Armut Cards
  // ============================================================
  socket.on('return-armut-cards', ({ cardIds }: { cardIds: string[] }) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const playerId = playerIds.get(socket.id) ?? '';
    const result = room.handleReturnArmutCards(playerId, cardIds);
    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  // ============================================================
  // Make Announcement
  // ============================================================
  socket.on('make-announcement', ({ type }: { type: string }) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const playerId = playerIds.get(socket.id) ?? '';
    const result = room.handleAnnouncement(playerId, type as any);
    if (result.error) {
      socket.emit('error', { message: result.error });
    }
  });

  // ============================================================
  // Chat
  // ============================================================
  socket.on('chat', ({ message }: { message: string }) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const playerId = playerIds.get(socket.id) ?? '';
    io.to(roomId).emit('chat', {
      from: playerId,
      message: message.slice(0, 200),
    });
  });

  // ============================================================
  // Disconnect
  // ============================================================
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    const roomId = playerRooms.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) room.removePlayer(socket.id);
      playerRooms.delete(socket.id);
    }
    playerIds.delete(socket.id);
  });
});

// ============================================================
// Start Server
// ============================================================

const PORT = parseInt(process.env.PORT ?? '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`Doppelkopf server running on http://localhost:${PORT}`);
});
