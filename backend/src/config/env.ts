import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CONFIDENCE_ELIGIBLE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  CONFIDENCE_FAIL_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  CONFIDENCE_REVIEW_LOWER: z.coerce.number().min(0).max(1).default(0.5),
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(20),
  MAX_FILES_PER_BIDDER: z.coerce.number().int().positive().default(10),
  MAX_BIDDERS_PER_SESSION: z.coerce.number().int().positive().default(50),
  BULL_CONCURRENCY: z.coerce.number().int().positive().default(5),
  BULL_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  BULL_RETRIES: z.coerce.number().int().min(0).default(2)
});

export const env = EnvSchema.parse(process.env);
export const projectRoot = path.resolve(__dirname, '..', '..');
export const dataRoot = path.join(projectRoot, 'data', 'sessions');
