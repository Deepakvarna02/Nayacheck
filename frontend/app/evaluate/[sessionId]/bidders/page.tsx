'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EvidencePanel } from '../../../../components/EvidencePanel';
import { SectionHeader } from '../../../../components/SectionHeader';
import { SessionTopNav } from '../../../../components/SessionTopNav';
import { Button } from '../../../../components/Button';

type ResultsResponse = {
  bidders: Array<{
    bidderId: string;
    bidderName: string;
    overallVerdict: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NEEDS_REVIEW';
    overallConfidence: number;
    recommendation: string;
    redFlagCount: number;
  }>;
};

type BidderDetail = {
  bidderId: string;
  bidderName: string;
  overallVerdict: string;
  criteriaVerdicts: Array<{
    criterionId: string;
    criterionDescription: string;
    threshold: string | null;
    verdict: string;
    reasoning: string;
    evidenceSummary: string;
    confidence: number;
    extractedValue: string | null;
    structuredValue: {
      raw?: string | null;
      numericMin?: number | null;
      countMin?: number | null;
      requiredStatus?: string | null;
      validityDate?: string | null;
    } | null;
    verificationSource: string | null;
    sourceDocumentId: string | null;
    sourceDocument: string | null;
    sourcePage: number | null;
    sourceQuote: string | null;
    evidenceType: string | null;
    reviewerAction: string | null;
  }>;
  redFlags: Array<{ flag: string; detail: string }>;
  missingDocuments: string[];
  parserNotes: string;
};

type SimulationResponse = {
  bidderId: string;
  bidderName: string;
  simulatedOverallVerdict: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NEEDS_REVIEW';
  simulatedOverallConfidence: number;
  simulatedOverallReasoning: string;
  simulatedCriterionVerdict: {
    criterion_id: string;
    criterion_description: string;
    verdict: 'PASS' | 'FAIL' | 'NEEDS_REVIEW';
    reasoning: string;
    evidence_summary: string;
    confidence: number;
    reviewer_action: string | null;
  } | null;
  recommendation: string;
};

