import type { DocumentManifest } from '../document/document.types';
import type { Evidence } from '../../validators/evidence.schema';
import type {
  NormalizedThresholdType,
  NormalizedValue,
  TenderCriteria
} from '../../validators/tender.schema';

type TenderCriterion = TenderCriteria['criteria'][number];
type EvidenceItem = Evidence['criteria_evidence'][number];

const CURRENCY_REGEX = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(crore|crores|lakh|lakhs|million|thousand)?/i;
const GSTIN_REGEX = /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]\b/i;
const ISO_REGEX = /\bISO\s*[- ]?(9001|14001|45001|27001)\b/i;
const DATE_REGEX = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/;

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function parseCurrencyValue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const lowered = value.toLowerCase().replace(/rs\.?/g, '').replace(/inr/g, '').replace(/₹/g, '').trim();
  const match = lowered.match(/([\d,]+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  let numeric = Number(match[1].replace(/,/g, ''));
  if (Number.isNaN(numeric)) {
    return null;
  }

  if (lowered.includes('crore')) {
    numeric *= 10000000;
  } else if (lowered.includes('lakh')) {
    numeric *= 100000;
  } else if (lowered.includes('thousand')) {
    numeric *= 1000;
  } else if (lowered.includes('million')) {
    numeric *= 1000000;
  }

  return numeric;
}

export function parseCountValue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\b(\d+)\b/);
  if (!match) {
    return null;
  }

  const numeric = Number(match[1]);
  return Number.isNaN(numeric) ? null : numeric;
}

export function parseLookbackYears(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/(?:last|preceding|past|within)\s+(\d+)\s+years?/i);
  if (!match) {
    return null;
  }

  const numeric = Number(match[1]);
  return Number.isNaN(numeric) ? null : numeric;
}

