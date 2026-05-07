import type { SessionBundle } from '../session/session.types';
import type { TenderCriteria } from '../../validators/tender.schema';
import { parseCurrencyValue } from './procurement-normalization';

export interface ConsistencyIssue {
  criterion_id: string;
  description: string;
  issue: string;
  recommendation: string;
}

export interface ConsistencyAnalysis {
  score: number;
  inconsistencies: ConsistencyIssue[];
}

export interface SuggestedThreshold {
  criterionId: string;
  originalText: string;
  suggestedValue: string;
  reasoning: string;
}

function toNumericValue(value: string | null | undefined): number | null {
  return parseCurrencyValue(value) ?? null;
}

export function analyzeConsistency(bundle: SessionBundle): ConsistencyAnalysis {
  if (!bundle.tender) {
    return { score: 1, inconsistencies: [] };
  }

  const inconsistencies: ConsistencyIssue[] = [];
  let comparablePairs = 0;

  for (const criterion of bundle.tender.criteria) {
    const comparable = bundle.bidders
      .map((bidder) => {
        const evidence = bidder.evidence?.criteria_evidence.find((item) => item.criterion_id === criterion.id);
        const verdict = bidder.verdict?.criteria_verdicts.find((item) => item.criterion_id === criterion.id);
        return {
          bidderName: bidder.bidderName,
          numericValue: evidence?.structured_value?.numericMin ?? evidence?.structured_value?.countMin ?? toNumericValue(evidence?.extracted_value),
          verdict: verdict?.verdict ?? null
        };
      })
      .filter((entry) => entry.numericValue !== null && entry.verdict !== null);

    for (let leftIndex = 0; leftIndex < comparable.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < comparable.length; rightIndex += 1) {
        const left = comparable[leftIndex];
        const right = comparable[rightIndex];
        if (left.numericValue === null || right.numericValue === null) {
          continue;
        }

        comparablePairs += 1;
        const maxValue = Math.max(left.numericValue, right.numericValue);
        const deltaRatio = maxValue === 0 ? 0 : Math.abs(left.numericValue - right.numericValue) / maxValue;

        if (deltaRatio <= 0.1 && left.verdict !== right.verdict) {
          inconsistencies.push({
            criterion_id: criterion.id,
            description: criterion.description,
            issue: `${left.bidderName} and ${right.bidderName} show similar evidence values for ${criterion.id} but different verdicts (${left.verdict} vs ${right.verdict}).`,
            recommendation: 'Review both bidders manually to confirm the same rule and threshold were applied consistently.'
          });
        }
      }
    }
  }

  const score =
    comparablePairs === 0 ? 1 : Number(((comparablePairs - inconsistencies.length) / comparablePairs).toFixed(2));

  return { score, inconsistencies };
}

export function suggestThresholds(tender: TenderCriteria | null): SuggestedThreshold[] {
  if (!tender) {
    return [];
  }

  return tender.criteria
    .filter((criterion) => criterion.ambiguity_flag)
    .map((criterion) => {
      const lower = `${criterion.description} ${criterion.threshold}`.toLowerCase();

      if (lower.includes('turnover')) {
        return {
          criterionId: criterion.id,
          originalText: criterion.description,
          suggestedValue: 'Rs 5 crore minimum annual turnover in the latest financial year',
          reasoning: 'Turnover thresholds in CRPF-style works tenders are commonly expressed as a fixed annual minimum.'
        };
      }

      if (lower.includes('similar project') || lower.includes('experience')) {
        return {
          criterionId: criterion.id,
          originalText: criterion.description,
          suggestedValue: 'At least 3 similar projects completed in the last 5 years',
          reasoning: 'Comparable public works tenders usually quantify similar experience by project count and a lookback window.'
        };
      }

      if (lower.includes('solvency')) {
        return {
          criterionId: criterion.id,
          originalText: criterion.description,
          suggestedValue: 'Current bank solvency certificate meeting a defined minimum amount',
          reasoning: 'Solvency checks are stronger when the tender specifies a concrete certificate amount and validity window.'
        };
      }

      return {
        criterionId: criterion.id,
        originalText: criterion.description,
        suggestedValue: criterion.threshold,
        reasoning: 'This criterion needs a quantified threshold before consistent automated evaluation is safe.'
      };
    });
}
