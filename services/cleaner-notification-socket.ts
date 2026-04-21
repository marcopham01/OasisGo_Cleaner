import { io, type Socket } from 'socket.io-client';

import { apiClient } from '@/services/api';
import type { CleanerRealtimeNotification } from '@/types/cleaner-dashboard';
import { normalizeBackendMessage } from '@/utils/validation';

type CleanerRealtimeHandler = (event: CleanerRealtimeNotification) => void;

let socketRef: Socket | null = null;

function resolveSocketBaseUrl() {
  const configured = String(process.env.EXPO_PUBLIC_SOCKET_URL || '').trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  const apiBaseUrl = String(apiClient.defaults.baseURL || '').trim();
  if (!apiBaseUrl) {
    return '';
  }

  return apiBaseUrl.replace(/\/api\/?$/, '');
}

function getSocket() {
  if (socketRef) {
    return socketRef;
  }

  const socketBaseUrl = resolveSocketBaseUrl();
  if (!socketBaseUrl) {
    throw new Error('Không xác định được địa chỉ socket. Vui lòng cấu hình EXPO_PUBLIC_API_URL hoặc EXPO_PUBLIC_SOCKET_URL.');
  }

  socketRef = io(socketBaseUrl, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
  });

  return socketRef;
}

export function connectCleanerNotificationSocket(params: {
  token: string;
  cleanerId: string;
  onNotification: CleanerRealtimeHandler;
  onError?: (message: string) => void;
}) {
  const { token, cleanerId, onNotification, onError } = params;
  const socket = getSocket();

  socket.auth = {
    token: `Bearer ${token}`,
    cleaner_id: cleanerId,
  };

  const subscribe = () => {
    socket.emit('cleaner:subscribe', { cleaner_id: cleanerId });
  };

  const onSocketError = (payload: unknown) => {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: string }).message || 'Lỗi kết nối thời gian thực')
        : 'Lỗi kết nối thời gian thực';

    if (onError) {
      onError(normalizeBackendMessage(message));
    }
  };

  // Remove any stale handlers from a previous call (e.g. React Strict-Mode
  // double-mount, or rapid token-refresh re-renders) before registering new
  // ones.  This ensures at most ONE `cleaner:notification` listener is active
  // at any time, preventing the same socket event from firing multiple handlers
  // and producing duplicate local notifications.
  socket.off('connect');
  socket.off('cleaner:notification');
  socket.off('socket:error');

  socket.on('connect', subscribe);
  socket.on('cleaner:notification', onNotification);
  socket.on('socket:error', onSocketError);
  socket.connect();

  // Subscribe immediately if already connected (e.g. re-render with same socket).
  if (socket.connected) {
    subscribe();
  }

  return () => {
    socket.off('connect', subscribe);
    socket.off('cleaner:notification', onNotification);
    socket.off('socket:error', onSocketError);

    // Preserve singleton socket only while still connected handlers exist.
    if (socket.listeners('cleaner:notification').length === 0) {
      socket.disconnect();
    }
  };
}
