import { z } from 'zod';

export const NormalizedThresholdTypeSchema = z.enum([
  'currency_min',
  'count_min',
  'boolean_required',
  'registration_required',
  'certificate_required',
  'date_validity',
  'experience_window',
  'free_text'
]);

export const NormalizedValueSchema = z
  .object({
    raw: z.string().nullable().optional(),
    numericMin: z.number().nullable().optional(),
    countMin: z.number().nullable().optional(),
    booleanRequired: z.boolean().nullable().optional(),
    requiredStatus: z.string().nullable().optional(),
    validityDate: z.string().nullable().optional(),
    lookbackYears: z.number().nullable().optional()
  })
  .partial();

export const TenderCriterionSchema = z.object({
  id: z.string(),
  category: z.enum(['financial', 'technical', 'compliance', 'documentation', 'certification']),
  type: z.enum(['mandatory', 'optional']),
  description: z.string().min(5),
  threshold: z.string().min(1),
  verification_source: z.string().min(3),
  ambiguity_flag: z.boolean(),
  ambiguity_reason: z.string().nullable(),
  source_quote: z.string().max(500).nullable().optional(),
  source_page: z.number().int().positive().nullable().optional(),
  normalised_threshold_type: NormalizedThresholdTypeSchema.optional(),
  normalised_threshold_value: NormalizedValueSchema.nullable().optional(),
  manual_review_heavy: z.boolean().optional()
});

export const TenderSchema = z.object({
  tender_title: z.string(),
  tender_reference: z.string().nullable(),
  issuing_authority: z.string(),
  criteria: z.array(TenderCriterionSchema),
  extraction_confidence: z.number().min(0).max(1),
  notes: z.string()
});

export type TenderCriteria = z.infer<typeof TenderSchema>;
export type NormalizedThresholdType = z.infer<typeof NormalizedThresholdTypeSchema>;
export type NormalizedValue = z.infer<typeof NormalizedValueSchema>;
