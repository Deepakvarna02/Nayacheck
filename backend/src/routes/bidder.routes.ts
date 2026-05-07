import { Router } from 'express';
import { uploadMiddleware } from '../middleware/upload.middleware';
import { sessionService } from '../services/session/session.service';
import { parserService } from '../services/document/parser.service';
import { AppError } from '../middleware/error.middleware';
import { asSingleParam } from '../utils/http';
import { EvidenceSchema } from '../validators/evidence.schema';
import { VerdictSchema } from '../validators/verdict.schema';

const router = Router();

function buildDemoBidder(
  bidderId: string,
  bidderName: string,
  criterionIds: string[],
  outcome: 'eligible' | 'needs_review' | 'not_eligible'
) {
  const primaryCriterion = criterionIds[0] ?? 'C001';
  const secondaryCriterion = criterionIds[1] ?? primaryCriterion;
  const tertiaryCriterion = criterionIds[2] ?? secondaryCriterion;

  if (outcome === 'eligible') {
    const evidence = EvidenceSchema.parse({
      bidder_name: bidderName,
      document_quality: 'good',
      criteria_evidence: criterionIds.map((criterionId, index) => ({
        criterion_id: criterionId,
        found: true,
        extracted_value: index === 0 ? 'Rs 6.8 crore' : index === 1 ? '4 similar projects' : 'Valid certificate',
        source_document: 'demo-bidder-eligible.pdf',
        source_document_id: `${bidderId}_${criterionId}`,
        source_document_name: 'demo-bidder-eligible.pdf',
        source_page: index < 2 ? 1 : 2,
        source_quote:
          index === 0
            ? 'Audited turnover for the latest completed financial year is Rs 6.8 crore.'
            : index === 1
              ? 'Completed four similar works in the previous five years.'
              : 'Valid GST and ISO certificates are attached.',
        evidence_type: 'exact',
        structured_value:
          index === 0
            ? { raw: 'Rs 6.8 crore', numericMin: 68000000 }
            : index === 1
              ? { raw: '4 similar projects', countMin: 4 }
              : { raw: 'valid', requiredStatus: 'valid' },
        confidence: 0.96,
        confidence_reason: 'Clear documentary evidence located in the bidder packet.'
      })),
      missing_documents: [],
      red_flags: [],
      parser_notes: 'Demo bidder seeded for audit walkthrough.'
    });

    const verdict = VerdictSchema.parse({
      bidder_name: bidderName,
      overall_verdict: 'ELIGIBLE',
      overall_confidence: 0.95,
      overall_reasoning:
        'The bidder satisfies each mandatory criterion with direct documentary evidence and no blocking red flags.',
      criteria_verdicts: criterionIds.map((criterionId, index) => ({
        criterion_id: criterionId,
        criterion_description:
          index === 0
            ? 'Minimum turnover requirement met'
            : index === 1
              ? 'Minimum project completion requirement met'
              : 'Compliance certificate requirement met',
        verdict: 'PASS' as const,
        evidence_summary:
          index === 0
            ? 'Audited financials show turnover above threshold.'
            : index === 1
              ? 'Completion certificates confirm qualifying experience.'
              : 'Certificate copies are attached and valid on the bid date.',
        confidence: 0.96,
        reviewer_action: null,
        reasoning:
          index === 0
            ? 'The financial evidence exceeds the threshold and is directly stated in the document.'
            : index === 1
              ? 'The bidder demonstrates more than the required number of similar projects.'
              : 'Compliance documents are present and current.'
      })),
      disqualifying_criteria: [],
      review_criteria: [],
      red_flag_summary: null,
      recommendation: 'Proceed to commercial and technical award checks.'
    });

    return { evidence, verdict };
  }

  if (outcome === 'needs_review') {
    const evidence = EvidenceSchema.parse({
      bidder_name: bidderName,
      document_quality: 'partial',
      criteria_evidence: [
        {
          criterion_id: primaryCriterion,
          found: true,
          extracted_value: 'Rs 5.4 crore',
          source_document: 'demo-bidder-review.pdf',
          source_document_id: `${bidderId}_${primaryCriterion}`,
          source_document_name: 'demo-bidder-review.pdf',
          source_page: 1,
          source_quote: 'The audited statement shows turnover of Rs 5.4 crore for the latest year.',
          evidence_type: 'exact',
          structured_value: { raw: 'Rs 5.4 crore', numericMin: 54000000 },
          confidence: 0.9,
          confidence_reason: 'Readable statement found in the packet.'
        },
        {
          criterion_id: secondaryCriterion,
          found: 'partial',
          extracted_value: '3 projects mentioned but one certificate is missing page 2',
          source_document: 'demo-bidder-review.pdf',
          source_document_id: `${bidderId}_${secondaryCriterion}`,
          source_document_name: 'demo-bidder-review.pdf',
          source_page: 2,
          source_quote: 'Three projects are described, but one completion letter is cut off by scan quality.',
          evidence_type: 'ocr_uncertain',
          structured_value: { raw: '3 projects', countMin: 3 },
          confidence: 0.58,
          confidence_reason: 'OCR captured the key fields, but scan quality is inconsistent.'
        },
        {
          criterion_id: tertiaryCriterion,
          found: true,
          extracted_value: 'Valid GSTIN found, ISO copy unclear',
          source_document: 'demo-bidder-review.pdf',
          source_document_id: `${bidderId}_${tertiaryCriterion}`,
          source_document_name: 'demo-bidder-review.pdf',
          source_page: 3,
          source_quote: 'GST registration is present, but the certificate image is blurry.',
          evidence_type: 'partial',
          structured_value: { raw: 'valid', requiredStatus: 'valid' },
          confidence: 0.67,
          confidence_reason: 'Readability is sufficient for GST but not fully clear for the attached certificate.'
        }
      ],
      missing_documents: ['High-resolution ISO certificate copy'],
      red_flags: [{ flag: 'Scanned attachment', detail: 'One supporting certificate is partially unreadable.' }],
      parser_notes: 'Demo bidder seeded to demonstrate human review routing.'
    });

    const verdict = VerdictSchema.parse({
      bidder_name: bidderName,
      overall_verdict: 'NEEDS_REVIEW',
      overall_confidence: 0.66,
      overall_reasoning:
        'The bidder appears to satisfy the key requirements, but one supporting certificate is partially unreadable and requires officer review.',
      criteria_verdicts: [
        {
          criterion_id: primaryCriterion,
          criterion_description: 'Minimum turnover requirement met',
          verdict: 'PASS',
          evidence_summary: 'Turnover appears above threshold from readable financial text.',
          confidence: 0.9,
          reviewer_action: null,
          reasoning: 'The financial figure is clearly above the threshold and is legible.'
        },
        {
          criterion_id: secondaryCriterion,
          criterion_description: 'Minimum project completion requirement partially evidenced',
          verdict: 'NEEDS_REVIEW',
          evidence_summary: 'Project count is present, but one certificate is incomplete.',
          confidence: 0.58,
          reviewer_action: 'Request a clearer completion certificate or original supporting letter.',
          reasoning: 'The scan shows the right evidence but one page is not fully readable.'
        },
        {
          criterion_id: tertiaryCriterion,
          criterion_description: 'Compliance certificate presence uncertain',
          verdict: 'NEEDS_REVIEW',
          evidence_summary: 'GST appears valid, but the attached certificate is blurry.',
          confidence: 0.67,
          reviewer_action: 'Verify the certificate with the bidder before final sign-off.',
          reasoning: 'The compliance document is present but not clear enough for an automatic pass.'
        }
      ],
      disqualifying_criteria: [],
      review_criteria: [secondaryCriterion, tertiaryCriterion],
      red_flag_summary: 'Partially unreadable scanned supporting documents.',
      recommendation: 'Route to officer review before award recommendation.'
    });

    return { evidence, verdict };
  }

  const evidence = EvidenceSchema.parse({
    bidder_name: bidderName,
    document_quality: 'poor',
    criteria_evidence: [
      {
        criterion_id: primaryCriterion,
        found: true,
        extracted_value: 'Rs 3.1 crore',
        source_document: 'demo-bidder-fail.pdf',
        source_document_id: `${bidderId}_${primaryCriterion}`,
        source_document_name: 'demo-bidder-fail.pdf',
        source_page: 1,
        source_quote: 'The latest audited turnover statement reflects Rs 3.1 crore.',
        evidence_type: 'exact',
        structured_value: { raw: 'Rs 3.1 crore', numericMin: 31000000 },
        confidence: 0.93,
        confidence_reason: 'Clear value, but below the tender threshold.'
      },
      {
        criterion_id: secondaryCriterion,
        found: false,
        extracted_value: null,
        source_document: 'demo-bidder-fail.pdf',
        source_document_id: `${bidderId}_${secondaryCriterion}`,
        source_document_name: 'demo-bidder-fail.pdf',
        source_page: null,
        source_quote: null,
        evidence_type: 'missing',
        structured_value: null,
        confidence: 0.28,
        confidence_reason: 'The supporting certificate is missing from the packet.'
      },
      {
        criterion_id: tertiaryCriterion,
        found: 'partial',
        extracted_value: 'GST reference visible, certificate not legible',
        source_document: 'demo-bidder-fail.pdf',
        source_document_id: `${bidderId}_${tertiaryCriterion}`,
        source_document_name: 'demo-bidder-fail.pdf',
        source_page: 2,
        source_quote: 'The scan only shows a partial GST reference and no readable certificate details.',
        evidence_type: 'ocr_uncertain',
        structured_value: { raw: 'partial' },
        confidence: 0.42,
        confidence_reason: 'OCR is incomplete and cannot be treated as a confirmed pass.'
      }
    ],
    missing_documents: ['Project completion certificates', 'Clear GST certificate copy'],
    red_flags: [
      { flag: 'Below turnover threshold', detail: 'Declared turnover is lower than the required minimum.' },
      { flag: 'Missing documents', detail: 'Supporting certificates are not attached or are unreadable.' }
    ],
    parser_notes: 'Demo bidder seeded to demonstrate disqualification and red-flag handling.'
  });

  const verdict = VerdictSchema.parse({
    bidder_name: bidderName,
    overall_verdict: 'NOT_ELIGIBLE',
    overall_confidence: 0.92,
    overall_reasoning:
      'The bidder fails the mandatory financial threshold and lacks readable supporting documents for the remaining criteria.',
    criteria_verdicts: [
      {
        criterion_id: primaryCriterion,
        criterion_description: 'Minimum turnover requirement not met',
        verdict: 'FAIL',
        evidence_summary: 'Turnover falls below the required minimum.',
        confidence: 0.93,
        reviewer_action: null,
        reasoning: 'The extracted financial figure is lower than the published threshold.'
      },
      {
        criterion_id: secondaryCriterion,
        criterion_description: 'Minimum project completion requirement missing',
        verdict: 'FAIL',
        evidence_summary: 'Completion certificates were not provided.',
        confidence: 0.28,
        reviewer_action: 'Request certificates only if the bidder is eligible for reconsideration.',
        reasoning: 'No documentary proof of the required project count is available.'
      },
      {
        criterion_id: tertiaryCriterion,
        criterion_description: 'Compliance certificate confirmation uncertain',
        verdict: 'NEEDS_REVIEW',
        evidence_summary: 'GST reference is visible but not fully legible.',
        confidence: 0.42,
        reviewer_action: 'Verify compliance documents before proceeding.',
        reasoning: 'The compliance evidence is too weak to justify a pass.'
      }
    ],
    disqualifying_criteria: [primaryCriterion, secondaryCriterion],
    review_criteria: [tertiaryCriterion],
    red_flag_summary: 'Mandatory threshold not met and documentation is incomplete.',
    recommendation: 'Reject on mandatory eligibility grounds.'
  });

  return { evidence, verdict };
}

