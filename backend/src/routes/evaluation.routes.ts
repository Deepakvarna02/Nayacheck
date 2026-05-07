import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.middleware';
import { AppError } from '../middleware/error.middleware';
import { sessionService } from '../services/session/session.service';
import { ensureBidderWorker } from '../services/queue/queue.client';
import { QUEUE_CONFIG } from '../config/constants';
import { auditService } from '../services/ai/audit.service';
import { asSingleParam } from '../utils/http';
import { processBidderData } from '../services/queue/bidder.processor';
import { logger } from '../utils/logger';
import { analyzeConsistency } from '../services/ai/consistency.service';
import { EvidenceSchema } from '../validators/evidence.schema';
import { decisionService } from '../services/ai/decision.service';
import type { Evidence } from '../validators/evidence.schema';
import { normalizeEvidenceStructuredValue } from '../services/ai/procurement-normalization';

async function runInlineEvaluation(sessionId: string): Promise<void> {
  const meta = await sessionService.getMeta(sessionId);
  const tender = await sessionService.getTender(sessionId);
  if (!meta || !tender) {
    throw new AppError(404, 'SESSION_NOT_FOUND', 'Evaluation session not found.');
  }

  const pendingBidders = meta.bidders.filter((bidder) => bidder.status !== 'complete');

  await Promise.all(
    pendingBidders.map((bidder) =>
      processBidderData({
        sessionId,
        bidderId: bidder.bidderId,
        filePaths: bidder.files,
        criteriaJson: tender
      })
    )
  );

  meta.status = 'complete';
  await sessionService.saveMeta(meta);
}

const router = Router();

