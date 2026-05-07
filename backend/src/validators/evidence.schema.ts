import { z } from 'zod';
import { NormalizedValueSchema } from './tender.schema';

export const EvidenceTypeSchema = z.enum([
  'exact',
  'partial',
  'missing',
  'ocr_uncertain',
  'manual_override'
]);

export const EvidenceItemSchema = z.object({
  criterion_id: z.string(),
  found: z.union([z.boolean(), z.literal('partial')]),
  extracted_value: z.string().nullable(),
  source_document: z.string().nullable(),
  source_document_id: z.string().nullable().optional(),
  source_document_name: z.string().nullable().optional(),
  source_page: z.number().int().positive().nullable().optional(),
  source_quote: z.string().max(400).nullable(),
  evidence_type: EvidenceTypeSchema.optional(),
  structured_value: NormalizedValueSchema.nullable().optional(),
  confidence: z.number().min(0).max(1),
  confidence_reason: z.string()
});

export const RedFlagSchema = z.object({
  flag: z.string(),
  detail: z.string()
});

export const EvidenceSchema = z.object({
  bidder_name: z.string(),
  document_quality: z.enum(['good', 'partial', 'poor', 'scanned_unreadable']),
  criteria_evidence: z.array(EvidenceItemSchema),
  missing_documents: z.array(z.string()),
  red_flags: z.array(RedFlagSchema),
  parser_notes: z.string()
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;
