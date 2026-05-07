import { CONFIDENCE_THRESHOLDS } from '../../config/constants';
import type { Evidence } from '../../validators/evidence.schema';
import type { TenderCriteria } from '../../validators/tender.schema';
import { VerdictSchema, type Verdict } from '../../validators/verdict.schema';

function asDisplayValue(value: string | null | undefined): string {
  return value?.trim() ? value : 'no decisive value found';
}

function compareDates(left: string | null | undefined, right: string | null | undefined): number | null {
  if (!left || !right) {
    return null;
  }
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return null;
  }
  return leftDate.getTime() - rightDate.getTime();
}

function yearsWithinWindow(
  text: string | null | undefined,
  minCount: number | null | undefined,
  lookbackYears: number | null | undefined
): boolean | null {
  if (!text || !lookbackYears) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const cutoffYear = currentYear - lookbackYears;
  const years = Array.from(text.matchAll(/\b(20\d{2}|19\d{2})\b/g)).map((match) => Number(match[1]));
  if (years.length === 0) {
    return null;
  }

  const withinWindow = years.filter((year) => year >= cutoffYear).length;
  if (typeof minCount === 'number' && minCount > 0) {
    return withinWindow >= minCount;
  }
  return withinWindow > 0;
}

function evaluateCriterion(
  criterion: TenderCriteria['criteria'][number],
  evidenceItem: Evidence['criteria_evidence'][number] | undefined,
  documentQuality: Evidence['document_quality']
): Verdict['criteria_verdicts'][number] {
  const evidenceType = evidenceItem?.evidence_type ?? (evidenceItem?.found === false ? 'missing' : 'partial');
  const structuredValue = evidenceItem?.structured_value ?? null;
  const thresholdType = criterion.normalised_threshold_type ?? 'free_text';
  const thresholdValue = criterion.normalised_threshold_value ?? {};
  const extractedValue = evidenceItem?.extracted_value ?? null;
  const sourceDocument = evidenceItem?.source_document_name ?? evidenceItem?.source_document ?? 'bidder documents';
  const sourcePage = evidenceItem?.source_page ? ` page ${evidenceItem.source_page}` : '';
  const sourceSummary = `${sourceDocument}${sourcePage}`;
  const onlyWeakOcr = evidenceType === 'ocr_uncertain' || documentQuality === 'scanned_unreadable';
  const confidence = evidenceItem?.confidence ?? 0.35;
  const thresholdText = criterion.threshold;

  let verdict: 'PASS' | 'FAIL' | 'NEEDS_REVIEW' = 'NEEDS_REVIEW';
  let reviewerAction: string | null =
    `Review ${criterion.verification_source} for criterion ${criterion.id} and verify the value against the tender threshold.`;
  let reasonCore = `Required ${criterion.description} with threshold "${thresholdText}".`;

  if (!evidenceItem || evidenceType === 'missing' || evidenceItem.found === false) {
    if (
      criterion.type === 'mandatory' &&
      confidence >= CONFIDENCE_THRESHOLDS.fail &&
      !onlyWeakOcr &&
      ['registration_required', 'certificate_required', 'boolean_required'].includes(thresholdType)
    ) {
      verdict = 'FAIL';
      reviewerAction = null;
      reasonCore += ` No reliable evidence was found in ${sourceSummary}.`;
    } else {
      verdict = 'NEEDS_REVIEW';
      reasonCore += ` No decisive evidence was found in ${sourceSummary}.`;
    }
  } else if (onlyWeakOcr || confidence < CONFIDENCE_THRESHOLDS.eligible) {
    verdict = 'NEEDS_REVIEW';
    reasonCore += ` Evidence was found in ${sourceSummary}, but it relies on low-confidence OCR or partial extraction.`;
  } else {
    switch (thresholdType) {
      case 'currency_min': {
        const actual = structuredValue?.numericMin ?? null;
        const expected = thresholdValue.numericMin ?? null;
        if (actual !== null && expected !== null) {
          verdict = actual >= expected ? 'PASS' : confidence >= CONFIDENCE_THRESHOLDS.fail ? 'FAIL' : 'NEEDS_REVIEW';
          reviewerAction = verdict === 'NEEDS_REVIEW' ? reviewerAction : null;
          reasonCore += ` Found approximately Rs ${actual.toLocaleString('en-IN')} in ${sourceSummary}; threshold is Rs ${expected.toLocaleString('en-IN')}.`;
          break;
        }
        verdict = 'NEEDS_REVIEW';
        reasonCore += ` A turnover-like value was referenced, but it could not be normalized safely.`;
        break;
      }
      case 'count_min': {
        const actual = structuredValue?.countMin ?? null;
        const expected = thresholdValue.countMin ?? null;
        if (actual !== null && expected !== null) {
          verdict = actual >= expected ? 'PASS' : confidence >= CONFIDENCE_THRESHOLDS.fail ? 'FAIL' : 'NEEDS_REVIEW';
          reviewerAction = verdict === 'NEEDS_REVIEW' ? reviewerAction : null;
          reasonCore += ` Found ${actual} in ${sourceSummary}; threshold is ${expected}.`;
          break;
        }
        verdict = 'NEEDS_REVIEW';
        reasonCore += ` Relevant project-count evidence was found, but it was not machine-comparable.`;
        break;
      }
      case 'experience_window': {
        const actualCount = structuredValue?.countMin ?? null;
        const expectedCount = thresholdValue.countMin ?? null;
        const withinWindow = yearsWithinWindow(
          `${extractedValue ?? ''} ${evidenceItem?.source_quote ?? ''}`,
          expectedCount,
          thresholdValue.lookbackYears ?? null
        );
        if (actualCount !== null && expectedCount !== null && withinWindow !== null) {
          verdict =
            actualCount >= expectedCount && withinWindow
              ? 'PASS'
              : confidence >= CONFIDENCE_THRESHOLDS.fail
                ? 'FAIL'
                : 'NEEDS_REVIEW';
          reviewerAction = verdict === 'NEEDS_REVIEW' ? reviewerAction : null;
          reasonCore += ` Found ${actualCount} project references in ${sourceSummary}; threshold is ${expectedCount} within ${thresholdValue.lookbackYears ?? 'the required'} years.`;
          break;
        }
        verdict = 'NEEDS_REVIEW';
        reviewerAction = `Request project completion certificates showing both project count and completion dates within the tender window for criterion ${criterion.id}.`;
        reasonCore += ` Project evidence was found, but the time-window compliance could not be validated automatically.`;
        break;
      }
      case 'registration_required':
      case 'certificate_required': {
        const status = structuredValue?.requiredStatus?.toLowerCase() ?? structuredValue?.raw?.toLowerCase() ?? '';
        if (status.includes('active') || status.includes('valid') || evidenceItem.found === true) {
          verdict = 'PASS';
          reviewerAction = null;
          reasonCore += ` Found status "${structuredValue?.requiredStatus ?? extractedValue ?? 'valid'}" in ${sourceSummary}.`;
        } else {
          verdict = confidence >= CONFIDENCE_THRESHOLDS.fail ? 'FAIL' : 'NEEDS_REVIEW';
          reviewerAction = verdict === 'NEEDS_REVIEW' ? reviewerAction : null;
          reasonCore += ` A registration/certificate reference was found, but valid status could not be confirmed in ${sourceSummary}.`;
        }
        break;
      }
      case 'date_validity': {
        const actualDate = structuredValue?.validityDate ?? null;
        const expectedDate = thresholdValue.validityDate ?? null;
        if (actualDate) {
          const comparison = expectedDate ? compareDates(actualDate, expectedDate) : 1;
          verdict = comparison === null ? 'NEEDS_REVIEW' : comparison >= 0 ? 'PASS' : 'FAIL';
          reviewerAction = verdict === 'NEEDS_REVIEW' ? reviewerAction : null;
          reasonCore += ` Found validity date ${actualDate} in ${sourceSummary}.`;
        } else {
          verdict = 'NEEDS_REVIEW';
          reasonCore += ` No machine-readable validity date could be confirmed in ${sourceSummary}.`;
        }
        break;
      }
      case 'boolean_required': {
        if (structuredValue?.booleanRequired || evidenceItem.found === true) {
          verdict = 'PASS';
          reviewerAction = null;
          reasonCore += ` Supporting declaration text was found in ${sourceSummary}.`;
        } else {
          verdict = confidence >= CONFIDENCE_THRESHOLDS.fail ? 'FAIL' : 'NEEDS_REVIEW';
          reviewerAction = verdict === 'NEEDS_REVIEW' ? reviewerAction : null;
          reasonCore += ` Required declaration text could not be confirmed in ${sourceSummary}.`;
        }
        break;
      }
      default: {
        verdict = confidence >= CONFIDENCE_THRESHOLDS.eligible && evidenceItem.found === true ? 'PASS' : 'NEEDS_REVIEW';
        reviewerAction = verdict === 'PASS' ? null : reviewerAction;
        reasonCore += ` Found "${asDisplayValue(extractedValue)}" in ${sourceSummary}.`;
        break;
      }
    }
  }

  return {
    criterion_id: criterion.id,
    criterion_description: criterion.description,
    verdict,
    reasoning: reasonCore,
    evidence_summary: `Threshold: ${thresholdText}. Value found: ${asDisplayValue(extractedValue)}. Source: ${sourceSummary}.`,
    confidence,
    reviewer_action: verdict === 'NEEDS_REVIEW' ? reviewerAction : null
  };
}

