import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { logger } from './utils/logger';
import { loggerMiddleware } from './middleware/logger.middleware';
import { rateLimitMiddleware } from './middleware/rateLimit.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { routes } from './routes';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(loggerMiddleware);
  app.use(rateLimitMiddleware);
  app.use('/api', routes);
  app.use(errorMiddleware);

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, stage: 'server_started' });
  });
}
