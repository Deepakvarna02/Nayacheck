import { callClaude, parseJsonResponse } from './claude.client';
import { EvidenceSchema, type Evidence } from '../../validators/evidence.schema';
import { EVIDENCE_SYSTEM_PROMPT } from './prompts';
import type { TenderCriteria } from '../../validators/tender.schema';
import type { DocumentManifest } from '../document/document.types';
import {
  detectDocumentStatus,
  normalizeEvidenceStructuredValue,
  parseCountValue,
  parseCurrencyValue,
  parseIsoDate
} from './procurement-normalization';

type EvidenceItem = Evidence['criteria_evidence'][number];

const GSTIN_REGEX = /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]\b/i;
const ISO_REGEX = /\bISO\s*[- ]?(9001|14001|45001|27001)\b/i;
const STOP_WORDS = new Set([
  'minimum',
  'annual',
  'valid',
  'must',
  'shall',
  'with',
  'from',
  'under',
  'have',
  'been',
  'within',
  'latest',
  'financial',
  'registration',
  'certificate'
]);

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function collectKeywords(criterion: TenderCriteria['criteria'][number]): string[] {
  const combined = `${criterion.description} ${criterion.threshold} ${criterion.verification_source}`.toLowerCase();
  return Array.from(
    new Set(
      combined
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    )
  );
}

function bestPageForCriterion(
  manifests: DocumentManifest[],
  criterion: TenderCriteria['criteria'][number]
): {
  manifest: DocumentManifest | null;
  pageNumber: number | null;
  pageText: string;
  ocrConfidence: number | null;
} {
  const keywords = collectKeywords(criterion);
  let best: {
    manifest: DocumentManifest | null;
    pageNumber: number | null;
    pageText: string;
    ocrConfidence: number | null;
    score: number;
  } = {
    manifest: null,
    pageNumber: null,
    pageText: '',
    ocrConfidence: null,
    score: -1
  };

  for (const manifest of manifests) {
    for (const page of manifest.pages) {
      const lowered = page.extractedText.toLowerCase();
      const score = keywords.reduce((sum, keyword) => sum + (lowered.includes(keyword) ? 1 : 0), 0);
      if (score > best.score || (score === best.score && page.extractedText.length > best.pageText.length)) {
        best = {
          manifest,
          pageNumber: page.pageNumber,
          pageText: page.extractedText,
          ocrConfidence: page.ocrConfidence ?? null,
          score
        };
      }
    }
  }

  return {
    manifest: best.manifest,
    pageNumber: best.pageNumber,
    pageText: best.pageText,
    ocrConfidence: best.ocrConfidence
  };
}

function buildExcerpt(pageText: string, keywordHint: string, maxLength = 280): string | null {
  const escaped = keywordHint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = pageText.match(new RegExp(`([^\\n]{0,120}${escaped}[^\\n]{0,120})`, 'i'));
  if (match?.[1]) {
    return compact(match[1]).slice(0, maxLength);
  }

  const trimmed = compact(pageText).slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : null;
}

function determineDetectedValue(
  criterion: TenderCriteria['criteria'][number],
  pageText: string
): { extractedValue: string | null; structuredValue: EvidenceItem['structured_value'] } {
  const type = criterion.normalised_threshold_type ?? 'free_text';
  const lowered = pageText.toLowerCase();

  if (type === 'currency_min') {
    const amount = parseCurrencyValue(pageText);
    if (amount !== null) {
      return {
        extractedValue: `Detected turnover value approximately Rs ${amount.toLocaleString('en-IN')}`,
        structuredValue: { raw: pageText.slice(0, 120), numericMin: amount }
      };
    }
  }

  if (type === 'count_min' || type === 'experience_window') {
    const countMatch = pageText.match(/\b(\d+)\s+(?:similar\s+)?(?:projects?|works?)\b/i);
    const count = countMatch ? Number(countMatch[1]) : parseCountValue(pageText);
    if (count !== null) {
      return {
        extractedValue:
          type === 'experience_window'
            ? `${count} similar projects referenced in bidder documents`
            : `${count} qualifying projects referenced in bidder documents`,
        structuredValue: {
          raw: countMatch?.[0] ?? pageText.slice(0, 120),
          countMin: count,
          lookbackYears: type === 'experience_window' ? criterion.normalised_threshold_value?.lookbackYears ?? null : undefined
        }
      };
    }
  }

  if (type === 'registration_required') {
    const gstin = pageText.match(GSTIN_REGEX)?.[0] ?? detectDocumentStatus(pageText, criterion);
    if (gstin) {
      return {
        extractedValue: gstin,
        structuredValue: { raw: gstin, booleanRequired: true, requiredStatus: 'active' }
      };
    }
  }

  if (type === 'certificate_required') {
    const iso = pageText.match(ISO_REGEX)?.[0] ?? detectDocumentStatus(pageText, criterion);
    if (iso) {
      return {
        extractedValue: iso,
        structuredValue: { raw: iso, booleanRequired: true, requiredStatus: 'valid' }
      };
    }
  }

  if (type === 'date_validity') {
    const isoDate = parseIsoDate(pageText);
    if (isoDate) {
      return {
        extractedValue: isoDate,
        structuredValue: { raw: isoDate, validityDate: isoDate }
      };
    }
  }

  if (type === 'boolean_required') {
    if (lowered.includes('declaration') || lowered.includes('undertaking') || lowered.includes('not blacklisted')) {
      return {
        extractedValue: 'Required declaration text found',
        structuredValue: { raw: pageText.slice(0, 120), booleanRequired: true }
      };
    }
  }

  return {
    extractedValue: null,
    structuredValue: null
  };
}