function deterministicDecision(criteriaJson: TenderCriteria, evidenceJson: Evidence): Verdict {
  const criteriaVerdicts = criteriaJson.criteria.map((criterion) =>
    evaluateCriterion(
      criterion,
      evidenceJson.criteria_evidence.find((item) => item.criterion_id === criterion.id),
      evidenceJson.document_quality
    )
  );

  const disqualifyingCriteria = criteriaVerdicts
    .filter((item) => item.verdict === 'FAIL')
    .map((item) => item.criterion_id);
  const reviewCriteria = criteriaVerdicts
    .filter((item) => item.verdict === 'NEEDS_REVIEW')
    .map((item) => item.criterion_id);
  const hasRedFlags = evidenceJson.red_flags.length > 0;

  const mandatoryFailures = criteriaVerdicts.some((item) => {
    const criterion = criteriaJson.criteria.find((entry) => entry.id === item.criterion_id);
    return criterion?.type === 'mandatory' && item.verdict === 'FAIL' && item.confidence >= CONFIDENCE_THRESHOLDS.fail;
  });

  const mandatoryReview = criteriaVerdicts.some((item) => {
    const criterion = criteriaJson.criteria.find((entry) => entry.id === item.criterion_id);
    return criterion?.type === 'mandatory' && item.verdict === 'NEEDS_REVIEW';
  });

  let overallVerdict: Verdict['overall_verdict'] = 'NEEDS_REVIEW';
  if (
    !hasRedFlags &&
    !mandatoryFailures &&
    !mandatoryReview &&
    evidenceJson.document_quality !== 'poor' &&
    evidenceJson.document_quality !== 'scanned_unreadable' &&
    criteriaVerdicts.every((item) => item.verdict === 'PASS' && item.confidence >= CONFIDENCE_THRESHOLDS.eligible)
  ) {
    overallVerdict = 'ELIGIBLE';
  } else if (mandatoryFailures) {
    overallVerdict = 'NOT_ELIGIBLE';
  }

  const overallConfidence =
    criteriaVerdicts.reduce((sum, item) => sum + item.confidence, 0) / Math.max(criteriaVerdicts.length, 1);

  return VerdictSchema.parse({
    bidder_name: evidenceJson.bidder_name,
    overall_verdict: overallVerdict,
    overall_confidence: Number(overallConfidence.toFixed(2)),
    overall_reasoning:
      overallVerdict === 'ELIGIBLE'
        ? 'All mandatory criteria were satisfied with high-confidence evidence and no review-blocking flags remain.'
        : overallVerdict === 'NOT_ELIGIBLE'
          ? 'At least one mandatory criterion failed with strong, non-OCR-weak evidence, so the bidder is not eligible.'
          : 'One or more criteria remain ambiguous, low-confidence, OCR-weak, or red-flagged, so human review is required before any procurement action.',
    criteria_verdicts: criteriaVerdicts,
    disqualifying_criteria: disqualifyingCriteria,
    review_criteria: reviewCriteria,
    red_flag_summary: hasRedFlags ? evidenceJson.red_flags.map((flag) => `${flag.flag}: ${flag.detail}`).join(' ') : null,
    recommendation:
      overallVerdict === 'ELIGIBLE'
        ? 'Proceed to officer sign-off with the attached criterion-level evidence record.'
        : overallVerdict === 'NOT_ELIGIBLE'
          ? 'Document the failed mandatory criteria and retain the cited evidence before issuing any disqualification notice.'
          : 'Do not finalize this bidder until the listed review actions are completed and captured in the audit trail.'
  });
}

export const decisionService = {
  async decide(params: {
    sessionId: string;
    bidderId: string;
    criteriaJson: TenderCriteria;
    evidenceJson: Evidence;
  }): Promise<Verdict> {
    return deterministicDecision(params.criteriaJson, params.evidenceJson);
  },

  decideHeuristically: deterministicDecision
};
