import { randomUUID } from 'crypto';

export type RealtimeEventType =
  | 'session.snapshot'
  | 'session.meta.updated'
  | 'session.log.appended'
  | 'tender.updated'
  | 'bidder.added'
  | 'bidder.status.changed'
  | 'evaluation.status.changed'
  | 'review.queue.updated';

export interface RealtimeEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: RealtimeEventType;
  sessionId: string;
  timestamp: string;
  payload: TPayload;
}

type RealtimeSubscriber = (event: RealtimeEvent) => void;

const channels = new Map<string, Set<RealtimeSubscriber>>();

function getChannel(sessionId: string): Set<RealtimeSubscriber> {
  const existing = channels.get(sessionId);
  if (existing) {
    return existing;
  }

  const nextChannel = new Set<RealtimeSubscriber>();
  channels.set(sessionId, nextChannel);
  return nextChannel;
}

export const realtimeService = {
  publish<TPayload extends Record<string, unknown> = Record<string, unknown>>(
    sessionId: string,
    type: RealtimeEventType,
    payload: TPayload = {} as TPayload
  ): RealtimeEvent<TPayload> {
    const event: RealtimeEvent<TPayload> = {
      id: `evt_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      type,
      sessionId,
      timestamp: new Date().toISOString(),
      payload
    };

    for (const subscriber of getChannel(sessionId)) {
      subscriber(event);
    }

    return event;
  },

  subscribe(sessionId: string, subscriber: RealtimeSubscriber): () => void {
    const channel = getChannel(sessionId);
    channel.add(subscriber);

    return () => {
      channel.delete(subscriber);
      if (channel.size === 0) {
        channels.delete(sessionId);
      }
    };
  }
};
