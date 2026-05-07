import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.middleware';
import { AppError } from '../middleware/error.middleware';
import { sessionService } from '../services/session/session.service';
import { auditService } from '../services/ai/audit.service';
import { hashObject } from '../services/integrity/hash.service';
import { asSingleParam } from '../utils/http';
import { analyzeConsistency } from '../services/ai/consistency.service';

const router = Router();

router.get('/:sessionId', async (req, res, next) => {
  try {
    const sessionId = asSingleParam(req.params.sessionId);
    const bundle = await sessionService.getBundle(sessionId);
    if (!bundle) {
      throw new AppError(404, 'SESSION_NOT_FOUND', 'Report session not found.');
    }

    const existing = await sessionService.getAudit(sessionId);
    const report = existing ?? auditService.generate(bundle).report;
    const consistencyAnalysis = analyzeConsistency(bundle);
    const unresolvedReviewItems = bundle.reviewQueue.filter(
      (item) => item.status === 'open' || item.status === 'escalated'
    );
    if (!existing) {
      await sessionService.saveAudit(sessionId, report);
    }

    res.json({
      sourceMode: bundle.meta.sourceMode ?? 'active_case',
      auditId: report.audit_id,
      generatedAt: report.generated_at,
      tenderReference: report.tender_reference,
      integrityHash: report.integrityHash,
      evaluationSummary: {
        totalBidders: report.evaluation_summary.total_bidders_evaluated,
        eligible: report.evaluation_summary.eligible,
        notEligible: report.evaluation_summary.not_eligible,
        needsReview: report.evaluation_summary.needs_review,
        silentDisqualifications: report.evaluation_summary.silent_disqualifications
      },
      processingLog: report.processing_log,
      integrityStatement: report.integrity_statement,
      consistencyScore: consistencyAnalysis.score,
      consistencyIssues: consistencyAnalysis.inconsistencies,
      consistencyAnalysis,
      overrideLog: bundle.overrideLog,
      unresolvedReviewItems,
      reviewerChecklist: report.reviewer_checklist,
      signOffFields: {
        reviewedBy: report.sign_off_fields.reviewed_by,
        designation: report.sign_off_fields.designation,
        reviewDate: report.sign_off_fields.review_date,
        signatureHash: report.sign_off_fields.signature_hash
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:sessionId/sign',
  validateBody(
    z.object({
      officerName: z.string().min(2),
      designation: z.string().min(2),
      employeeId: z.string().min(2)
    })
  ),
  async (req, res, next) => {
    try {
      const sessionId = asSingleParam(req.params.sessionId);
      const report = await sessionService.getAudit(sessionId);
      if (!report) {
        throw new AppError(404, 'REPORT_NOT_FOUND', 'Generate the report before signing it.');
      }

      const signedAt = new Date().toISOString();
      const signatureHash = hashObject({
        officerName: req.body.officerName,
        designation: req.body.designation,
        employeeId: req.body.employeeId,
        auditId: report.audit_id,
        signedAt
      });

      report.sign_off_fields = {
        reviewed_by: req.body.officerName,
        designation: req.body.designation,
        review_date: signedAt,
        signature_hash: signatureHash
      };
      report.integrityHash = hashObject({
        ...report,
        integrityHash: undefined
      });

      await sessionService.saveAudit(sessionId, report);

      res.json({
        signed: true,
        signatureHash,
        signedAt,
        reportFinalised: true
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
