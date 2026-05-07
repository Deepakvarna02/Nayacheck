import type { Evidence } from '../../validators/evidence.schema';
import type { TenderCriteria } from '../../validators/tender.schema';
import type { Verdict } from '../../validators/verdict.schema';
import type { AuditTrail } from '../../validators/audit.schema';
import type { DocumentManifest, DocumentQuality } from '../document/document.types';

export interface SessionMeta {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'processing' | 'complete' | 'partial' | 'error';
  sourceMode?: 'active_case' | 'practice_case';
  tenderUploaded: boolean;
  approvedBy: string | null;
  evaluationJobId: string | null;
  bidders: Array<{
    bidderId: string;
    bidderName: string;
    files: string[];
    status: 'uploaded' | 'queued' | 'processing' | 'complete' | 'failed';
    documentQuality: DocumentQuality | null;
    qualityReason: string | null;
    error: string | null;
  }>;
  processingLog: Array<{
    step: string;
    status: 'success' | 'warning' | 'error';
    detail: string;
    timestamp: string;
  }>;
}

export interface StoredBidderResult {
  evidenceJson: Evidence;
  verdictJson: Verdict;
}

export interface ReviewResolution {
  criterionId: string;
  resolution: 'PASS' | 'FAIL' | 'ESCALATE';
  reviewerName: string;
  reviewerDesignation: string;
  notes: string;
  timestamp: string;
}

export interface OverrideLogEntry {
  timestamp: string;
  action: 'MANUAL_OVERRIDE';
  reviewerName: string;
  reviewerDesignation: string;
  bidderId: string;
  criterionId: string;
  oldValue: string | null;
  newValue: string;
  reason: string;
}

export interface ReviewQueueItem {
  reviewItemId: string;
  bidderId: string | null;
  criterionId: string;
  issueType:
    | 'ocr_uncertain'
    | 'missing_document'
    | 'ambiguous_threshold'
    | 'name_mismatch'
    | 'cross_bidder_inconsistency'
    | 'manual_override';
  issueSummary: string;
  requestedAction: string;
  status: 'open' | 'resolved' | 'escalated';
  createdAt: string;
  resolvedAt?: string | null;
  reviewerName?: string | null;
  reviewerDesignation?: string | null;
  resolutionNotes?: string | null;
}

export interface SessionBundle {
  meta: SessionMeta;
  tender: TenderCriteria | null;
  tenderManifest: DocumentManifest[] | null;
  bidders: Array<{
    bidderId: string;
    bidderName: string;
    evidence: Evidence | null;
    verdict: Verdict | null;
    documentManifest: DocumentManifest[] | null;
  }>;
  audit: AuditTrail | null;
  overrideLog: OverrideLogEntry[];
  reviewQueue: ReviewQueueItem[];
}
