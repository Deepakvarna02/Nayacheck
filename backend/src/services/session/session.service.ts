import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { dataRoot } from '../../config/env';
import { logger } from '../../utils/logger';
import type { Evidence } from '../../validators/evidence.schema';
import type { TenderCriteria } from '../../validators/tender.schema';
import type { Verdict } from '../../validators/verdict.schema';
import type { AuditTrail } from '../../validators/audit.schema';
import type { DocumentManifest } from '../document/document.types';
import { inferThresholdType, normalizeThresholdValue } from '../ai/procurement-normalization';
import type {
  OverrideLogEntry,
  ReviewQueueItem,
  ReviewResolution,
  SessionBundle,
  SessionMeta,
  StoredBidderResult
} from './session.types';
import { realtimeService } from '../realtime/realtime.service';

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function sessionPath(sessionId: string): string {
  return path.join(dataRoot, sessionId);
}

function bidderPath(sessionId: string, bidderId: string): string {
  return path.join(sessionPath(sessionId), 'bidders', bidderId);
}

function tenderManifestPath(sessionId: string): string {
  return path.join(sessionPath(sessionId), 'tender-manifest.json');
}

function bidderManifestPath(sessionId: string, bidderId: string): string {
  return path.join(bidderPath(sessionId, bidderId), 'document-manifest.json');
}

