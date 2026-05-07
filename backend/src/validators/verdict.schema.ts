import { z } from 'zod';

export const CriterionVerdictSchema = z.object({
  criterion_id: z.string(),
  criterion_description: z.string(),
  verdict: z.enum(['PASS', 'FAIL', 'NEEDS_REVIEW']),
  reasoning: z.string().min(10),
  evidence_summary: z.string(),
  confidence: z.number().min(0).max(1),
  reviewer_action: z.string().nullable()
});

export const VerdictSchema = z.object({
  bidder_name: z.string(),
  overall_verdict: z.enum(['ELIGIBLE', 'NOT_ELIGIBLE', 'NEEDS_REVIEW']),
  overall_confidence: z.number().min(0).max(1),
  overall_reasoning: z.string().min(20),
  criteria_verdicts: z.array(CriterionVerdictSchema),
  disqualifying_criteria: z.array(z.string()),
  review_criteria: z.array(z.string()),
  red_flag_summary: z.string().nullable(),
  recommendation: z.string()
});

export type Verdict = z.infer<typeof VerdictSchema>;
