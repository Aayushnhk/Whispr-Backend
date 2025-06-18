// src/lib/socket.ts

import io from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4001';

let socket: ReturnType<typeof io> | null = null;

export const getSocket = (): ReturnType<typeof io> => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
    });
  }
  return socket;
};