export default function BidderDetailPage({ params }: { params: { sessionId: string } }) {
  const searchParams = useSearchParams();
  const [bidders, setBidders] = useState<ResultsResponse['bidders']>([]);
  const [selectedBidderId, setSelectedBidderId] = useState<string | null>(searchParams.get('bidderId'));
  const [detail, setDetail] = useState<BidderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideCriterionId, setOverrideCriterionId] = useState('');
  const [overrideValue, setOverrideValue] = useState('');
  const [overrideConfidence, setOverrideConfidence] = useState('0.8');
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);

  useEffect(() => {
    const loadResults = async () => {
      try {
        const response = await fetch(`/api/proxy/evaluate/${params.sessionId}/results`, { cache: 'no-store' });
        const payload = (await response.json()) as ResultsResponse;
        setBidders(payload.bidders);
        if (!selectedBidderId && payload.bidders[0]) {
          setSelectedBidderId(payload.bidders[0].bidderId);
        }
      } catch (_error) {
        setError('Failed to load bidder list.');
      }
    };

    void loadResults();
  }, [params.sessionId, selectedBidderId]);

  useEffect(() => {
    if (!selectedBidderId) {
      return;
    }

    const loadDetail = async () => {
      try {
        setError(null);
        const response = await fetch(`/api/proxy/evaluate/${params.sessionId}/bidder/${selectedBidderId}`, { cache: 'no-store' });
        const payload = (await response.json()) as BidderDetail & { message?: string; error?: string };
        if (!response.ok) {
          throw new Error(payload.message ?? payload.error ?? 'Failed to load bidder detail.');
        }

        setDetail(payload);
        setSimulation(null);
        if (!overrideCriterionId && payload.criteriaVerdicts[0]) {
          setOverrideCriterionId(payload.criteriaVerdicts[0].criterionId);
        }
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load bidder detail.');
      }
    };

    void loadDetail();
  }, [params.sessionId, selectedBidderId]);

  const runSimulation = async () => {
    if (!selectedBidderId || !overrideCriterionId || !overrideValue.trim()) {
      setError('Choose a criterion and provide a simulated extracted value.');
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/proxy/evaluate/${params.sessionId}/bidder/${selectedBidderId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criterionId: overrideCriterionId,
          extractedValue: overrideValue.trim(),
          found: true,
          confidence: Number(overrideConfidence),
          confidenceReason: 'Officer what-if override simulation'
        })
      });
      const payload = (await response.json()) as SimulationResponse & { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? 'Simulation failed.');
      }

      setSimulation(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Simulation failed.');
    }
  };

  const applyOverride = async () => {
    if (!selectedBidderId || !overrideCriterionId || !overrideValue.trim()) {
      setError('Choose a criterion and provide the override value before saving.');
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/proxy/evaluate/${params.sessionId}/bidder/${selectedBidderId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criterionId: overrideCriterionId,
          newValue: overrideValue.trim(),
          confidence: Number(overrideConfidence),
          confidenceReason: 'Manually overridden by officer',
          reviewerName: 'Officer',
          reviewerDesignation: 'Procurement Reviewer',
          reason: 'Officer manually edited extracted value'
        })
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? 'Override failed.');
      }

      if (selectedBidderId) {
        const detailResponse = await fetch(`/api/proxy/evaluate/${params.sessionId}/bidder/${selectedBidderId}`, {
          cache: 'no-store'
        });
        const refreshed = (await detailResponse.json()) as BidderDetail;
        setDetail(refreshed);
      }
      setSimulation(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Override failed.');
    }
  };

  return (
    <main className="pb-16 pt-8">
      <div className="shell page-stack">
        <SessionTopNav sessionId={params.sessionId} current="bidders" />
        <SectionHeader
          kicker="Criterion-Level Evidence"
          title="Bidder Deep Dive"
          description="Every verdict cites evidence, confidence, and reviewer action items. This is the explainability layer judges inspect for procurement sign-off."
        />

        {error ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="space-y-3">
            {bidders.map((bidder) => (
              <button
                key={bidder.bidderId}
                onClick={() => setSelectedBidderId(bidder.bidderId)}
                className={`panel block w-full rounded-[24px] p-5 text-left ${
                  selectedBidderId === bidder.bidderId ? 'ring-2 ring-amber-300' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{bidder.bidderName}</div>
                    <div className="mt-1 text-xs text-slate-500">{Math.round(bidder.overallConfidence * 100)}% confidence</div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{bidder.overallVerdict}</span>
                </div>
                <div className="mt-3 text-sm text-slate-600">{bidder.recommendation}</div>
              </button>
            ))}
          </div>

          <div>
            {detail ? (
              <>
                <div className="panel mb-5 rounded-[24px] p-5">
                  <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Overall Verdict</div>
                  <div className="mt-2 text-2xl font-semibold">{detail.bidderName}</div>
                  <div className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
                    {detail.overallVerdict.replace('_', ' ')}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{detail.parserNotes}</p>
                  {detail.missingDocuments.length > 0 ? (
                    <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
                      Missing documents: {detail.missingDocuments.join(', ')}
                    </div>
                  ) : null}
                  {detail.redFlags.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {detail.redFlags.map((flag) => (
                        <div key={flag.flag} className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
                          <strong>{flag.flag}</strong>: {flag.detail}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="panel mb-5 rounded-[24px] p-5">
                  <div className="text-sm uppercase tracking-[0.22em] text-slate-500">What-If Override</div>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    Simulation is non-persistent. Apply override writes an audit-logged manual change and recomputes the
                    bidder verdict.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <select
                      value={overrideCriterionId}
                      onChange={(event) => setOverrideCriterionId(event.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    >
                      {detail.criteriaVerdicts.map((criterion) => (
                        <option key={criterion.criterionId} value={criterion.criterionId}>
                          {criterion.criterionId}
                        </option>
                      ))}
                    </select>
                    <input
                      value={overrideValue}
                      onChange={(event) => setOverrideValue(event.target.value)}
                      placeholder="Simulated extracted value"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    />
                    <input
                      value={overrideConfidence}
                      onChange={(event) => setOverrideConfidence(event.target.value)}
                      placeholder="Confidence"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    />
                  </div>
                  <Button
                    onClick={runSimulation}
                    className="mt-4"
                    variant="secondary"
                  >
                    Simulate verdict
                  </Button>
                  <Button
                    onClick={applyOverride}
                    className="ml-3 mt-4"
                  >
                    Apply override
                  </Button>
                  {simulation ? (
                    <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                      <div className="font-semibold">
                        Simulated overall verdict: {simulation.simulatedOverallVerdict} ({Math.round(simulation.simulatedOverallConfidence * 100)}%)
                      </div>
                      <div className="mt-2">{simulation.simulatedOverallReasoning}</div>
                      {simulation.simulatedCriterionVerdict ? (
                        <div className="mt-3 rounded-2xl bg-white/80 p-3">
                          <div className="font-semibold">
                            {simulation.simulatedCriterionVerdict.criterion_id}: {simulation.simulatedCriterionVerdict.verdict}
                          </div>
                          <div className="mt-1 text-slate-700">{simulation.simulatedCriterionVerdict.reasoning}</div>
                          <div className="mt-1 text-slate-600">{simulation.simulatedCriterionVerdict.evidence_summary}</div>
                          {simulation.simulatedCriterionVerdict.reviewer_action ? (
                            <div className="mt-2 text-xs text-amber-800">
                              Reviewer action: {simulation.simulatedCriterionVerdict.reviewer_action}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <EvidencePanel items={detail.criteriaVerdicts} />
              </>
            ) : (
              <div className="panel rounded-[24px] p-6 text-sm text-slate-600">Select a bidder to inspect the evidence chain.</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
