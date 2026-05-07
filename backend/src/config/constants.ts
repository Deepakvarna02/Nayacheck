import { env } from './env';

export const CONFIDENCE_THRESHOLDS = {
  eligible: env.CONFIDENCE_ELIGIBLE_THRESHOLD,
  fail: env.CONFIDENCE_FAIL_THRESHOLD,
  reviewLower: env.CONFIDENCE_REVIEW_LOWER
} as const;

export const FILE_LIMITS = {
  maxFileSizeBytes: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  maxFilesPerBidder: env.MAX_FILES_PER_BIDDER,
  maxBiddersPerSession: env.MAX_BIDDERS_PER_SESSION
} as const;

export const QUEUE_CONFIG = {
  concurrency: env.BULL_CONCURRENCY,
  timeoutMs: env.BULL_JOB_TIMEOUT_MS,
  retries: env.BULL_RETRIES
} as const;
