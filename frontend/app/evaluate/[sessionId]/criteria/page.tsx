'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CriteriaTable } from '../../../../components/CriteriaTable';
import { LoadingSpinner } from '../../../../components/LoadingSpinner';
import { useToast } from '../../../../components/Toast';
import { Modal } from '../../../../components/Modal';
import { EmptyState } from '../../../../components/EmptyState';
import { validateFile, getFileErrorMessage } from '../../../../utils/fileValidator';
import { SectionHeader } from '../../../../components/SectionHeader';
import { SessionTopNav } from '../../../../components/SessionTopNav';
import { Button } from '../../../../components/Button';
import { useSessionRealtime } from '../../../../hooks/useSessionRealtime';

type CriteriaResponse = {
  sessionId: string;
  sourceMode: 'active_case' | 'practice_case';
  tender: { title: string; reference: string | null };
  criteria: Array<{
    id: string;
    category: string;
    type: string;
    description: string;
    threshold: string;
    verificationSource: string;
    ambiguityFlag: boolean;
    ambiguityReason: string | null;
    sourceQuote: string | null;
    sourcePage: number | null;
    normalisedThresholdType: string;
    normalisedThresholdValue: Record<string, unknown> | null;
    manualReviewHeavy: boolean;
  }>;
  suggestedThresholds: Array<{
    criterionId: string;
    originalText: string;
    suggestedValue: string;
    reasoning: string;
  }>;
  uploadedBidders: Array<{
    bidderId: string;
    bidderName: string;
    status: string;
    documentQuality: string | null;
    qualityReason: string | null;
  }>;
  parseQualitySummary: {
    totalBidders: number;
    good: number;
    partial: number;
    poor: number;
    scannedUnreadable: number;
  };
};