function inferEvidenceType(
  hasMatch: boolean,
  structuredValue: EvidenceItem['structured_value'],
  ocrConfidence: number | null
): EvidenceItem['evidence_type'] {
  if (!hasMatch) {
    return 'missing';
  }
  if (ocrConfidence !== null && ocrConfidence < 0.65) {
    return 'ocr_uncertain';
  }
  if (structuredValue && (structuredValue.numericMin || structuredValue.countMin || structuredValue.requiredStatus || structuredValue.validityDate)) {
    return 'exact';
  }
  return 'partial';
}

function inferConfidence(evidenceType: EvidenceItem['evidence_type'], manifest: DocumentManifest | null): number {
  if (!manifest) {
    return 0.48;
  }

  if (evidenceType === 'missing') {
    return manifest.documentQuality === 'good' || manifest.documentQuality === 'partial' ? 0.82 : 0.62;
  }
  if (evidenceType === 'ocr_uncertain') {
    return 0.44;
  }
  if (evidenceType === 'exact') {
    return manifest.parseMode === 'digital_pdf' || manifest.parseMode === 'docx_text' ? 0.92 : 0.74;
  }
  return 0.64;
}

function inferConfidenceReason(
  evidenceType: EvidenceItem['evidence_type'],
  manifest: DocumentManifest | null,
  ocrConfidence: number | null
): string {
  if (!manifest) {
    return 'No relevant document page could be matched to this criterion.';
  }
  if (evidenceType === 'missing') {
    return 'No convincing supporting text was found across the uploaded bidder documents.';
  }
  if (evidenceType === 'ocr_uncertain') {
    return `Evidence was found only in OCR-derived text with limited confidence (${Math.round((ocrConfidence ?? 0) * 100)}%).`;
  }
  if (evidenceType === 'exact') {
    return manifest.parseMode === 'digital_pdf' || manifest.parseMode === 'docx_text'
      ? 'The supporting value is clearly stated in machine-readable text.'
      : 'The supporting value is visible, but it came from OCR rather than native digital text.';
  }
  return 'A relevant document page was found, but the supporting value is only partial or implied.';
}

function deterministicEvidenceExtraction(
  criteriaJson: TenderCriteria,
  manifests: DocumentManifest[],
  bidderId: string
): Evidence {
  const mergedText = manifests
    .flatMap((manifest) => manifest.pages.map((page) => page.extractedText))
    .join('\n');
  const bidderNameMatch = mergedText.match(/\b(?:M\/s\.?|Bidder Name|Company Name|Name of Firm)[:\-]?\s*([^\n]+)/i);
  const documentQuality =
    manifests.some((manifest) => manifest.documentQuality === 'scanned_unreadable')
      ? 'scanned_unreadable'
      : manifests.some((manifest) => manifest.documentQuality === 'poor')
        ? 'poor'
        : manifests.some((manifest) => manifest.documentQuality === 'partial')
          ? 'partial'
          : 'good';

  const criteriaEvidence = criteriaJson.criteria.map((criterion) => {
    const matched = bestPageForCriterion(manifests, criterion);
    const hasKeywordMatch = Boolean(matched.manifest && matched.pageText.trim().length > 0);
    const detected = determineDetectedValue(criterion, matched.pageText);
    const evidenceType = inferEvidenceType(hasKeywordMatch, detected.structuredValue, matched.ocrConfidence);
    const confidence = inferConfidence(evidenceType, matched.manifest);
    const found: EvidenceItem['found'] =
      evidenceType === 'missing' ? false : evidenceType === 'partial' || evidenceType === 'ocr_uncertain' ? 'partial' : true;
    const extractedValue = detected.extractedValue ?? (hasKeywordMatch ? 'Relevant supporting text detected' : null);
    const sourceQuote = hasKeywordMatch
      ? buildExcerpt(matched.pageText, criterion.source_quote ?? criterion.threshold ?? criterion.description)
      : null;

    return {
      criterion_id: criterion.id,
      found,
      extracted_value: extractedValue,
      source_document: matched.manifest?.originalName ?? null,
      source_document_id: matched.manifest?.documentId ?? null,
      source_document_name: matched.manifest?.originalName ?? null,
      source_page: matched.pageNumber,
      source_quote: sourceQuote,
      evidence_type: evidenceType,
      structured_value: normalizeEvidenceStructuredValue(criterion, {
        extracted_value: extractedValue,
        structured_value: detected.structuredValue
      }),
      confidence,
      confidence_reason: inferConfidenceReason(evidenceType, matched.manifest, matched.ocrConfidence)
    };
  });

  const missingDocuments = criteriaJson.criteria
    .filter((criterion) => criteriaEvidence.find((item) => item.criterion_id === criterion.id)?.evidence_type === 'missing')
    .map((criterion) => criterion.verification_source);

  const redFlags = [
    ...(documentQuality === 'poor' || documentQuality === 'scanned_unreadable'
      ? [
          {
            flag: 'Low document readability',
            detail: 'One or more uploaded bidder documents required OCR or yielded low-confidence text. Officer review is recommended before any final procurement action.'
          }
        ]
      : [])
  ];

  return EvidenceSchema.parse({
    bidder_name: bidderNameMatch?.[1]?.trim() ?? `Unknown Bidder (${bidderId})`,
    document_quality: documentQuality,
    criteria_evidence: criteriaEvidence,
    missing_documents: missingDocuments,
    red_flags: redFlags,
    parser_notes: manifests.map((manifest) => `${manifest.originalName}: ${manifest.qualityReason}`).join(' ')
  });
}

