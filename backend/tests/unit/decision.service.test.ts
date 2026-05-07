import { decisionService } from '../../src/services/ai/decision.service';
import type { Evidence } from '../../src/validators/evidence.schema';
import type { TenderCriteria } from '../../src/validators/tender.schema';

describe('decision.service heuristic fallback', () => {
  const criteria: TenderCriteria = {
    tender_title: 'CRPF Civil Works',
    tender_reference: 'REF-123',
    issuing_authority: 'CRPF',
    extraction_confidence: 0.95,
    notes: 'Test fixture',
    criteria: [
      {
        id: 'C001',
        category: 'financial',
        type: 'mandatory',
        description: 'Minimum annual turnover of Rs 5 crore',
        threshold: 'Rs 5 crore',
        verification_source: 'CA-certified balance sheet',
        ambiguity_flag: false,
        ambiguity_reason: null
      }
    ]
  };

  it('returns eligible when evidence is strong and no red flags exist', () => {
    const evidence: Evidence = {
      bidder_name: 'ABC Infra',
      document_quality: 'good',
      criteria_evidence: [
        {
          criterion_id: 'C001',
          found: true,
          extracted_value: 'Rs 7.2 crore turnover FY2024',
          source_document: 'CA-certified P&L statement',
          source_quote: 'Total turnover FY2024 Rs. 7,20,00,000',
          confidence: 0.96,
          confidence_reason: 'Clearly stated in audited statement'
        }
      ],
      missing_documents: [],
      red_flags: [],
      parser_notes: 'All key documents present'
    };

    const verdict = decisionService.decideHeuristically(criteria, evidence);
    expect(verdict.overall_verdict).toBe('ELIGIBLE');
    expect(verdict.criteria_verdicts[0]?.verdict).toBe('PASS');
  });

  it('returns needs review when confidence is low', () => {
    const evidence: Evidence = {
      bidder_name: 'XYZ Builders',
      document_quality: 'poor',
      criteria_evidence: [
        {
          criterion_id: 'C001',
          found: 'partial',
          extracted_value: 'Possible turnover figure',
          source_document: 'Scanned certificate',
          source_quote: 'Turn... 5,0..',
          confidence: 0.42,
          confidence_reason: 'OCR artifacts in scan'
        }
      ],
      missing_documents: ['CA-certified balance sheet'],
      red_flags: [],
      parser_notes: 'Scan quality poor'
    };

    const verdict = decisionService.decideHeuristically(criteria, evidence);
    expect(verdict.overall_verdict).toBe('NEEDS_REVIEW');
    expect(verdict.criteria_verdicts[0]?.verdict).toBe('NEEDS_REVIEW');
  });
});
