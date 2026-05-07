'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type ChangeEvent } from 'react';
import { UploadZone } from '../components/UploadZone';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useToast } from '../components/Toast';
import { validateFile, getFileErrorMessage } from '../utils/fileValidator';
import { Button } from '../components/Button';

type TenderUploadResponse = {
  sessionId: string;
  status: string;
  tender: {
    title: string;
    reference: string | null;
    issuingAuthority: string;
    criteriaCount: number;
    mandatoryCount: number;
    optionalCount: number;
    extractionConfidence: number;
    ambiguousCount: number;
  };
  processingTime: number;
};

export default function HomePage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [tenderFile, setTenderFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<TenderUploadResponse['tender'] | null>(null);
  const [processingStep, setProcessingStep] = useState<string | null>(null);

  const tenderLabel = useMemo(() => {
    if (!tenderFile) {
      return null;
    }

    return `${tenderFile.name} • ${(tenderFile.size / (1024 * 1024)).toFixed(2)} MB`;
  }, [tenderFile]);

  const handleTenderChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setError(null);
    
    if (nextFile) {
      const validation = await validateFile(nextFile);
      if (!validation.valid) {
        const message = getFileErrorMessage(nextFile, validation);
        setError(message);
        addToast(validation.error || 'File validation failed', 'error');
        setTenderFile(null);
        return;
      }
    }
    
    setTenderFile(nextFile);
  };

  const handleCreateSession = async () => {
    setSubmitting(true);
    setError(null);
    setProcessingStep('Parsing tender document...');

    try {
      if (!tenderFile) {
        throw new Error('Upload a tender PDF or Word document before continuing.');
      }

      const formData = new FormData();
      formData.append('file', tenderFile);
      const response = await fetch('/api/proxy/tender/upload', {
        method: 'POST',
        body: formData
      });

      const data = (await response.json()) as TenderUploadResponse & {
        error?: string;
        message?: string;
        suggestion?: string;
      };

      if (!response.ok) {
        throw new Error([data.message ?? data.error, data.suggestion].filter(Boolean).join(' '));
      }

      setProcessingStep('Extracting criteria...');
      setSummary(data.tender);
      
      addToast(
        `✓ Extracted ${data.tender.criteriaCount} criteria (${Math.round(data.tender.extractionConfidence * 100)}% confidence)`,
        'success'
      );
      
      // Brief pause to show completion step
      await new Promise(resolve => setTimeout(resolve, 500));
      setProcessingStep(null);
      router.push(`/evaluate/${data.sessionId}/criteria`);
    } catch (caughtError) {
      const errorMsg = caughtError instanceof Error ? caughtError.message : 'Tender upload failed.';
      setError(errorMsg);
      addToast(errorMsg, 'error');
      setProcessingStep(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="pb-16 pt-10">
      {submitting && <LoadingSpinner fullScreen message={processingStep || undefined} />}
      <div className="shell">
        <section className="panel subtle-grid overflow-hidden rounded-[32px] px-6 py-8 md:px-10 md:py-12">
          <div className="grid gap-10 lg:grid-cols-[1.45fr_0.85fr] lg:items-end">
            <div>
              <div className="text-sm uppercase tracking-[0.3em] text-slate-500">PAN IIT AI for Bharat · Theme 3</div>
              <h1 className="mt-5 max-w-3xl font-display text-5xl font-semibold leading-tight md:text-6xl">
                Explainable AI for CRPF tender eligibility review, built for audit-ready government procurement.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-700">
                NyayaCheck starts with the tender, extracts eligibility criteria with source evidence, and keeps every
                ambiguous decision in human review before bidder verdicts are issued.
              </p>
              <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-700">
                {[
                  'Tender criteria extraction',
                  'Scanned PDF and photo handling',
                  'Criterion-level verdicts',
                  'No silent disqualification',
                  'Audit trail for sign-off'
                ].map((pill) => (
                  <span key={pill} className="rounded-full border border-slate-200 bg-white/75 px-4 py-2 font-medium">
                    {pill}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-[28px] bg-ink p-6 text-white shadow-[0_20px_40px_rgba(18,35,61,0.26)]">
              <div className="text-sm uppercase tracking-[0.24em] text-white/60">File-First Workflow</div>
              <div className="mt-4 text-3xl font-semibold">Upload first, review evidence second.</div>
              <p className="mt-4 text-sm leading-7 text-white/80">
                Poor scans, unclear thresholds, and contradictory evidence are routed to officer review with the specific
                criterion, document, and reason attached.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 text-xs text-white/80">
                <div className="rounded-2xl bg-white/10 p-3">Criteria separated by type</div>
                <div className="rounded-2xl bg-white/10 p-3">Mandatory vs optional flagged</div>
                <div className="rounded-2xl bg-white/10 p-3">Officer checkpoint before evaluation</div>
                <div className="rounded-2xl bg-white/10 p-3">Final report ready for sign-off</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <UploadZone
            title="Tender Document"
            subtitle="Upload a CRPF tender PDF or Word document. The system extracts criteria, thresholds, and evidence for officer review before bidder packets are uploaded."
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleTenderChange}
            selectedLabel={tenderLabel}
            disabled={submitting}
          />
          <div className="panel rounded-[28px] p-6">
            <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Launch Session</div>
            <h2 className="mt-3 font-display text-3xl font-semibold">Create a procurement review workspace</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Real tender upload uses the full parsing stack. Upload the actual tender PDF or Word file to start the review
              workspace and extract criteria from live data.
            </p>

            {error ? (
              <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
            ) : null}

            {summary ? (
              <div className="mt-5 rounded-2xl bg-white/75 p-4 text-sm text-slate-700">
                Extracted {summary.criteriaCount} criteria with {Math.round(summary.extractionConfidence * 100)}% confidence,
                including {summary.mandatoryCount} mandatory and {summary.optionalCount} optional checks.
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={handleCreateSession}
                disabled={submitting || !tenderFile}
                aria-label="Scan the uploaded tender file and extract criteria"
                loading={submitting}
              >
                {submitting ? 'Scanning file...' : 'Scan Tender File'}
              </Button>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="panel rounded-[28px] p-6 lg:col-span-2">
            <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Workflow</div>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {[
                '1. Upload tender',
                '2. Review criteria and thresholds',
                '3. Upload bidder packets',
                '4. Evaluate with audit trail'
              ].map((step) => (
                <div key={step} className="rounded-2xl bg-white/75 p-4 text-sm text-slate-700">
                  {step}
                </div>
              ))}
            </div>
          </div>
          <div className="panel rounded-[28px] p-6">
            <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Why This Wins</div>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              The officer checkpoint happens before evaluation. That keeps the AI explainable, preserves procurement
              accountability, and lets ambiguous extraction be corrected before any bidder is scored.
            </p>
          </div>
        </section>

        <section className="mt-10 panel rounded-[28px] p-6 md:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div>
              <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Submission Fit</div>
              <h2 className="mt-3 font-display text-3xl font-semibold">Why this matches Theme 3 exactly</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                The brief asks for tender understanding, bidder parsing, explainable verdicts, human review for ambiguity,
                and a complete audit trail. NyayaCheck is built around that sequence, so every screen maps back to the
                judging criteria instead of adding unrelated product ideas.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                'Tender criteria extracted before bidder upload',
                'Mandatory and optional checks kept separate',
                'Scanned documents and photos are treated as first-class inputs',
                'Ambiguous evidence routes to officer review',
                'Verdicts are explained at criterion level',
                'Final report is audit-ready for sign-off'
              ].map((item) => (
                <div key={item} className="rounded-2xl bg-white/75 p-4 text-sm leading-6 text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
