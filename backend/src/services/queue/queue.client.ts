import Bull from 'bull';
import { env } from '../../config/env';
import { QUEUE_CONFIG } from '../../config/constants';
import { processBidder, type BidderJob } from './bidder.processor';

let bidderQueue: Bull.Queue<BidderJob> | null = null;

let workerRegistered = false;

export function getBidderQueue(): Bull.Queue<BidderJob> {
  if (!bidderQueue) {
    bidderQueue = new Bull<BidderJob>('bidder-evaluation', env.REDIS_URL);
  }

  return bidderQueue;
}

export function ensureBidderWorker(): Bull.Queue<BidderJob> {
  const queue = getBidderQueue();
  if (workerRegistered) {
    return queue;
  }

  queue.process(QUEUE_CONFIG.concurrency, async (job) => processBidder(job));
  workerRegistered = true;
  return queue;
}
