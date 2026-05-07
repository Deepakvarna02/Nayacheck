import { Router, type Response } from 'express';
import { asSingleParam } from '../utils/http';
import { sessionService } from '../services/session/session.service';
import { AppError } from '../middleware/error.middleware';
import { realtimeService } from '../services/realtime/realtime.service';

const router = Router();

function writeEvent<TPayload extends Record<string, unknown>>(
  res: Response,
  event: {
  id: string;
  type: string;
  sessionId: string;
  timestamp: string;
  payload: TPayload;
}): void {
  res.write(`id: ${event.id}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

router.get('/:sessionId/events', async (req, res, next) => {
  try {
    const sessionId = asSingleParam(req.params.sessionId);
    const meta = await sessionService.getMeta(sessionId);
    if (!meta) {
      throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.');
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const connectedEvent = {
      id: `evt_connect_${Date.now()}`,
      type: 'session.snapshot',
      sessionId,
      timestamp: new Date().toISOString(),
      payload: {
        sourceMode: meta.sourceMode ?? 'active_case',
        status: meta.status,
        bidderCount: meta.bidders.length,
        tenderUploaded: meta.tenderUploaded,
        approvedBy: meta.approvedBy,
        processingLogCount: meta.processingLog.length
      }
    };

    writeEvent(res, connectedEvent);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    const unsubscribe = realtimeService.subscribe(sessionId, (event) => {
      writeEvent(res, event);
    });

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  } catch (error) {
    next(error);
  }
});

export default router;
