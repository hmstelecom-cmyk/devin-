import { useEffect, useRef, useCallback } from 'react';
import { getWsUrl } from '../services/api';
import type { WSMessage } from '../types';

export function useWebSocket(
  onMessage: (msg: WSMessage) => void,
  isAuthenticated: boolean
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!isAuthenticated) return;
    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSMessage;
          onMessage(data);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        reconnectTimeout.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimeout.current = setTimeout(connect, 3000);
    }
  }, [isAuthenticated, onMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [connect]);

  const sendWsMessage = useCallback((type: string, data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  return { sendWsMessage };
}