router.post(
  '/:sessionId',
  validateBody(
    z.object({
      approvedBy: z.string().min(2)
    })
  ),
  async (req, res, next) => {
    try {
      const sessionId = asSingleParam(req.params.sessionId);
      const meta = await sessionService.getMeta(sessionId);
      const tender = await sessionService.getTender(sessionId);
      if (!meta || !tender) {
        throw new AppError(404, 'SESSION_NOT_FOUND', 'Evaluation session not found.');
      }

      meta.status = 'processing';
      meta.approvedBy = req.body.approvedBy;
      meta.evaluationJobId = `job_${Date.now()}`;
      await sessionService.saveMeta(meta);

      const pendingBidders = meta.bidders.filter((bidder) => bidder.status !== 'complete');

      if (pendingBidders.length === 0) {
        meta.status = 'complete';
        await sessionService.saveMeta(meta);
        res.json({
          sessionId,
          status: 'complete',
          biddersQueued: 0,
          estimatedTimeSeconds: 0,
          jobId: meta.evaluationJobId
        });
        return;
      }

      try {
        const bidderQueue = ensureBidderWorker();

        for (const bidder of pendingBidders) {
          await sessionService.setBidderStatus(sessionId, bidder.bidderId, 'queued');
          await bidderQueue.add(
            {
              sessionId,
              bidderId: bidder.bidderId,
              filePaths: bidder.files,
              criteriaJson: tender
            },
            {
              attempts: QUEUE_CONFIG.retries + 1,
              timeout: QUEUE_CONFIG.timeoutMs,
              removeOnComplete: 100,
              removeOnFail: 100
            }
          );
        }

        res.json({
          sessionId,
          status: 'processing',
          biddersQueued: pendingBidders.length,
          estimatedTimeSeconds: Math.max(15, pendingBidders.length * 9),
          jobId: meta.evaluationJobId
        });
      } catch (error) {
        logger.warn({
          sessionId,
          stage: 'queue_unavailable_fallback',
          error: error instanceof Error ? error.message : String(error)
        });

        await runInlineEvaluation(sessionId);
        res.json({
          sessionId,
          status: 'complete',
          biddersQueued: meta.bidders.length,
          estimatedTimeSeconds: 0,
          jobId: meta.evaluationJobId
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:sessionId/status', async (req, res, next) => {
  try {
    const sessionId = asSingleParam(req.params.sessionId);
    const meta = await sessionService.getMeta(sessionId);
    if (!meta) {
      throw new AppError(404, 'SESSION_NOT_FOUND', 'Evaluation session not found.');
    }

    const progress = {
      total: meta.bidders.length,
      complete: meta.bidders.filter((item) => item.status === 'complete').length,
      processing: meta.bidders.filter((item) => item.status === 'processing').length,
      pending: meta.bidders.filter((item) => item.status === 'uploaded' || item.status === 'queued').length,
      failed: meta.bidders.filter((item) => item.status === 'failed').length
    };

    const status =
      progress.failed > 0 && progress.complete > 0
        ? 'partial'
        : progress.complete === progress.total && progress.total > 0
          ? 'complete'
          : progress.failed === progress.total && progress.total > 0
            ? 'error'
            : 'processing';

    if (status === 'complete' || status === 'partial') {
      meta.status = status;
      await sessionService.saveMeta(meta);
    }

    res.json({
      sessionId,
      status,
      progress,
      estimatedSecondsRemaining: Math.max(0, progress.pending * 8 + progress.processing * 5)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:sessionId/results', async (req, res, next) => {
  try {
    const sessionId = asSingleParam(req.params.sessionId);
    const bundle = await sessionService.getBundle(sessionId);
    if (!bundle) {
      throw new AppError(404, 'SESSION_NOT_FOUND', 'Evaluation session not found.');
    }

    const bidders = bundle.bidders
      .filter((bidder) => bidder.verdict)
      .map((bidder) => ({
        bidderId: bidder.bidderId,
        bidderName: bidder.bidderName,
        overallVerdict: bidder.verdict?.overall_verdict,
        overallConfidence: bidder.verdict?.overall_confidence,
        overallReasoning: bidder.verdict?.overall_reasoning,
        disqualifyingCriteria: bidder.verdict?.disqualifying_criteria ?? [],
        reviewCriteria: bidder.verdict?.review_criteria ?? [],
        redFlagCount: bidder.evidence?.red_flags.length ?? 0,
        recommendation: bidder.verdict?.recommendation
      }));
    const consistencyAnalysis = analyzeConsistency(bundle);
    await sessionService.syncCrossBidderReviewItems(sessionId, consistencyAnalysis.inconsistencies);
    const reviewQueue = await sessionService.getReviewQueue(sessionId);
    const criterionMatrix =
      bundle.tender?.criteria.map((criterion) => ({
        criterionId: criterion.id,
        description: criterion.description,
        bidders: bundle.bidders
          .filter((bidder) => bidder.verdict)
          .map((bidder) => ({
            bidderId: bidder.bidderId,
            bidderName: bidder.bidderName,
            verdict:
              bidder.verdict?.criteria_verdicts.find((item) => item.criterion_id === criterion.id)?.verdict ??
              'NEEDS_REVIEW'
        }))
      })) ?? [];

    res.json({
      sessionId,
      sourceMode: bundle.meta.sourceMode ?? 'active_case',
      summary: {
        eligible: bidders.filter((item) => item.overallVerdict === 'ELIGIBLE').length,
        notEligible: bidders.filter((item) => item.overallVerdict === 'NOT_ELIGIBLE').length,
        needsReview: bidders.filter((item) => item.overallVerdict === 'NEEDS_REVIEW').length,
        totalBidders: bidders.length
      },
      bidders,
      consistencyAnalysis,
      criterionMatrix,
      manualReviewQueueSummary: reviewQueue
        .filter((item) => item.status === 'open' || item.status === 'escalated')
        .map((item) => ({
          reviewItemId: item.reviewItemId,
          bidderId: item.bidderId,
          criterionId: item.criterionId,
          issueType: item.issueType,
          issueSummary: item.issueSummary,
          requestedAction: item.requestedAction,
          status: item.status
        }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:sessionId/bidder/:bidderId', async (req, res, next) => {
  try {
    const sessionId = asSingleParam(req.params.sessionId);
    const bidderId = asSingleParam(req.params.bidderId);
    const evidence = await sessionService.getBidderEvidence(sessionId, bidderId);
    const verdict = await sessionService.getBidderVerdict(sessionId, bidderId);
    const meta = await sessionService.getMeta(sessionId);
    const tender = await sessionService.getTender(sessionId);
    if (!evidence || !verdict || !meta || !tender) {
      throw new AppError(404, 'BIDDER_NOT_FOUND', 'Bidder result not found.');
    }

    const bidderMeta = meta.bidders.find((item) => item.bidderId === bidderId);
    if (!bidderMeta) {
      throw new AppError(404, 'BIDDER_NOT_FOUND', 'Bidder not found in session.');
    }

    res.json({
      bidderId,
      bidderName: bidderMeta.bidderName,
      sourceMode: meta.sourceMode ?? 'active_case',
      overallVerdict: verdict.overall_verdict,
      criteriaVerdicts: verdict.criteria_verdicts.map((item) => {
        const source = evidence.criteria_evidence.find((evidenceItem) => evidenceItem.criterion_id === item.criterion_id);
        const criterion = tender.criteria.find((criterionItem) => criterionItem.id === item.criterion_id);
        return {
          criterionId: item.criterion_id,
          criterionDescription: item.criterion_description,
          threshold: criterion?.threshold ?? null,
          verdict: item.verdict,
          reasoning: item.reasoning,
          evidenceSummary: item.evidence_summary,
          confidence: item.confidence,
          extractedValue: source?.extracted_value ?? null,
          structuredValue: source?.structured_value ?? null,
          verificationSource: criterion?.verification_source ?? null,
          sourceDocumentId: source?.source_document_id ?? null,
          sourceDocument: source?.source_document ?? null,
          sourcePage: source?.source_page ?? null,
          sourceQuote: source?.source_quote ?? null,
          evidenceType: source?.evidence_type ?? null,
          reviewerAction: item.reviewer_action
        };
      }),
      redFlags: evidence.red_flags,
      missingDocuments: evidence.missing_documents,
      parserNotes: evidence.parser_notes
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:sessionId/bidder/:bidderId/simulate',
  validateBody(
    z.object({
      criterionId: z.string().min(1),
      extractedValue: z.string().min(1),
      found: z.union([z.boolean(), z.literal('partial')]),
      confidence: z.number().min(0).max(1),
      confidenceReason: z.string().min(3)
    })
  ),
  async (req, res, next) => {
    try {
      const sessionId = asSingleParam(req.params.sessionId);
      const bidderId = asSingleParam(req.params.bidderId);
      const evidence = await sessionService.getBidderEvidence(sessionId, bidderId);
      const tender = await sessionService.getTender(sessionId);
      const meta = await sessionService.getMeta(sessionId);
      if (!evidence || !tender || !meta) {
        throw new AppError(404, 'BIDDER_NOT_FOUND', 'Bidder evidence not found for simulation.');
      }

      const bidderMeta = meta.bidders.find((item) => item.bidderId === bidderId);
      if (!bidderMeta) {
        throw new AppError(404, 'BIDDER_NOT_FOUND', 'Bidder not found in session.');
      }

      const simulatedEvidence = EvidenceSchema.parse({
        ...evidence,
        criteria_evidence: evidence.criteria_evidence.map((item) =>
          item.criterion_id === req.body.criterionId
            ? {
                ...item,
                found: req.body.found,
                extracted_value: req.body.extractedValue,
                confidence: req.body.confidence,
                confidence_reason: req.body.confidenceReason,
                source_document: item.source_document ?? 'Officer override simulation',
                source_quote: item.source_quote ?? req.body.extractedValue,
                evidence_type: 'manual_override',
                structured_value: normalizeEvidenceStructuredValue(
                  tender.criteria.find((criterion) => criterion.id === req.body.criterionId) ?? tender.criteria[0],
                  { extracted_value: req.body.extractedValue }
                )
              }
            : item
        )
      });

      const simulatedVerdict = decisionService.decideHeuristically(tender, simulatedEvidence);
      const criterionVerdict = simulatedVerdict.criteria_verdicts.find(
        (item) => item.criterion_id === req.body.criterionId
      );

      res.json({
        bidderId,
        bidderName: bidderMeta.bidderName,
        simulatedOverallVerdict: simulatedVerdict.overall_verdict,
        simulatedOverallConfidence: simulatedVerdict.overall_confidence,
        simulatedOverallReasoning: simulatedVerdict.overall_reasoning,
        simulatedCriterionVerdict: criterionVerdict ?? null,
        recommendation: simulatedVerdict.recommendation
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/:sessionId/bidder/:bidderId/override',
  validateBody(
    z.object({
      criterionId: z.string().min(1),
      newValue: z.string().min(1),
      confidence: z.number().min(0).max(1).default(0.95),
      confidenceReason: z.string().min(3),
      reviewerName: z.string().min(2),
      reviewerDesignation: z.string().min(2),
      reason: z.string().min(3)
    })
  ),
  async (req, res, next) => {
    try {
      const sessionId = asSingleParam(req.params.sessionId);
      const bidderId = asSingleParam(req.params.bidderId);
      const evidence = await sessionService.getBidderEvidence(sessionId, bidderId);
      const tender = await sessionService.getTender(sessionId);
      const meta = await sessionService.getMeta(sessionId);
      if (!evidence || !tender || !meta) {
        throw new AppError(404, 'BIDDER_NOT_FOUND', 'Bidder evidence not found for override.');
      }

      const bidderMeta = meta.bidders.find((item) => item.bidderId === bidderId);
      if (!bidderMeta) {
        throw new AppError(404, 'BIDDER_NOT_FOUND', 'Bidder not found in session.');
      }

      const updatedEvidence = EvidenceSchema.parse({
        ...evidence,
        criteria_evidence: evidence.criteria_evidence.map((item) =>
          item.criterion_id === req.body.criterionId
            ? {
                ...item,
                found: true,
                extracted_value: req.body.newValue,
                confidence: req.body.confidence,
                confidence_reason: req.body.confidenceReason,
                source_document: item.source_document ?? 'Manual officer override',
                source_quote: item.source_quote ?? req.body.newValue,
                evidence_type: 'manual_override',
                structured_value: normalizeEvidenceStructuredValue(
                  tender.criteria.find((criterion) => criterion.id === req.body.criterionId) ?? tender.criteria[0],
                  { extracted_value: req.body.newValue }
                )
              }
            : item
        )
      });

      const oldValue =
        evidence.criteria_evidence.find((item) => item.criterion_id === req.body.criterionId)?.extracted_value ?? null;
      const updatedVerdict = decisionService.decideHeuristically(tender, updatedEvidence as Evidence);

      await sessionService.saveBidderResults(sessionId, bidderId, {
        evidenceJson: updatedEvidence,
        verdictJson: updatedVerdict
      });
      await sessionService.syncBidderReviewQueue(sessionId, bidderId, tender, updatedEvidence, updatedVerdict);

      const overrideEntry = {
        timestamp: new Date().toISOString(),
        action: 'MANUAL_OVERRIDE',
        reviewerName: req.body.reviewerName,
        reviewerDesignation: req.body.reviewerDesignation,
        bidderId,
        criterionId: req.body.criterionId,
        oldValue,
        newValue: req.body.newValue,
        reason: req.body.reason
      } as const;
      await sessionService.appendOverrideLog(sessionId, overrideEntry);
      await sessionService.recordManualOverrideReviewItem(
        sessionId,
        overrideEntry,
        `${req.body.reviewerName} (${req.body.reviewerDesignation}) overrode the extracted value.`
      );

      res.json({
        updated: true,
        bidderId,
        bidderName: bidderMeta.bidderName,
        overallVerdict: updatedVerdict.overall_verdict,
        overallConfidence: updatedVerdict.overall_confidence,
        overallReasoning: updatedVerdict.overall_reasoning
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/:sessionId/finalize-audit', async (req, res, next) => {
  try {
    const sessionId = asSingleParam(req.params.sessionId);
    const bundle = await sessionService.getBundle(sessionId);
    if (!bundle) {
      throw new AppError(404, 'SESSION_NOT_FOUND', 'Evaluation session not found.');
    }

    const sealed = auditService.generate(bundle);
    await sessionService.saveAudit(sessionId, sealed.report);
    res.json(sealed.report);
  } catch (error) {
    next(error);
  }
});

export default router;
