'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BidderCard } from '../../../components/BidderCard';
import { ConsistencyHeatmap } from '../../../components/ConsistencyHeatmap';
import { EligibilityChart } from '../../../components/EligibilityChart';
import { ReviewQueue } from '../../../components/ReviewQueue';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { SectionHeader } from '../../../components/SectionHeader';
import { SessionTopNav } from '../../../components/SessionTopNav';
import { Button } from '../../../components/Button';

type ResultsResponse = {
  sourceMode: 'active_case' | 'practice_case';
  sessionId: string;
  summary: {
    eligible: number;
    notEligible: number;
    needsReview: number;
    totalBidders: number;
  };
  bidders: Array<{
    bidderId: string;
    bidderName: string;
    overallVerdict: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NEEDS_REVIEW';
    overallConfidence: number;
    overallReasoning: string;
    disqualifyingCriteria: string[];
    reviewCriteria: string[];
    redFlagCount: number;
    recommendation: string;
  }>;
  consistencyAnalysis: {
    score: number;
    inconsistencies: Array<{
      criterion_id: string;
      description: string;
      issue: string;
      recommendation: string;
    }>;
  };
  criterionMatrix: Array<{
    criterionId: string;
    description: string;
    bidders: Array<{
      bidderId: string;
      bidderName: string;
      verdict: 'PASS' | 'FAIL' | 'NEEDS_REVIEW';
    }>;
  }>;
  manualReviewQueueSummary: Array<{
    reviewItemId: string;
    bidderId: string | null;
    criterionId: string;
    issueType: string;
    issueSummary: string;
    requestedAction: string;
    status: string;
  }>;
};

export default function EvaluationDashboard({ params }: { params: { sessionId: string } }) {
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/proxy/evaluate/${params.sessionId}/results`, { cache: 'no-store' });
        const payload = (await response.json()) as ResultsResponse & { message?: string; error?: string };
        if (!response.ok) {
          throw new Error(payload.message ?? payload.error ?? 'Failed to load results.');
        }

        setData(payload);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load results.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [params.sessionId]);

  const reviewItems = useMemo(() => data?.manualReviewQueueSummary ?? [], [data]);
  const caseLabel = data?.sourceMode === 'practice_case' ? 'Sample Case' : 'Active Case';

  return (
    <main className="pb-16 pt-8">
      {loading && <LoadingSpinner fullScreen message="Loading evaluation results..." />}
      <div className="shell page-stack">
        <SessionTopNav sessionId={params.sessionId} current="dashboard" />
        <SectionHeader
          kicker="CRPF Tender Evaluation"
          title={`Session ${params.sessionId}`}
          badge={
            data
              ? {
                  label: caseLabel,
                  tone: data.sourceMode === 'practice_case' ? 'warning' : 'success'
                }
              : undefined
          }
          description="Review extracted criteria, inspect bidder evidence, and keep ambiguous cases in human review before any final procurement decision is signed off."
          actions={
            <>
              <Link href={`/evaluate/${params.sessionId}/criteria`}>
                <Button variant="secondary">Officer Checkpoint</Button>
              </Link>
              <Link href={`/evaluate/${params.sessionId}/report`}>
                <Button>Audit Report</Button>
              </Link>
            </>
          }
        />

        {loading ? <div className="mt-8 rounded-[28px] border border-slate-200 bg-white/70 p-6 text-sm text-slate-600">Loading evaluation results...</div> : null}
        {error ? <div className="mt-8 rounded-[28px] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error}</div> : null}

        {data ? (
          <>
            <section className="mt-8 panel rounded-[28px] p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Evaluation Consistency Check</div>
                  <div className="mt-2 text-3xl font-semibold">{Math.round(data.consistencyAnalysis.score * 100)}%</div>
                </div>
                <div className="max-w-2xl text-sm leading-7 text-slate-600">
                  NyayaCheck compares similar bidder evidence across the session and flags places where similar evidence
                  produced different verdicts, which is exactly the kind of inconsistency that needs officer attention.
                </div>
              </div>
              {data.consistencyAnalysis.inconsistencies.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {data.consistencyAnalysis.inconsistencies.map((item) => (
                    <div key={`${item.criterion_id}-${item.issue}`} className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                      <strong>{item.criterion_id}</strong>: {item.issue} {item.recommendation}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                  No material cross-bidder inconsistencies were detected in the current session.
                </div>
              )}
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-6 md:grid-cols-3">
                <div className="panel rounded-[28px] p-6">
                  <div className="text-sm text-slate-500">Clearly Eligible</div>
                  <div className="mt-3 text-4xl font-semibold">{data.summary.eligible}</div>
                </div>
                <div className="panel rounded-[28px] p-6">
                  <div className="text-sm text-slate-500">Clearly Not Eligible</div>
                  <div className="mt-3 text-4xl font-semibold">{data.summary.notEligible}</div>
                </div>
                <div className="panel rounded-[28px] p-6">
                  <div className="text-sm text-slate-500">Needs Human Review</div>
                  <div className="mt-3 text-4xl font-semibold">{data.summary.needsReview}</div>
                </div>
                <div className="md:col-span-3">
                  <ReviewQueue items={reviewItems} />
                </div>
              </div>
              <EligibilityChart
                eligible={data.summary.eligible}
                notEligible={data.summary.notEligible}
                needsReview={data.summary.needsReview}
              />
            </section>

            <section className="mt-8">
              <ConsistencyHeatmap matrix={data.criterionMatrix} />
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-3">
              {data.bidders.map((bidder) => (
                <Link key={bidder.bidderId} href={`/evaluate/${params.sessionId}/bidders?bidderId=${bidder.bidderId}`}>
                  <BidderCard
                    bidderName={bidder.bidderName}
                    overallVerdict={bidder.overallVerdict}
                    overallConfidence={bidder.overallConfidence}
                    recommendation={bidder.recommendation}
                    redFlagCount={bidder.redFlagCount}
                  />
                </Link>
              ))}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
