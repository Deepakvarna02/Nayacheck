import { Router } from 'express';
import tenderRoutes from './tender.routes';
import bidderRoutes from './bidder.routes';
import evaluationRoutes from './evaluation.routes';
import reportRoutes from './report.routes';
import reviewRoutes from './review.routes';
import verificationRoutes from './verification.routes';
import realtimeRoutes from './realtime.routes';

export const routes = Router();

routes.use('/tender', tenderRoutes);
routes.use('/bidder', bidderRoutes);
routes.use('/evaluate', evaluationRoutes);
routes.use('/report', reportRoutes);
routes.use('/review', reviewRoutes);
routes.use('/verification', verificationRoutes);
routes.use('/realtime', realtimeRoutes);

routes.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nyayacheck-backend' });
});