function reviewQueuePath(sessionId: string): string {
  return path.join(sessionPath(sessionId), 'review-queue.json');
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeReviewItemId(
  bidderId: string | null,
  criterionId: string,
  issueType: ReviewQueueItem['issueType']
): string {
  return `rev_${bidderId ?? 'session'}_${criterionId}_${issueType}`;
}

export const sessionService = {
  async createSession(sourceMode: 'active_case' | 'practice_case' = 'active_case'): Promise<SessionMeta> {
    const sessionId = `sess_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const meta: SessionMeta = {
      sessionId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: 'draft',
      sourceMode,
      tenderUploaded: false,
      approvedBy: null,
      evaluationJobId: null,
      bidders: [],
      processingLog: []
    };

    await writeJsonFile(path.join(sessionPath(sessionId), 'meta.json'), meta);
    return meta;
  },

  async getMeta(sessionId: string): Promise<SessionMeta | null> {
    return readJsonFile<SessionMeta>(path.join(sessionPath(sessionId), 'meta.json'));
  },

  async saveMeta(meta: SessionMeta): Promise<void> {
    meta.updatedAt = nowIso();
    await writeJsonFile(path.join(sessionPath(meta.sessionId), 'meta.json'), meta);
    realtimeService.publish(meta.sessionId, 'session.meta.updated', {
      status: meta.status,
      bidderCount: meta.bidders.length,
      approvedBy: meta.approvedBy,
      processingLogCount: meta.processingLog.length,
      updatedAt: meta.updatedAt
    });
  },

  async appendLog(sessionId: string, entry: SessionMeta['processingLog'][number]): Promise<void> {
    const meta = await this.getMeta(sessionId);
    if (!meta) {
      throw new Error(`Session ${sessionId} not found`);
    }
    meta.processingLog.push(entry);
    await this.saveMeta(meta);
    realtimeService.publish(sessionId, 'session.log.appended', {
      step: entry.step,
      status: entry.status,
      detail: entry.detail,
      timestamp: entry.timestamp
    });
  },

  async saveTender(sessionId: string, tender: TenderCriteria): Promise<void> {
    const meta = await this.getMeta(sessionId);
    if (!meta) {
      throw new Error(`Session ${sessionId} not found`);
    }
    meta.tenderUploaded = true;
    await writeJsonFile(path.join(sessionPath(sessionId), 'tender.json'), tender);
    meta.processingLog.push({
      step: 'Tender criteria extraction',
      status: 'success',
      detail: `Extracted ${tender.criteria.length} criteria from tender.`,
      timestamp: nowIso()
    });
    await this.saveMeta(meta);
    realtimeService.publish(sessionId, 'tender.updated', {
      criteriaCount: tender.criteria.length,
      ambiguousCount: tender.criteria.filter((criterion) => criterion.ambiguity_flag).length,
      extractionConfidence: tender.extraction_confidence
    });
  },

  async getTender(sessionId: string): Promise<TenderCriteria | null> {
    return readJsonFile<TenderCriteria>(path.join(sessionPath(sessionId), 'tender.json'));
  },

  async updateCriterion(
    sessionId: string,
    criterionId: string,
    updates: { description?: string; threshold?: string; type?: 'mandatory' | 'optional'; approvedBy: string }
  ): Promise<void> {
    const tender = await this.getTender(sessionId);
    if (!tender) {
      throw new Error(`Tender for session ${sessionId} not found`);
    }

    tender.criteria = tender.criteria.map((criterion) =>
      criterion.id === criterionId
        ? (() => {
            const description = updates.description ?? criterion.description;
            const threshold = updates.threshold ?? criterion.threshold;
            const type = updates.type ?? criterion.type;
            const normalisedType = inferThresholdType({
              ...criterion,
              description,
              threshold,
              type
            });
            const normalisedValue = normalizeThresholdValue(normalisedType, threshold, description);
            const machineComparable =
              Boolean(normalisedValue.numericMin) ||
              Boolean(normalisedValue.countMin) ||
              Boolean(normalisedValue.validityDate) ||
              Boolean(normalisedValue.requiredStatus) ||
              normalisedType === 'boolean_required';

            return {
              ...criterion,
              description,
              threshold,
              type,
              normalised_threshold_type: normalisedType,
              normalised_threshold_value: normalisedValue,
              manual_review_heavy: criterion.ambiguity_flag || !machineComparable
            };
          })()
        : criterion
    );
    await writeJsonFile(path.join(sessionPath(sessionId), 'tender.json'), tender);
    await this.appendLog(sessionId, {
      step: 'Tender criterion review',
      status: 'success',
      detail: `Criterion ${criterionId} updated by ${updates.approvedBy}.`,
      timestamp: nowIso()
    });
    realtimeService.publish(sessionId, 'tender.updated', {
      criterionId,
      approvedBy: updates.approvedBy
    });
  },

  async addBidder(
    sessionId: string,
    bidder: {
      bidderName: string;
      files: string[];
      documentQuality: SessionMeta['bidders'][number]['documentQuality'];
      qualityReason: string | null;
    }
  ): Promise<{ bidderId: string }> {
    const meta = await this.getMeta(sessionId);
    if (!meta) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const bidderId = `bid_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    meta.bidders.push({
      bidderId,
      bidderName: bidder.bidderName,
      files: bidder.files,
      status: 'uploaded',
      documentQuality: bidder.documentQuality,
      qualityReason: bidder.qualityReason,
      error: null
    });
    await this.saveMeta(meta);

    await writeJsonFile(path.join(bidderPath(sessionId, bidderId), 'meta.json'), {
      bidderId,
      bidderName: bidder.bidderName,
      files: bidder.files
    });

    realtimeService.publish(sessionId, 'bidder.added', {
      bidderId,
      bidderName: bidder.bidderName,
      status: 'uploaded',
      documentQuality: bidder.documentQuality
    });

    return { bidderId };
  },

  async setBidderStatus(
    sessionId: string,
    bidderId: string,
    status: SessionMeta['bidders'][number]['status'],
    error: string | null = null
  ): Promise<void> {
    const meta = await this.getMeta(sessionId);
    if (!meta) {
      throw new Error(`Session ${sessionId} not found`);
    }

    meta.bidders = meta.bidders.map((item) =>
      item.bidderId === bidderId ? { ...item, status, error } : item
    );
    await this.saveMeta(meta);
    realtimeService.publish(sessionId, 'bidder.status.changed', {
      bidderId,
      status,
      error
    });
  },

  async saveBidderResults(sessionId: string, bidderId: string, results: StoredBidderResult): Promise<void> {
    await writeJsonFile(path.join(bidderPath(sessionId, bidderId), 'evidence.json'), results.evidenceJson);
    await writeJsonFile(path.join(bidderPath(sessionId, bidderId), 'verdict.json'), results.verdictJson);
    await this.setBidderStatus(sessionId, bidderId, 'complete');
  },

  async markBidderFailed(sessionId: string, bidderId: string, error: string): Promise<void> {
    logger.error({ sessionId, bidderId, error, stage: 'mark_bidder_failed' });
    await this.setBidderStatus(sessionId, bidderId, 'failed', error);
  },

  async getBidderEvidence(sessionId: string, bidderId: string): Promise<Evidence | null> {
    return readJsonFile<Evidence>(path.join(bidderPath(sessionId, bidderId), 'evidence.json'));
  },

  async getBidderVerdict(sessionId: string, bidderId: string): Promise<Verdict | null> {
    return readJsonFile<Verdict>(path.join(bidderPath(sessionId, bidderId), 'verdict.json'));
  },

  async getBundle(sessionId: string): Promise<SessionBundle | null> {
    const meta = await this.getMeta(sessionId);
    if (!meta) {
      return null;
    }

    const tender = await this.getTender(sessionId);
    const tenderManifest = await this.getTenderManifest(sessionId);
    const bidders = await Promise.all(
      meta.bidders.map(async (bidder) => ({
        bidderId: bidder.bidderId,
        bidderName: bidder.bidderName,
        evidence: await this.getBidderEvidence(sessionId, bidder.bidderId),
        verdict: await this.getBidderVerdict(sessionId, bidder.bidderId),
        documentManifest: await this.getBidderDocumentManifest(sessionId, bidder.bidderId)
      }))
    );
    const audit = await this.getAudit(sessionId);
    const overrideLog = await this.getOverrideLog(sessionId);
    const reviewQueue = await this.getReviewQueue(sessionId);

    return { meta, tender, tenderManifest, bidders, audit, overrideLog, reviewQueue };
  },

  async saveAudit(sessionId: string, audit: AuditTrail & { integrityHash?: string }): Promise<void> {
    await writeJsonFile(path.join(sessionPath(sessionId), 'audit.json'), audit);
  },

  async getAudit(sessionId: string): Promise<(AuditTrail & { integrityHash?: string }) | null> {
    return readJsonFile<AuditTrail & { integrityHash?: string }>(path.join(sessionPath(sessionId), 'audit.json'));
  },

  async getOverrideLog(sessionId: string): Promise<OverrideLogEntry[]> {
    return (await readJsonFile<OverrideLogEntry[]>(path.join(sessionPath(sessionId), 'override-log.json'))) ?? [];
  },

  async saveTenderManifest(sessionId: string, manifests: DocumentManifest[]): Promise<void> {
    await writeJsonFile(tenderManifestPath(sessionId), manifests);
  },

  async getTenderManifest(sessionId: string): Promise<DocumentManifest[] | null> {
    return readJsonFile<DocumentManifest[]>(tenderManifestPath(sessionId));
  },

  async saveBidderDocumentManifest(sessionId: string, bidderId: string, manifests: DocumentManifest[]): Promise<void> {
    await writeJsonFile(bidderManifestPath(sessionId, bidderId), manifests);
  },

  async getBidderDocumentManifest(sessionId: string, bidderId: string): Promise<DocumentManifest[] | null> {
    return readJsonFile<DocumentManifest[]>(bidderManifestPath(sessionId, bidderId));
  },

  async getReviewQueue(sessionId: string): Promise<ReviewQueueItem[]> {
    return (await readJsonFile<ReviewQueueItem[]>(reviewQueuePath(sessionId))) ?? [];
  },

  async saveReviewQueue(sessionId: string, reviewQueue: ReviewQueueItem[]): Promise<void> {
    await writeJsonFile(reviewQueuePath(sessionId), reviewQueue);
  },

  async syncBidderReviewQueue(
    sessionId: string,
    bidderId: string,
    tender: TenderCriteria,
    evidence: Evidence,
    verdict: Verdict
  ): Promise<void> {
    const existing = await this.getReviewQueue(sessionId);
    const preserved = existing.filter((item) => item.bidderId !== bidderId || item.status !== 'open');
    const queueItems: ReviewQueueItem[] = verdict.criteria_verdicts
      .filter((item) => item.verdict === 'NEEDS_REVIEW')
      .map((item) => {
        const criterion = tender.criteria.find((criterionItem) => criterionItem.id === item.criterion_id);
        const evidenceItem = evidence.criteria_evidence.find((evidenceEntry) => evidenceEntry.criterion_id === item.criterion_id);
        const issueType: ReviewQueueItem['issueType'] =
          evidenceItem?.evidence_type === 'ocr_uncertain' || evidence.document_quality === 'scanned_unreadable'
            ? 'ocr_uncertain'
            : evidenceItem?.evidence_type === 'missing' || evidenceItem?.found === false
              ? 'missing_document'
              : criterion?.ambiguity_flag || criterion?.manual_review_heavy
                ? 'ambiguous_threshold'
                : evidence.red_flags.some((flag) => flag.flag.toLowerCase().includes('name'))
                  ? 'name_mismatch'
                  : evidenceItem?.evidence_type === 'manual_override'
                    ? 'manual_override'
                    : 'ambiguous_threshold';

        return {
          reviewItemId: makeReviewItemId(bidderId, item.criterion_id, issueType),
          bidderId,
          criterionId: item.criterion_id,
          issueType,
          issueSummary: item.reasoning,
          requestedAction:
            item.reviewer_action ??
            `Review ${criterion?.verification_source ?? 'supporting documents'} and confirm criterion ${item.criterion_id}.`,
          status: 'open',
          createdAt: nowIso(),
          resolvedAt: null,
          reviewerName: null,
          reviewerDesignation: null,
          resolutionNotes: null
        };
      });

    await this.saveReviewQueue(sessionId, [...preserved, ...queueItems]);
    realtimeService.publish(sessionId, 'review.queue.updated', {
      bidderId,
      reviewItemsAdded: queueItems.length
    });
  },

  async syncCrossBidderReviewItems(
    sessionId: string,
    issues: Array<{ criterion_id: string; issue: string; recommendation: string }>
  ): Promise<void> {
    const existing = await this.getReviewQueue(sessionId);
    const preserved = existing.filter(
      (item) => !(item.bidderId === null && item.issueType === 'cross_bidder_inconsistency' && item.status === 'open')
    );
    const createdAt = nowIso();
    const generated = issues.map<ReviewQueueItem>((issue) => ({
      reviewItemId: makeReviewItemId(null, issue.criterion_id, 'cross_bidder_inconsistency'),
      bidderId: null,
      criterionId: issue.criterion_id,
      issueType: 'cross_bidder_inconsistency',
      issueSummary: issue.issue,
      requestedAction: issue.recommendation,
      status: 'open',
      createdAt,
      resolvedAt: null,
      reviewerName: null,
      reviewerDesignation: null,
      resolutionNotes: null
    }));

    await this.saveReviewQueue(sessionId, [...preserved, ...generated]);
    realtimeService.publish(sessionId, 'review.queue.updated', {
      reviewItemsAdded: generated.length,
      source: 'cross_bidder_inconsistency'
    });
  },

  async appendOverrideLog(sessionId: string, entry: OverrideLogEntry): Promise<void> {
    const existing = await this.getOverrideLog(sessionId);
    existing.push(entry);
    await writeJsonFile(path.join(sessionPath(sessionId), 'override-log.json'), existing);
    await this.appendLog(sessionId, {
      step: 'Manual evidence override',
      status: 'warning',
      detail: `Bidder ${entry.bidderId}, criterion ${entry.criterionId} overridden by ${entry.reviewerName}.`,
      timestamp: entry.timestamp
    });
  },

  async recordManualOverrideReviewItem(
    sessionId: string,
    entry: OverrideLogEntry,
    resolutionNotes: string
  ): Promise<void> {
    const existing = await this.getReviewQueue(sessionId);
    existing.push({
      reviewItemId: makeReviewItemId(entry.bidderId, entry.criterionId, 'manual_override'),
      bidderId: entry.bidderId,
      criterionId: entry.criterionId,
      issueType: 'manual_override',
      issueSummary: `Officer manually overrode extracted value for ${entry.criterionId}.`,
      requestedAction: 'Review override log before final sign-off.',
      status: 'resolved',
      createdAt: entry.timestamp,
      resolvedAt: entry.timestamp,
      reviewerName: entry.reviewerName,
      reviewerDesignation: entry.reviewerDesignation,
      resolutionNotes
    });
    await this.saveReviewQueue(sessionId, existing);
  },

  async applyReviewResolution(sessionId: string, bidderId: string, resolution: ReviewResolution): Promise<void> {
    const verdict = await this.getBidderVerdict(sessionId, bidderId);
    if (!verdict) {
      throw new Error(`Verdict for bidder ${bidderId} not found`);
    }

    verdict.criteria_verdicts = verdict.criteria_verdicts.map((item) =>
      item.criterion_id === resolution.criterionId
        ? {
            ...item,
            verdict: resolution.resolution === 'ESCALATE' ? 'NEEDS_REVIEW' : resolution.resolution,
            reviewer_action:
              resolution.resolution === 'ESCALATE'
                ? `Escalated by ${resolution.reviewerName}: ${resolution.notes}`
                : null,
            reasoning: `${item.reasoning} Reviewer note: ${resolution.notes}`
          }
        : item
    );

    verdict.disqualifying_criteria = verdict.criteria_verdicts
      .filter((item) => item.verdict === 'FAIL')
      .map((item) => item.criterion_id);
    verdict.review_criteria = verdict.criteria_verdicts
      .filter((item) => item.verdict === 'NEEDS_REVIEW')
      .map((item) => item.criterion_id);
    verdict.overall_verdict =
      verdict.disqualifying_criteria.length > 0
        ? 'NOT_ELIGIBLE'
        : verdict.review_criteria.length > 0
          ? 'NEEDS_REVIEW'
          : 'ELIGIBLE';

    await writeJsonFile(path.join(bidderPath(sessionId, bidderId), 'verdict.json'), verdict);

    const queue = await this.getReviewQueue(sessionId);
    const updatedQueue = queue.map((item) =>
      item.bidderId === bidderId && item.criterionId === resolution.criterionId && item.status === 'open'
        ? {
            ...item,
            status: (resolution.resolution === 'ESCALATE' ? 'escalated' : 'resolved') as
              | 'resolved'
              | 'escalated',
            resolvedAt: resolution.timestamp,
            reviewerName: resolution.reviewerName,
            reviewerDesignation: resolution.reviewerDesignation,
            resolutionNotes: resolution.notes
          }
        : item
    );
    await this.saveReviewQueue(sessionId, updatedQueue);

    await this.appendLog(sessionId, {
      step: 'Human review resolution',
      status: 'success',
      detail: `Bidder ${bidderId}, criterion ${resolution.criterionId} reviewed by ${resolution.reviewerName}.`,
      timestamp: resolution.timestamp
    });
    realtimeService.publish(sessionId, 'review.queue.updated', {
      bidderId,
      criterionId: resolution.criterionId,
      resolution: resolution.resolution,
      reviewerName: resolution.reviewerName
    });
  }
};