export function parseIsoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(DATE_REGEX);
  if (!match) {
    return null;
  }

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const rawYear = match[3];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month}-${day}`;
}

export function inferThresholdType(criterion: TenderCriterion): NormalizedThresholdType {
  const combined = `${criterion.description} ${criterion.threshold} ${criterion.verification_source}`.toLowerCase();

  if (combined.includes('turnover') || combined.includes('net worth') || combined.includes('solvency')) {
    return 'currency_min';
  }
  if (combined.includes('project') && (combined.includes('last') || combined.includes('past') || combined.includes('preceding'))) {
    return 'experience_window';
  }
  if (combined.includes('project') || combined.includes('work experience') || combined.includes('experience')) {
    return 'count_min';
  }
  if (combined.includes('gst') || combined.includes('registration')) {
    return 'registration_required';
  }
  if (combined.includes('certificate') || combined.includes('iso') || combined.includes('pf') || combined.includes('esi')) {
    return 'certificate_required';
  }
  if (combined.includes('valid till') || combined.includes('validity') || combined.includes('expiry')) {
    return 'date_validity';
  }
  if (combined.includes('shall have') || combined.includes('must submit') || combined.includes('declaration')) {
    return 'boolean_required';
  }
  return 'free_text';
}

export function normalizeThresholdValue(
  type: NormalizedThresholdType,
  threshold: string,
  description?: string
): NormalizedValue {
  const combined = `${description ?? ''} ${threshold}`.trim();
  const numericMin = parseCurrencyValue(combined);
  const countMin = parseCountValue(combined);
  const lookbackYears = parseLookbackYears(combined);
  const validityDate = parseIsoDate(combined);

  switch (type) {
    case 'currency_min':
      return { raw: threshold, numericMin };
    case 'count_min':
      return { raw: threshold, countMin };
    case 'experience_window':
      return { raw: threshold, countMin, lookbackYears };
    case 'registration_required':
      return { raw: threshold, booleanRequired: true, requiredStatus: 'active' };
    case 'certificate_required':
      return { raw: threshold, booleanRequired: true, requiredStatus: 'valid' };
    case 'date_validity':
      return { raw: threshold, validityDate };
    case 'boolean_required':
      return { raw: threshold, booleanRequired: true };
    default:
      return { raw: threshold };
  }
}

function findPageForText(manifests: DocumentManifest[], keyword: string): { quote: string | null; page: number | null } {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`([^\\n]{0,140}${escaped}[^\\n]{0,140})`, 'i');

  for (const manifest of manifests) {
    for (const page of manifest.pages) {
      const match = page.extractedText.match(matcher);
      if (match?.[1]) {
        return {
          quote: compact(match[1]),
          page: page.pageNumber
        };
      }
    }
  }

  return { quote: null, page: null };
}

export function normalizeTenderCriteria(tender: TenderCriteria, manifests: DocumentManifest[]): TenderCriteria {
  return {
    ...tender,
    criteria: tender.criteria.map((criterion) => {
      const thresholdType = inferThresholdType(criterion);
      const thresholdValue = normalizeThresholdValue(thresholdType, criterion.threshold, criterion.description);
      const sourceKey =
        criterion.source_quote ??
        criterion.threshold ??
        criterion.description.split(/\s+/).slice(0, 6).join(' ');
      const source = findPageForText(manifests, sourceKey);

      return {
        ...criterion,
        source_quote: criterion.source_quote ?? source.quote,
        source_page: criterion.source_page ?? source.page,
        normalised_threshold_type: thresholdType,
        normalised_threshold_value: thresholdValue,
        manual_review_heavy:
          criterion.ambiguity_flag ||
          (thresholdType === 'free_text' && !thresholdValue.numericMin && !thresholdValue.countMin) ||
          false
      };
    })
  };
}

export function normalizeEvidenceStructuredValue(
  criterion: TenderCriterion,
  evidence: Pick<EvidenceItem, 'extracted_value'> & { structured_value?: NormalizedValue | null }
): NormalizedValue {
  if (evidence.structured_value) {
    return evidence.structured_value;
  }

  const type = criterion.normalised_threshold_type ?? inferThresholdType(criterion);
  const extractedValue = evidence.extracted_value ?? '';

  switch (type) {
    case 'currency_min':
      return { raw: extractedValue, numericMin: parseCurrencyValue(extractedValue) };
    case 'count_min':
      return { raw: extractedValue, countMin: parseCountValue(extractedValue) };
    case 'experience_window':
      return {
        raw: extractedValue,
        countMin: parseCountValue(extractedValue),
        lookbackYears: parseLookbackYears(extractedValue)
      };
    case 'registration_required':
      return {
        raw: extractedValue,
        booleanRequired: Boolean(extractedValue),
        requiredStatus: GSTIN_REGEX.test(extractedValue) ? 'active' : extractedValue || null
      };
    case 'certificate_required':
      return {
        raw: extractedValue,
        booleanRequired: Boolean(extractedValue),
        requiredStatus: ISO_REGEX.test(extractedValue) ? 'valid' : extractedValue || null
      };
    case 'date_validity':
      return { raw: extractedValue, validityDate: parseIsoDate(extractedValue) };
    case 'boolean_required':
      return { raw: extractedValue, booleanRequired: Boolean(extractedValue) };
    default:
      return { raw: extractedValue };
  }
}

export function detectDocumentStatus(text: string, criterion: TenderCriterion): string | null {
  const combined = `${criterion.description} ${criterion.threshold} ${criterion.verification_source}`.toLowerCase();
  const lowered = text.toLowerCase();

  if (combined.includes('gst')) {
    const gstMatch = text.match(GSTIN_REGEX);
    return gstMatch ? gstMatch[0] : null;
  }
  if (combined.includes('iso')) {
    const isoMatch = text.match(ISO_REGEX);
    return isoMatch ? isoMatch[0] : null;
  }
  if (combined.includes('valid') && lowered.includes('valid')) {
    return 'valid';
  }
  if (combined.includes('registration') && lowered.includes('registration')) {
    return 'active';
  }

  return null;
}

export function collectManifestExcerpt(manifest: DocumentManifest, pageNumber: number, maxLength = 280): string {
  const page = manifest.pages.find((entry) => entry.pageNumber === pageNumber);
  return compact(page?.extractedText ?? '').slice(0, maxLength);
}
