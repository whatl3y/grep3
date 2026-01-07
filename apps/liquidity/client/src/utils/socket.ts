import { io, Socket } from 'socket.io-client';
import { LiquidityDistribution, ProgressData } from '../types';
import { PoolKey } from './api';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Socket event types matching server
interface ServerToClientEvents {
  progress: (data: ProgressData) => void;
  data: (data: { success: true; data: LiquidityDistribution }) => void;
  error: (data: { success: false; error: string }) => void;
}

interface ClientToServerEvents {
  'fetch:v3': (data: {
    poolAddress: string;
    priceRange?: number;
    chainId?: number;
    autoDetect?: boolean;
  }) => void;
  'fetch:v4': (data: {
    poolKey?: PoolKey;
    poolId?: string;
    poolName?: string;
    priceRange?: number;
  }) => void;
  'detect:chain': (data: { poolAddress: string }) => void;
  'identify': (data: { value: string }) => void;
  'validate:v4': (data: { poolId: string }) => void;
}

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export interface FetchV3Options {
  poolAddress: string;
  priceRange?: number;
  chainId?: number;
  autoDetect?: boolean;
  onProgress: (progress: ProgressData) => void;
  onData: (data: LiquidityDistribution) => void;
  onError: (error: string) => void;
}

export interface FetchV4Options {
  poolKey?: PoolKey;
  poolId?: string;
  poolName?: string;
  priceRange?: number;
  onProgress: (progress: ProgressData) => void;
  onData: (data: LiquidityDistribution) => void;
  onError: (error: string) => void;
}

export function fetchV3PoolViaSocket(options: FetchV3Options): () => void {
  const { poolAddress, priceRange, chainId, autoDetect, onProgress, onData, onError } = options;
  const socket = getSocket();

  // Set up listeners
  const progressHandler = (data: ProgressData) => {
    onProgress(data);
  };

  const dataHandler = (response: { success: true; data: LiquidityDistribution }) => {
    onData(response.data);
    cleanup();
  };

  const errorHandler = (response: { success: false; error: string }) => {
    onError(response.error);
    cleanup();
  };

  // Cleanup function
  const cleanup = () => {
    socket.off('progress', progressHandler);
    socket.off('data', dataHandler);
    socket.off('error', errorHandler);
  };

  // Register listeners
  socket.on('progress', progressHandler);
  socket.on('data', dataHandler);
  socket.on('error', errorHandler);

  // Emit fetch request with chain info
  socket.emit('fetch:v3', { poolAddress, priceRange, chainId, autoDetect });

  // Return cleanup function for cancellation
  return cleanup;
}

export function fetchV4PoolViaSocket(options: FetchV4Options): () => void {
  const { poolKey, poolId, poolName, priceRange, onProgress, onData, onError } = options;
  const socket = getSocket();

  // Set up listeners
  const progressHandler = (data: ProgressData) => {
    onProgress(data);
  };

  const dataHandler = (response: { success: true; data: LiquidityDistribution }) => {
    onData(response.data);
    cleanup();
  };

  const errorHandler = (response: { success: false; error: string }) => {
    onError(response.error);
    cleanup();
  };

  // Cleanup function
  const cleanup = () => {
    socket.off('progress', progressHandler);
    socket.off('data', dataHandler);
    socket.off('error', errorHandler);
  };

  // Register listeners
  socket.on('progress', progressHandler);
  socket.on('data', dataHandler);
  socket.on('error', errorHandler);

  // Emit fetch request
  socket.emit('fetch:v4', { poolKey, poolId, poolName, priceRange });

  // Return cleanup function for cancellation
  return cleanup;
}