router.post('/sample/:sessionId', async (req, res, next) => {
  try {
    const sessionId = asSingleParam(req.params.sessionId);
    const meta = await sessionService.getMeta(sessionId);
    const tender = await sessionService.getTender(sessionId);

    if (!meta || !tender) {
      throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.');
    }

    if (meta.bidders.length > 0) {
      res.json({
        sessionId,
        seeded: false,
        message: 'Session already contains bidders. Demo seed skipped.',
        biddersSeeded: meta.bidders.length
      });
      return;
    }

    const criterionIds = tender.criteria.map((criterion) => criterion.id);
    const demoBidders = [
      buildDemoBidder('demo_eligible', 'Delta Infra Pvt Ltd', criterionIds, 'eligible'),
      buildDemoBidder('demo_review', 'Apex Structures & Co', criterionIds, 'needs_review'),
      buildDemoBidder('demo_not_eligible', 'Nova Buildworks', criterionIds, 'not_eligible')
    ];

    for (const bidder of [
      { bidderName: 'Delta Infra Pvt Ltd', data: demoBidders[0] },
      { bidderName: 'Apex Structures & Co', data: demoBidders[1] },
      { bidderName: 'Nova Buildworks', data: demoBidders[2] }
    ]) {
      const { bidderId } = await sessionService.addBidder(sessionId, {
        bidderName: bidder.bidderName,
        files: [`demo/${bidder.data.verdict.bidder_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`],
        documentQuality: bidder.data.evidence.document_quality,
        qualityReason:
          bidder.data.evidence.document_quality === 'good'
            ? 'Demo packet with clear text evidence.'
            : bidder.data.evidence.document_quality === 'partial'
              ? 'Demo packet with mixed scan quality.'
              : 'Demo packet intentionally set to low quality for review testing.'
      });

      await sessionService.saveBidderResults(sessionId, bidderId, {
        evidenceJson: bidder.data.evidence,
        verdictJson: bidder.data.verdict
      });
    }

    const freshMeta = await sessionService.getMeta(sessionId);
    if (!freshMeta) {
      throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found after demo seeding.');
    }

    freshMeta.status = 'complete';
    freshMeta.processingLog.push({
      step: 'Demo bidder seeding',
      status: 'success',
      detail: 'Seeded three synthetic bidder packets for the demo walkthrough.',
      timestamp: new Date().toISOString()
    });
    await sessionService.saveMeta(freshMeta);

    res.json({
      sessionId,
      seeded: true,
      biddersSeeded: 3,
      message: 'Demo bidders created successfully.'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upload/:sessionId', uploadMiddleware.array('files[]'), async (req, res, next) => {
  try {
    const sessionId = asSingleParam(req.params.sessionId);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const session = await sessionService.getMeta(sessionId);
    if (!session) {
      throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.');
    }

    if (files.length === 0) {
      throw new AppError(400, 'FILES_REQUIRED', 'At least one bidder document is required.');
    }

    const bidderName =
      typeof req.body.bidderName === 'string' && req.body.bidderName.trim().length > 0
        ? req.body.bidderName.trim()
        : 'Unknown Bidder';
    const { bidderId } = await sessionService.addBidder(sessionId, {
      bidderName,
      files: files.map((file) => file.path),
      documentQuality: null,
      qualityReason: null
    });
    const parsed = await parserService.extractAll({
      ownerType: 'bidder',
      ownerId: bidderId,
      filePaths: files.map((file) => file.path)
    });
    await sessionService.saveBidderDocumentManifest(sessionId, bidderId, parsed.manifests);
    await sessionService.setBidderStatus(sessionId, bidderId, 'uploaded');
    const meta = await sessionService.getMeta(sessionId);
    if (meta) {
      meta.bidders = meta.bidders.map((item) =>
        item.bidderId === bidderId
          ? {
              ...item,
              documentQuality: parsed.documentQuality,
              qualityReason: parsed.qualityReason
            }
          : item
      );
      await sessionService.saveMeta(meta);
    }

    res.json({
      bidderId,
      sessionId,
      bidderName,
      filesReceived: files.length,
      documentQuality: parsed.documentQuality,
      status: 'queued',
      queuePosition: session.bidders.length + 1
    });
  } catch (error) {
    next(error);
  }
});

export default router;
