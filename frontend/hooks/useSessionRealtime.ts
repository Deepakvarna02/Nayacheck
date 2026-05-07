'use client';

import { useEffect, useRef, useState } from 'react';

export type SessionRealtimeEvent = {
  id: string;
  type: string;
  sessionId: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

type UseSessionRealtimeOptions = {
  sessionId: string;
  enabled?: boolean;
  onEvent?: (event: SessionRealtimeEvent) => void;
};

export function useSessionRealtime({ sessionId, enabled = true, onEvent }: UseSessionRealtimeOptions) {
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventHandlerRef = useRef(onEvent);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    eventHandlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !sessionId) {
      return;
    }

    let cancelled = false;

    const clearRetryTimer = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const closeSource = () => {
      sourceRef.current?.close();
      sourceRef.current = null;
    };

    const scheduleReconnect = () => {
      if (cancelled) {
        return;
      }

      clearRetryTimer();
      const delay = Math.min(1000 * 2 ** retryCountRef.current, 10000);
      retryCountRef.current += 1;
      retryTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled) {
        return;
      }

      closeSource();
      const source = new EventSource(`/api/proxy/realtime/${sessionId}/events`);
      sourceRef.current = source;
      setError(null);

      source.onopen = () => {
        retryCountRef.current = 0;
        setConnected(true);
        setError(null);
      };

      source.onmessage = (messageEvent) => {
        try {
          const event = JSON.parse(messageEvent.data) as SessionRealtimeEvent;
          setLastEventAt(event.timestamp);
          eventHandlerRef.current?.(event);
        } catch {
          setError('Received an unreadable live update.');
        }
      };

      source.onerror = () => {
        if (cancelled) {
          return;
        }

        setConnected(false);
        setError('Live connection paused. Reconnecting...');
        closeSource();
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearRetryTimer();
      closeSource();
    };
  }, [enabled, sessionId]);

  return {
    connected,
    lastEventAt,
    error
  };
}
