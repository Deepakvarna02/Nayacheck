import { z } from 'zod';

export const AuditLogSchema = z.object({
  step: z.string(),
  status: z.enum(['success', 'warning', 'error']),
  detail: z.string(),
  timestamp: z.string()
});

export const AuditSchema = z.object({
  audit_id: z.string(),
  generated_at: z.string(),
  tender_reference: z.string(),
  issuing_authority: z.string(),
  evaluation_summary: z.object({
    total_bidders_evaluated: z.number().int().nonnegative(),
    eligible: z.number().int().nonnegative(),
    not_eligible: z.number().int().nonnegative(),
    needs_review: z.number().int().nonnegative(),
    total_criteria_checked: z.number().int().nonnegative(),
    total_evidence_points_extracted: z.number().int().nonnegative(),
    total_red_flags_raised: z.number().int().nonnegative(),
    silent_disqualifications: z.number().int().nonnegative()
  }),
  processing_log: z.array(AuditLogSchema),
  integrity_statement: z.string(),
  reviewer_checklist: z.array(z.string()),
  sign_off_fields: z.object({
    reviewed_by: z.string().nullable(),
    designation: z.string().nullable(),
    review_date: z.string().nullable(),
    signature_hash: z.string().nullable()
  })
});

export type AuditTrail = z.infer<typeof AuditSchema>;
