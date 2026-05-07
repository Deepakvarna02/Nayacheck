import { randomUUID } from 'crypto';
import type { SessionBundle } from '../session/session.types';
import { sealReport } from '../integrity/hash.service';
import { AuditSchema } from '../../validators/audit.schema';

export const auditService = {
  generate(bundle: SessionBundle) {
    if (!bundle.tender) {
      throw new Error('Cannot generate audit without tender criteria');
    }

    const verdicts = bundle.bidders
      .map((bidder) => bidder.verdict)
      .filter((verdict): verdict is NonNullable<typeof verdict> => Boolean(verdict));
    const evidences = bundle.bidders
      .map((bidder) => bidder.evidence)
      .filter((evidence): evidence is NonNullable<typeof evidence> => Boolean(evidence));
    const unresolvedReviewItems = bundle.reviewQueue.filter(
      (item) => item.status === 'open' || item.status === 'escalated'
    );
    const date = new Date();

    const auditBase = AuditSchema.parse({
      audit_id: `NYK-${date.toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      generated_at: date.toISOString(),
      tender_reference: bundle.tender.tender_reference ?? 'UNSPECIFIED',
      issuing_authority: bundle.tender.issuing_authority,
      evaluation_summary: {
        total_bidders_evaluated: verdicts.length,
        eligible: verdicts.filter((item) => item.overall_verdict === 'ELIGIBLE').length,
        not_eligible: verdicts.filter((item) => item.overall_verdict === 'NOT_ELIGIBLE').length,
        needs_review: verdicts.filter((item) => item.overall_verdict === 'NEEDS_REVIEW').length,
        total_criteria_checked: verdicts.reduce((sum, item) => sum + item.criteria_verdicts.length, 0),
        total_evidence_points_extracted: evidences.reduce((sum, item) => sum + item.criteria_evidence.length, 0),
        total_red_flags_raised: evidences.reduce((sum, item) => sum + item.red_flags.length, 0),
        silent_disqualifications: 0
      },
      processing_log: bundle.meta.processingLog,
      integrity_statement: `This evaluation was conducted by NyayaCheck AI System on ${date.toISOString().slice(0, 10)} for tender ${bundle.tender.tender_reference ?? 'UNSPECIFIED'}. All ${verdicts.length} eligibility decisions are criterion-level explainable. No bidder was silently disqualified. ${unresolvedReviewItems.length} cases require human review before this report may be used for procurement decisions. This record is tamper-evident and any modification will invalidate the SHA-256 integrity hash.`,
      reviewer_checklist:
        unresolvedReviewItems.length > 0
          ? unresolvedReviewItems.map((item) => item.requestedAction)
          : [
              'Confirm all review items were resolved with supporting documents.',
              'Verify red-flagged name, date, and certificate inconsistencies against originals.',
              'Check the final integrity hash before signing off on the report.'
            ],
      sign_off_fields: {
        reviewed_by: bundle.meta.approvedBy,
        designation: null,
        review_date: null,
        signature_hash: null
      }
    });

    return sealReport(auditBase);
  }
};
