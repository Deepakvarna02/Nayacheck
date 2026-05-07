import { callClaude, parseJsonResponse } from './claude.client';
import { TenderSchema, type TenderCriteria } from '../../validators/tender.schema';
import { CRITERIA_SYSTEM_PROMPT } from './prompts';
import type { DocumentManifest } from '../document/document.types';
import { normalizeTenderCriteria, parseCountValue, parseCurrencyValue, parseLookbackYears } from './procurement-normalization';

function findSourceQuote(tenderText: string, keyword: string): string | null {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sentenceMatch = tenderText.match(new RegExp(`([^\\n.]{0,120}\\b${escaped}\\b[^\\n.]{0,120})`, 'i'));
  return sentenceMatch?.[1]?.trim() ?? null;
}

function deriveTurnoverThreshold(tenderText: string): string {
  const quote = findSourceQuote(tenderText, 'turnover');
  const numeric = parseCurrencyValue(quote ?? tenderText);
  if (numeric) {
    if (numeric % 10000000 === 0) {
      return `Rs ${numeric / 10000000} crore minimum annual turnover`;
    }
    if (numeric % 100000 === 0) {
      return `Rs ${numeric / 100000} lakh minimum annual turnover`;
    }
  }

  return 'Refer tender text for turnover threshold';
}

function deriveProjectThreshold(tenderText: string): string {
  const quote = findSourceQuote(tenderText, 'project') ?? findSourceQuote(tenderText, 'experience');
  const count = parseCountValue(quote ?? tenderText);
  const years = parseLookbackYears(quote ?? tenderText);

  if (count && years) {
    return `${count} similar projects in the last ${years} years`;
  }
  if (count) {
    return `${count} similar projects`;
  }

  return 'Refer tender text for project count and lookback window';
}

function heuristicCriteriaExtraction(tenderText: string, manifests: DocumentManifest[]): TenderCriteria {
  const lines = tenderText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines.find((line) => line.length > 20) ?? 'Untitled Tender';
  const referenceMatch = tenderText.match(/\b(?:NIT|Tender|Reference|Ref\.?)\s*(?:No\.?|number)?[:\-]?\s*([A-Z0-9\/\-_]+)/i);
  const authorityMatch = tenderText.match(/\b(?:issued by|authority|department)[:\-]?\s*([^\n]+)/i);
  const keywordRules = [
    {
      key: 'turnover',
      criterion: {
        id: 'C001',
        category: 'financial' as const,
        type: 'mandatory' as const,
        description: 'Minimum annual turnover requirement identified in tender text',
        threshold: deriveTurnoverThreshold(tenderText),
        verification_source: 'CA-certified audited balance sheet',
        ambiguity_flag: true,
        ambiguity_reason: 'Heuristic extraction used because Claude output was unavailable, so the exact turnover threshold should be verified manually.',
        source_quote: findSourceQuote(tenderText, 'turnover')
      }
    },
    {
      key: 'similar project',
      criterion: {
        id: 'C002',
        category: 'technical' as const,
        type: 'mandatory' as const,
        description: 'Similar project experience requirement identified in tender text',
        threshold: deriveProjectThreshold(tenderText),
        verification_source: 'Work completion certificates',
        ambiguity_flag: true,
        ambiguity_reason: 'Heuristic extraction used because Claude output was unavailable, so the number of projects and lookback period should be verified manually.',
        source_quote: findSourceQuote(tenderText, 'similar project')
      }
    },
    {
      key: 'gst',
      criterion: {
        id: 'C003',
        category: 'compliance' as const,
        type: 'mandatory' as const,
        description: 'Valid GST registration required',
        threshold: 'Valid GST registration',
        verification_source: 'GST registration certificate',
        ambiguity_flag: false,
        ambiguity_reason: null,
        source_quote: findSourceQuote(tenderText, 'gst')
      }
    },
    {
      key: 'iso',
      criterion: {
        id: 'C004',
        category: 'certification' as const,
        type: 'optional' as const,
        description: 'ISO certification referenced in tender text',
        threshold: 'Valid ISO certificate',
        verification_source: 'ISO certificate',
        ambiguity_flag: true,
        ambiguity_reason: 'Heuristic extraction used because Claude output was unavailable, so the exact ISO standard and validity requirement should be verified manually.',
        source_quote: findSourceQuote(tenderText, 'iso')
      }
    },
    {
      key: 'blacklist',
      criterion: {
        id: 'C005',
        category: 'documentation' as const,
        type: 'mandatory' as const,
        description: 'No-blacklisting declaration required',
        threshold: 'Signed declaration',
        verification_source: 'Undertaking on bidder letterhead',
        ambiguity_flag: false,
        ambiguity_reason: null,
        source_quote: findSourceQuote(tenderText, 'blacklist')
      }
    }
  ];

  const criteria = keywordRules
    .filter((rule) => tenderText.toLowerCase().includes(rule.key))
    .map((rule) => rule.criterion);

  const normalized = TenderSchema.parse({
    tender_title: title,
    tender_reference: referenceMatch?.[1] ?? null,
    issuing_authority: authorityMatch?.[1]?.trim() ?? 'Unknown Issuing Authority',
    criteria,
    extraction_confidence: criteria.length > 0 ? 0.55 : 0.2,
    notes:
      criteria.length > 0
        ? 'Fallback heuristic extraction was used. Officer review is strongly recommended before evaluation.'
        : 'No criteria could be extracted heuristically. Manual review required.'
  });

  return normalizeTenderCriteria(normalized, manifests);
}

export const criteriaService = {
  async extract(params: {
    sessionId: string;
    tenderText: string;
    tenderManifest: DocumentManifest[];
  }): Promise<TenderCriteria> {
    try {
      const raw = await callClaude({
        sessionId: params.sessionId,
        callType: 'criteria',
        systemPrompt: CRITERIA_SYSTEM_PROMPT,
        userMessage: params.tenderText
      });

      return normalizeTenderCriteria(parseJsonResponse(raw, TenderSchema), params.tenderManifest);
    } catch (_error) {
      return heuristicCriteriaExtraction(params.tenderText, params.tenderManifest);
    }
  }
};