export default function CriteriaReviewPage({ params }: { params: { sessionId: string } }) {
  const router = useRouter();
  const { addToast } = useToast();
  const [data, setData] = useState<CriteriaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidderName, setBidderName] = useState('');
  const [bidderFiles, setBidderFiles] = useState<FileList | null>(null);
  const [uploadingBidder, setUploadingBidder] = useState(false);
  const [seedingDemoBidders, setSeedingDemoBidders] = useState(false);
  const [approvedBy, setApprovedBy] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [showEvaluateModal, setShowEvaluateModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bidderFileLabel = useMemo(() => {
    if (!bidderFiles || bidderFiles.length === 0) {
      return null;
    }

    return `${bidderFiles.length} file(s) ready for bidder packet upload`;
  }, [bidderFiles]);

  const caseLabel = data?.sourceMode === 'practice_case' ? 'Sample Case' : 'Active Case';

  const loadCriteria = async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`/api/proxy/tender/${params.sessionId}/criteria`, { cache: 'no-store' });
      const payload = (await response.json()) as CriteriaResponse & { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? 'Failed to load criteria.');
      }

      setData(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load criteria.');
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const scheduleCriteriaRefresh = () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      void loadCriteria(true);
    }, 180);
  };

  const realtimeState = useSessionRealtime({
    sessionId: params.sessionId,
    onEvent: (event) => {
      if (event.type !== 'session.snapshot') {
        scheduleCriteriaRefresh();
      }
    }
  });

  useEffect(() => {
    void loadCriteria();
  }, [params.sessionId]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const handleApplySuggestedThreshold = async (criterionId: string, suggestedValue: string) => {
    try {
      const response = await fetch(`/api/proxy/tender/${params.sessionId}/criteria/${criterionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threshold: suggestedValue,
          approvedBy: approvedBy.trim() || 'Officer Name'
        })
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? 'Failed to apply suggested threshold.');
      }

      await loadCriteria();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to apply suggested threshold.');
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;

    // Validate all files
    const files = Array.from(event.target.files);
    for (const file of files) {
      const validation = await validateFile(file);
      if (!validation.valid) {
        const message = getFileErrorMessage(file, validation);
        addToast(validation.error || 'File validation failed', 'error');
        event.target.value = ''; // Clear input
        return;
      }
    }

    setBidderFiles(event.target.files);
  };

  const handleUploadBidder = async () => {
    if (!bidderFiles || bidderFiles.length === 0) {
      const message = 'Choose at least one file for the bidder packet.';
      setError(message);
      addToast(message, 'warning');
      return;
    }

    setUploadingBidder(true);
    setError(null);

    try {
      const formData = new FormData();
      for (const file of Array.from(bidderFiles)) {
        formData.append('files[]', file);
      }

      if (bidderName.trim()) {
        formData.append('bidderName', bidderName.trim());
      }

      const response = await fetch(`/api/proxy/bidder/upload/${params.sessionId}`, {
        method: 'POST',
        body: formData
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? 'Bidder upload failed.');
      }

      setBidderFiles(null);
      setBidderName('');
      addToast(`✓ Uploaded ${bidderFiles.length} file(s) for bidder`, 'success');
      await loadCriteria();
    } catch (caughtError) {
      const errorMsg = caughtError instanceof Error ? caughtError.message : 'Bidder upload failed.';
      setError(errorMsg);
      addToast(errorMsg, 'error');
    } finally {
      setUploadingBidder(false);
    }
  };

  const handleSeedDemoBidders = async () => {
    setSeedingDemoBidders(true);
    setError(null);

    try {
      const response = await fetch(`/api/proxy/bidder/sample/${params.sessionId}`, {
        method: 'POST'
      });
      const payload = (await response.json()) as { message?: string; error?: string; biddersSeeded?: number };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? 'Demo bidder seeding failed.');
      }

      addToast(`✓ Seeded ${payload.biddersSeeded ?? 3} demo bidders`, 'success');
      await loadCriteria();
    } catch (caughtError) {
      const errorMsg = caughtError instanceof Error ? caughtError.message : 'Demo bidder seeding failed.';
      setError(errorMsg);
      addToast(errorMsg, 'error');
    } finally {
      setSeedingDemoBidders(false);
    }
  };

  const handleEvaluate = async () => {
    if (!approvedBy.trim()) {
      addToast('Please enter officer name for sign-off', 'warning');
      return;
    }

    if (data?.uploadedBidders.length === 0) {
      addToast('Upload at least one bidder packet before evaluating', 'warning');
      return;
    }

    // Show confirmation modal
    setShowEvaluateModal(true);
  };

  const confirmEvaluate = async () => {
    setShowEvaluateModal(false);

    setEvaluating(true);
    setError(null);

    try {
      const response = await fetch(`/api/proxy/evaluate/${params.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy: approvedBy.trim() })
      });
      const payload = (await response.json()) as { status?: string; message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? 'Evaluation failed.');
      }

      addToast('✓ Evaluation started. Scoring bidders...', 'info');

      if (payload.status === 'complete') {
        router.push(`/evaluate/${params.sessionId}`);
        return;
      }

      let attempts = 0;
      while (attempts < 30) {
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const statusResponse = await fetch(`/api/proxy/evaluate/${params.sessionId}/status`, { cache: 'no-store' });
        const statusPayload = (await statusResponse.json()) as { status?: string };
        if (statusPayload.status === 'complete' || statusPayload.status === 'partial') {
          addToast('✓ Evaluation complete. Proceeding to results...', 'success');
          router.push(`/evaluate/${params.sessionId}`);
          return;
        }
      }

      router.push(`/evaluate/${params.sessionId}`);
    } catch (caughtError) {
      const errorMsg = caughtError instanceof Error ? caughtError.message : 'Evaluation failed.';
      setError(errorMsg);
      addToast(errorMsg, 'error');
      setEvaluating(false);
    }
  };

  if (loading) {
    return (
      <main className="pb-16 pt-8">
        <div className="shell">
          <div className="panel rounded-[28px] p-6 flex justify-center">
            <LoadingSpinner message="Loading extracted criteria..." />
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="pb-16 pt-8">
        <div className="shell">
          <div role="alert" className="panel rounded-[28px] p-6 text-sm text-rose-700">{error ?? 'No criteria found for this session.'}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-16 pt-8">
      {evaluating && <LoadingSpinner fullScreen message="Evaluating bidders against criteria..." />}
      <div className="shell page-stack">
        <SessionTopNav sessionId={params.sessionId} current="criteria" />
        <SectionHeader
          kicker="Human Checkpoint"
          title="CRPF Criteria Review"
          badge={{
            label: caseLabel,
            tone: data.sourceMode === 'practice_case' ? 'warning' : 'success'
          }}
          description="Review extracted criteria, confirm threshold wording, upload bidder packets, and only then trigger evaluation. Ambiguity stays visible to the officer instead of becoming a silent disqualification."
          actions={
            <Button
              onClick={handleEvaluate}
              loading={evaluating}
              disabled={data.uploadedBidders.length === 0}
              aria-label="Approve criteria and begin bidder evaluation"
            >
              {evaluating ? 'Evaluating...' : 'Approve Criteria & Evaluate'}
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
          <span
            className={`rounded-full px-3 py-1 ${
              realtimeState.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {realtimeState.connected ? 'Live updates on' : 'Reconnecting'}
          </span>
          <span className="rounded-full bg-white/70 px-3 py-1">
            {refreshing ? 'Refreshing criteria...' : realtimeState.lastEventAt ? `Last event ${new Date(realtimeState.lastEventAt).toLocaleTimeString('en-IN')}` : 'Waiting for live events'}
          </span>
          {realtimeState.error ? <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">{realtimeState.error}</span> : null}
        </div>

        {error ? (
          <div role="alert" className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        ) : null}

        <div className="mt-8">
          <CriteriaTable criteria={data.criteria} />
        </div>

        {data.suggestedThresholds.length > 0 ? (
          <section className="mt-8 panel rounded-[28px] p-6">
            <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Suggested Thresholds</div>
            <h2 className="mt-3 font-display text-2xl font-semibold">Officer suggestions for ambiguous criteria</h2>
            <div className="mt-5 space-y-4">
              {data.suggestedThresholds.map((suggestion) => (
                <div key={suggestion.criterionId} className="rounded-2xl bg-white/75 p-4">
                  <div className="font-semibold">{suggestion.criterionId}</div>
                  <div className="mt-1 text-sm text-slate-700">{suggestion.originalText}</div>
                  <div className="mt-2 text-sm text-slate-600">Suggested threshold: {suggestion.suggestedValue}</div>
                  <div className="mt-2 text-xs leading-6 text-slate-500">{suggestion.reasoning}</div>
                  <Button
                    onClick={() => handleApplySuggestedThreshold(suggestion.criterionId, suggestion.suggestedValue)}
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                  >
                    Apply suggestion
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="panel rounded-[28px] p-6">
            <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Bidder Upload</div>
            <h2 className="mt-3 font-display text-2xl font-semibold">Add one bidder packet at a time</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Upload all files for a single bidder together. You can repeat this step for multiple bidders before
              evaluation, including scans, photographs, PDFs, and Word documents.
            </p>

            <div className="mt-5 grid gap-4">
              <input
                value={bidderName}
                onChange={(event) => setBidderName(event.target.value)}
                placeholder="Bidder name (optional)"
                aria-label="Enter bidder company name"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-0"
              />
              <label className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-4 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Bidder files</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
                  onChange={handleFileChange}
                  aria-label="Select files for bidder packet"
                  className="mt-3 block w-full"
                />
                <span className="mt-2 block text-xs text-slate-500">{bidderFileLabel ?? 'PDF, DOCX, JPG, and PNG are supported.'}</span>
              </label>
              <Button
                onClick={handleUploadBidder}
                disabled={uploadingBidder || !bidderFiles || bidderFiles.length === 0}
                aria-label="Upload bidder packet files"
                variant="secondary"
                loading={uploadingBidder}
              >
                {uploadingBidder ? 'Uploading bidder...' : 'Upload bidder packet'}
              </Button>
              <details className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
                <summary className="cursor-pointer font-semibold">Testing Tools</summary>
                <div className="mt-3">
                  <Button
                    onClick={handleSeedDemoBidders}
                    disabled={uploadingBidder || seedingDemoBidders}
                    aria-label="Optional sample bidder data for testing"
                    variant="tertiary"
                    loading={seedingDemoBidders}
                    size="sm"
                  >
                    {seedingDemoBidders ? 'Loading sample data...' : 'Load Sample Data'}
                  </Button>
                </div>
              </details>
            </div>
          </div>

          <div className="panel rounded-[28px] p-6">
            <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Session State</div>
            <div className="mt-5 rounded-2xl bg-white/75 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Officer sign-off name</div>
              <input
                value={approvedBy}
                onChange={(event) => setApprovedBy(event.target.value)}
                placeholder="Enter officer name"
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </div>
            <div className="mt-5">
              <div className="text-sm font-semibold text-slate-800">Uploaded bidders</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-white/75 p-4 text-sm text-slate-700">
                  <div className="font-semibold">Total uploaded</div>
                  <div className="mt-2 text-2xl font-semibold">{data.parseQualitySummary.totalBidders}</div>
                </div>
                <div className="rounded-2xl bg-white/75 p-4 text-sm text-slate-700">
                  <div className="font-semibold">Parse quality mix</div>
                  <div className="mt-2 text-xs leading-6 text-slate-600">
                    Good {data.parseQualitySummary.good} | Partial {data.parseQualitySummary.partial} | Poor {data.parseQualitySummary.poor} | Unreadable {data.parseQualitySummary.scannedUnreadable}
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                {data.uploadedBidders.length === 0 ? (
                  <div className="rounded-2xl bg-white/75 p-4 text-sm text-slate-600">No bidder packets uploaded yet.</div>
                ) : (
                  data.uploadedBidders.map((bidder) => (
                    <div key={bidder.bidderId} className="rounded-2xl bg-white/75 p-4 text-sm text-slate-700">
                      <div className="font-semibold">{bidder.bidderName}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {bidder.status} | {bidder.documentQuality ?? 'quality pending'}
                      </div>
                      {bidder.qualityReason ? <div className="mt-2 text-xs leading-6 text-slate-500">{bidder.qualityReason}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <Modal
        isOpen={showEvaluateModal}
        title="Approve Criteria & Start Evaluation"
        message={`Officer: ${approvedBy}\n\nYou're about to evaluate ${data?.uploadedBidders.length || 0} bidder(s) against ${data?.criteria.length || 0} criteria. Once started, this action cannot be undone. Review is available in the final report.`}
        confirmText="Proceed with Evaluation"
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={confirmEvaluate}
        onCancel={() => setShowEvaluateModal(false)}
      />
    </main>
  );
}
