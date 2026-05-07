import { Router } from 'express';
import { z } from 'zod';
import { uploadMiddleware } from '../middleware/upload.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { AppError } from '../middleware/error.middleware';
import { parserService } from '../services/document/parser.service';
import { criteriaService } from '../services/ai/criteria.service';
import { sessionService } from '../services/session/session.service';
import { asSingleParam } from '../utils/http';
import { logger } from '../utils/logger';
import { suggestThresholds } from '../services/ai/consistency.service';
import { normalizeThresholdValue, inferThresholdType, normalizeTenderCriteria } from '../services/ai/procurement-normalization';

const router = Router();

router.post('/sample', async (_req, res, next) => {
  try {
    const session = await sessionService.createSession('practice_case');
    const sampleManifest = [
      {
        documentId: 'doc_sample_tender',
        ownerType: 'tender' as const,
        ownerId: session.sessionId,
        originalName: 'sample-tender.pdf',
        filePath: 'sample-tender.pdf',
        mimeType: 'application/pdf',
        parseMode: 'digital_pdf' as const,
        pageCount: 2,
        documentQuality: 'good' as const,
        qualityReason: 'Sample tender seeded from trusted demo data.',
        pages: [
          {
            pageNumber: 1,
            extractedText:
              'The bidder should have achieved minimum annual turnover of Rs 5 crore during the latest completed financial year. The bidder must have successfully completed at least three similar works during the preceding five years.'
          },
          {
            pageNumber: 2,
            extractedText:
              'The firm shall possess a valid GST registration certificate as on the bid submission date. Preference will be given to firms holding a valid ISO 9001 quality management certification.'
          }
        ]
      }
    ];
    const tender = normalizeTenderCriteria({
      tender_title: 'CRPF Construction Tender No. 12/2026',
      tender_reference: 'CRPF-CIVIL-12-2026',
      issuing_authority: 'Central Reserve Police Force',
      criteria: [
        {
          id: 'C001',
          category: 'financial' as const,
          type: 'mandatory' as const,
          description: 'Minimum annual turnover of Rs 5 crore in the latest financial year',
          threshold: 'Rs 5 crore minimum',
          verification_source: 'CA-certified audited balance sheet',
          ambiguity_flag: false,
          ambiguity_reason: null,
          source_quote: 'The bidder should have achieved minimum annual turnover of Rs 5 crore during the latest completed financial year.'
        },
        {
          id: 'C002',
          category: 'technical' as const,
          type: 'mandatory' as const,
          description: 'Completion of at least 3 similar projects in the last 5 years',
          threshold: '3 qualifying projects',
          verification_source: 'Project completion certificates',
          ambiguity_flag: false,
          ambiguity_reason: null,
          source_quote: 'The bidder must have successfully completed at least three similar works during the preceding five years.'
        },
        {
          id: 'C003',
          category: 'compliance' as const,
          type: 'mandatory' as const,
          description: 'Valid GST registration at the time of bid submission',
          threshold: 'Valid GSTIN',
          verification_source: 'GST registration certificate',
          ambiguity_flag: false,
          ambiguity_reason: null,
          source_quote: 'The firm shall possess a valid GST registration certificate as on the bid submission date.'
        },
        {
          id: 'C004',
          category: 'certification' as const,
          type: 'optional' as const,
          description: 'Valid ISO 9001 certification for quality management',
          threshold: 'Valid certificate',
          verification_source: 'ISO certificate',
          ambiguity_flag: false,
          ambiguity_reason: null,
          source_quote: 'Preference will be given to firms holding a valid ISO 9001 quality management certification.'
        }
      ],
      extraction_confidence: 0.99,
      notes: 'Sample tender seeded for product demo flow.'
    }, sampleManifest);

    await sessionService.saveTender(session.sessionId, tender);
    await sessionService.saveTenderManifest(session.sessionId, sampleManifest);

    res.json({
      sessionId: session.sessionId,
      sourceMode: session.sourceMode ?? 'practice_case',
      status: 'complete',
      tender: {
        title: tender.tender_title,
        reference: tender.tender_reference,
        issuingAuthority: tender.issuing_authority,
        criteriaCount: tender.criteria.length,
        mandatoryCount: tender.criteria.filter((item) => item.type === 'mandatory').length,
        optionalCount: tender.criteria.filter((item) => item.type === 'optional').length,
        extractionConfidence: tender.extraction_confidence,
        ambiguousCount: tender.criteria.filter((item) => item.ambiguity_flag).length
      },
      processingTime: 0
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upload', uploadMiddleware.single('file'), async (req, res, next) => {
  const startedAt = Date.now();

  try {
    if (!req.file) {
      throw new AppError(400, 'FILE_REQUIRED', 'A tender PDF or Word document is required.');
    }

    logger.info({
      stage: 'tender_upload_received',
      fileName: req.file.originalname,
      fileSizeBytes: req.file.size
    });

    const session = await sessionService.createSession('active_case');
    const parsed = await parserService.extractAll({
      ownerType: 'tender',
      ownerId: session.sessionId,
      filePaths: [req.file.path]
    });

    logger.info({
      sessionId: session.sessionId,
      stage: 'tender_text_extracted',
      documentQuality: parsed.documentQuality,
      extractedTextLength: parsed.text.length
    });

    if (!parsed.text) {
      throw new AppError(
        422,
        'EXTRACTION_FAILED',
        'Could not extract readable text from document. Please ensure the PDF is not password-protected.',
        'Try uploading a higher quality scan or a digital PDF.'
      );
    }

    const tender = await criteriaService.extract({
      sessionId: session.sessionId,
      tenderText: parsed.text,
      tenderManifest: parsed.manifests
    });

    await sessionService.saveTender(session.sessionId, tender);
    await sessionService.saveTenderManifest(session.sessionId, parsed.manifests);

    res.json({
      sessionId: session.sessionId,
      sourceMode: session.sourceMode ?? 'active_case',
      status: 'complete',
      tender: {
        title: tender.tender_title,
        reference: tender.tender_reference,
        issuingAuthority: tender.issuing_authority,
        criteriaCount: tender.criteria.length,
        mandatoryCount: tender.criteria.filter((item) => item.type === 'mandatory').length,
        optionalCount: tender.criteria.filter((item) => item.type === 'optional').length,
        extractionConfidence: tender.extraction_confidence,
        ambiguousCount: tender.criteria.filter((item) => item.ambiguity_flag).length
      },
      processingTime: Date.now() - startedAt
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:sessionId/criteria', async (req, res, next) => {
  try {
    const sessionId = asSingleParam(req.params.sessionId);
    const meta = await sessionService.getMeta(sessionId);
    const tender = await sessionService.getTender(sessionId);
    if (!tender || !meta) {
      throw new AppError(404, 'SESSION_NOT_FOUND', 'Tender session not found.');
    }

    res.json({
      sessionId,
      sourceMode: meta.sourceMode ?? 'active_case',
      tender: {
        title: tender.tender_title,
        reference: tender.tender_reference
      },
      criteria: tender.criteria.map((criterion) => ({
        id: criterion.id,
        category: criterion.category,
        type: criterion.type,
        description: criterion.description,
        threshold: criterion.threshold,
        verificationSource: criterion.verification_source,
        ambiguityFlag: criterion.ambiguity_flag,
        ambiguityReason: criterion.ambiguity_reason,
        sourceQuote: criterion.source_quote ?? null,
        sourcePage: criterion.source_page ?? null,
        normalisedThresholdType: criterion.normalised_threshold_type ?? 'free_text',
        normalisedThresholdValue: criterion.normalised_threshold_value ?? null,
        manualReviewHeavy: criterion.manual_review_heavy ?? false,
        humanEdited: false
      })),
      suggestedThresholds: suggestThresholds(tender),
      uploadedBidders: meta.bidders.map((bidder) => ({
        bidderId: bidder.bidderId,
        bidderName: bidder.bidderName,
        status: bidder.status,
        documentQuality: bidder.documentQuality,
        qualityReason: bidder.qualityReason
      })),
      parseQualitySummary: {
        totalBidders: meta.bidders.length,
        good: meta.bidders.filter((bidder) => bidder.documentQuality === 'good').length,
        partial: meta.bidders.filter((bidder) => bidder.documentQuality === 'partial').length,
        poor: meta.bidders.filter((bidder) => bidder.documentQuality === 'poor').length,
        scannedUnreadable: meta.bidders.filter((bidder) => bidder.documentQuality === 'scanned_unreadable').length
      }
    });
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/:sessionId/criteria/:criterionId',
  validateBody(
    z.object({
      description: z.string().optional(),
      threshold: z.string().optional(),
      type: z.enum(['mandatory', 'optional']).optional(),
      approvedBy: z.string().min(2)
    })
  ),
  async (req, res, next) => {
    try {
      const sessionId = asSingleParam(req.params.sessionId);
      const criterionId = asSingleParam(req.params.criterionId);
      await sessionService.updateCriterion(sessionId, criterionId, req.body);
      const thresholdType = req.body.threshold ? inferThresholdType({
        id: criterionId,
        category: 'documentation',
        type: req.body.type ?? 'mandatory',
        description: req.body.description ?? req.body.threshold,
        threshold: req.body.threshold,
        verification_source: 'Officer updated threshold',
        ambiguity_flag: false,
        ambiguity_reason: null
      }) : null;
      res.json({
        criterionId,
        updated: true,
        humanEdited: true,
        editedAt: new Date().toISOString(),
        editedBy: req.body.approvedBy,
        normalisedThresholdType: thresholdType,
        normalisedThresholdValue: req.body.threshold && thresholdType
          ? normalizeThresholdValue(thresholdType, req.body.threshold, req.body.description)
          : null
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
