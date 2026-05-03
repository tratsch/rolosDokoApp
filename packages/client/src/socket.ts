import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@dokoapp/shared';

// In dev: relative URL → Vite proxy to localhost:3001
// In production: VITE_SERVER_URL env var (e.g. https://your-server.railway.app)
const serverUrl = import.meta.env.VITE_SERVER_URL ?? '';

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export default socket;