function mergeAiEvidence(
  heuristic: Evidence,
  aiEvidence: Evidence,
  criteriaJson: TenderCriteria
): Evidence {
  return EvidenceSchema.parse({
    ...heuristic,
    bidder_name: aiEvidence.bidder_name || heuristic.bidder_name,
    document_quality: heuristic.document_quality,
    red_flags: aiEvidence.red_flags.length > 0 ? aiEvidence.red_flags : heuristic.red_flags,
    missing_documents: aiEvidence.missing_documents.length > 0 ? aiEvidence.missing_documents : heuristic.missing_documents,
    parser_notes: `${aiEvidence.parser_notes} ${heuristic.parser_notes}`.trim(),
    criteria_evidence: heuristic.criteria_evidence.map((heuristicItem) => {
      const aiItem = aiEvidence.criteria_evidence.find((item) => item.criterion_id === heuristicItem.criterion_id);
      const criterion = criteriaJson.criteria.find((item) => item.id === heuristicItem.criterion_id);
      if (!aiItem || !criterion) {
        return heuristicItem;
      }

      const extractedValue = aiItem.extracted_value ?? heuristicItem.extracted_value;
      const structuredValue = normalizeEvidenceStructuredValue(criterion, {
        extracted_value: extractedValue,
        structured_value: aiItem.structured_value ?? heuristicItem.structured_value
      });

      return {
        ...heuristicItem,
        found: aiItem.found,
        extracted_value: extractedValue,
        source_document: aiItem.source_document ?? heuristicItem.source_document,
        source_quote: aiItem.source_quote ?? heuristicItem.source_quote,
        confidence: aiItem.confidence,
        confidence_reason: aiItem.confidence_reason,
        source_document_id: heuristicItem.source_document_id ?? aiItem.source_document_id ?? null,
        source_document_name: heuristicItem.source_document_name ?? aiItem.source_document_name ?? heuristicItem.source_document ?? null,
        source_page: heuristicItem.source_page ?? aiItem.source_page ?? null,
        evidence_type:
          aiItem.evidence_type ??
          (aiItem.confidence < 0.5 ? 'ocr_uncertain' : aiItem.found === false ? 'missing' : aiItem.found === true ? 'exact' : 'partial'),
        structured_value: structuredValue
      };
    })
  });
}

export const evidenceService = {
  async extract(params: {
    sessionId: string;
    bidderId: string;
    criteriaJson: TenderCriteria;
    documentManifest: DocumentManifest[];
  }): Promise<Evidence> {
    const heuristic = deterministicEvidenceExtraction(params.criteriaJson, params.documentManifest, params.bidderId);

    try {
      const raw = await callClaude({
        sessionId: params.sessionId,
        callType: 'evidence',
        systemPrompt: EVIDENCE_SYSTEM_PROMPT,
        userMessage: JSON.stringify(
          {
            bidderId: params.bidderId,
            criteria: params.criteriaJson,
            documents: params.documentManifest.map((manifest) => ({
              documentId: manifest.documentId,
              originalName: manifest.originalName,
              parseMode: manifest.parseMode,
              documentQuality: manifest.documentQuality,
              pages: manifest.pages.map((page) => ({
                pageNumber: page.pageNumber,
                extractedText: page.extractedText.slice(0, 2000),
                ocrConfidence: page.ocrConfidence ?? null
              }))
            }))
          },
          null,
          2
        ),
        maxTokens: 5000
      });

      return mergeAiEvidence(heuristic, parseJsonResponse(raw, EvidenceSchema), params.criteriaJson);
    } catch (_error) {
      return heuristic;
    }
  }
};
