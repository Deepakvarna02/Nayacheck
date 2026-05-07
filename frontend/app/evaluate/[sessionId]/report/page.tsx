'use client';

import { useEffect, useState } from 'react';
import { AuditTrail } from '../../../../components/AuditTrail';
import { SectionHeader } from '../../../../components/SectionHeader';
import { SessionTopNav } from '../../../../components/SessionTopNav';
import { Button } from '../../../../components/Button';

type ReportResponse = {
  sourceMode: 'active_case' | 'practice_case';
  auditId: string;
  generatedAt: string;
  tenderReference: string;
  integrityHash: string;
  evaluationSummary: {
    totalBidders: number;
    eligible: number;
    notEligible: number;
    needsReview: number;
    silentDisqualifications: number;
  };
  processingLog: Array<{ step: string; status: string; detail: string; timestamp: string }>;
  integrityStatement: string;
  consistencyScore: number;
  consistencyIssues: Array<{
    criterion_id: string;
    description: string;
    issue: string;
    recommendation: string;
  }>;
  unresolvedReviewItems: Array<{
    reviewItemId: string;
    bidderId: string | null;
    criterionId: string;
    issueType: string;
    issueSummary: string;
    requestedAction: string;
    status: string;
  }>;
  overrideLog: Array<{
    timestamp: string;
    reviewerName: string;
    reviewerDesignation: string;
    bidderId: string;
    criterionId: string;
    oldValue: string | null;
    newValue: string;
    reason: string;
  }>;
  reviewerChecklist: string[];
  signOffFields: {
    reviewedBy: string | null;
    designation: string | null;
    reviewDate: string | null;
    signatureHash: string | null;
  };
};

export default function ReportPage({ params }: { params: { sessionId: string } }) {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'audit' | 'hash'>('idle');
  const caseLabel = data?.sourceMode === 'practice_case' ? 'Sample Case' : 'Active Case';
  const reportCards: Array<[string, string, 'audit' | 'hash' | null]> = [
    ['Audit ID', data?.auditId ?? '', 'audit'],
    ['Generated', data ? new Date(data.generatedAt).toLocaleString('en-IN') : '', null],
    ['Integrity Hash', data?.integrityHash ?? '', 'hash'],
    ['Sign-off', data?.signOffFields.reviewedBy ? 'Signed off' : 'Pending sign-off', null]
  ];

  useEffect(() => {
    const loadReport = async () => {
      try {
        const response = await fetch(`/api/proxy/report/${params.sessionId}`, { cache: 'no-store' });
        const payload = (await response.json()) as ReportResponse & { message?: string; error?: string };
        if (!response.ok) {
          throw new Error(payload.message ?? payload.error ?? 'Failed to load audit report.');
        }

        setData(payload);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load audit report.');
      }
    };

    void loadReport();
  }, [params.sessionId]);

  const exportPdf = async () => {
    const container = document.getElementById('report-content');
    if (!container) {
      setError('Could not find report content for export.');
      return;
    }

    try {
      setExporting(true);
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const canvas = await html2canvas(container, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`nyayacheck_audit_${data?.auditId ?? params.sessionId}.pdf`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'PDF export failed.');
    } finally {
      setExporting(false);
    }
  };

  const copyText = async (value: string, type: 'audit' | 'hash') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(type);
      window.setTimeout(() => setCopyState('idle'), 1600);
    } catch (_error) {
      setError('Copy failed. Please copy the value manually.');
    }
  };

  const signOffStatus = data?.signOffFields.reviewedBy ? 'Signed off' : 'Pending sign-off';

  return (
    <main className="pb-16 pt-8">
      <div className="shell page-stack">
        <SessionTopNav sessionId={params.sessionId} current="report" />
        <SectionHeader
          kicker="Tamper-Evident Record"
          title="CRPF Audit Report"
          badge={
            data
              ? {
                  label: caseLabel,
                  tone: data.sourceMode === 'practice_case' ? 'warning' : 'success'
                }
              : undefined
          }
          description="Every decision, reviewer checkpoint, and process event is bundled into a formal record ready for procurement sign-off."
        />

        {error ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        {data ? (
          <>
            <div className="mt-8 grid gap-4 lg:grid-cols-4">
              {reportCards.map(([label, value, copyType]) => (
                <div key={label} className="panel rounded-[24px] p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
                  <div className="mt-2 break-words text-sm font-semibold text-slate-900">{value}</div>
                  {copyType ? (
                    <Button
                      onClick={() => copyText(String(value), copyType)}
                      className="mt-3"
                      variant="secondary"
                      size="sm"
                    >
                      {copyState === copyType ? 'Copied' : `Copy ${label}`}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <Button
                onClick={exportPdf}
                disabled={exporting}
                loading={exporting}
              >
                {exporting ? 'Exporting PDF...' : 'Export as PDF'}
              </Button>
            </div>
            <div id="report-content" className="mt-8 space-y-8">
              <div className="panel rounded-[24px] border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-transparent p-6">
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-900">Evaluation Summary</div>
                <div className="mt-5 grid gap-4 md:grid-cols-4">
                  {[
                    ['Total Bidders', String(data.evaluationSummary.totalBidders), 'text-slate-900'],
                    ['Eligible', String(data.evaluationSummary.eligible), 'text-emerald-900'],
                    ['Not Eligible', String(data.evaluationSummary.notEligible), 'text-rose-900'],
                    ['Needs Review', String(data.evaluationSummary.needsReview), 'text-amber-900']
                  ].map(([label, value, color]) => (
                    <div key={label} className="rounded-2xl bg-white/80 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-600">{label}</div>
                      <div className={`mt-2 text-3xl font-bold ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <AuditTrail
                auditId={data.auditId}
                integrityHash={data.integrityHash}
                integrityStatement={data.integrityStatement}
                checklist={data.reviewerChecklist}
              />
              <div className="panel rounded-[24px] p-5">
                <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Sign-Off Record</div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {[
                    ['Reviewed By', data.signOffFields.reviewedBy ?? 'Pending sign-off'],
                    ['Designation', data.signOffFields.designation ?? 'Pending sign-off'],
                    ['Review Date', data.signOffFields.reviewDate ? new Date(data.signOffFields.reviewDate).toLocaleString('en-IN') : 'Pending sign-off']
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-white/75 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel rounded-[24px] p-5">
                <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Governance Summary</div>
                <div className="mt-3 text-sm leading-7 text-slate-700">
                  The report is designed for formal procurement use: every verdict is explainable at criterion level,
                  ambiguous cases remain visible, and the review record keeps the source evidence and reviewer actions in
                  one place.
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-4">
                {[
                  ['Total Bidders', String(data.evaluationSummary.totalBidders)],
                  ['Clearly Eligible', String(data.evaluationSummary.eligible)],
                  ['Clearly Not Eligible', String(data.evaluationSummary.notEligible)],
                  ['Needs Human Review', String(data.evaluationSummary.needsReview)]
                ].map(([label, value]) => (
                  <div key={label} className="panel rounded-[24px] p-5">
                    <div className="text-sm text-slate-500">{label}</div>
                    <div className="mt-2 text-3xl font-semibold">{value}</div>
                  </div>
                ))}
              </div>
              <div className="panel rounded-[24px] p-5">
                <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Consistency Score</div>
                <div className="mt-2 text-3xl font-semibold">{Math.round(data.consistencyScore * 100)}%</div>
                {data.consistencyIssues.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {data.consistencyIssues.map((item) => (
                      <div key={`${item.criterion_id}-${item.issue}`} className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                        <strong>{item.criterion_id}</strong>: {item.issue} {item.recommendation}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                    The evaluation produced no cross-bidder consistency warnings.
                  </div>
                )}
              </div>
              <div className="panel rounded-[24px] p-5">
                <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Manual Overrides</div>
                {data.overrideLog.length > 0 ? (
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    {data.overrideLog.map((entry) => (
                      <div key={`${entry.timestamp}-${entry.bidderId}-${entry.criterionId}`} className="rounded-2xl bg-white/75 p-4">
                        <div className="font-semibold">
                          {entry.bidderId} • {entry.criterionId}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {entry.reviewerName} ({entry.reviewerDesignation})
                        </div>
                        <div className="mt-2">
                          {entry.oldValue ?? 'No prior value'} → {entry.newValue}
                        </div>
                        <div className="mt-1 text-slate-600">{entry.reason}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl bg-white/75 p-4 text-sm text-slate-600">
                    No manual evidence overrides were recorded in this session.
                  </div>
                )}
              </div>
              <div className="panel rounded-[24px] p-5">
                <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Unresolved Review Items</div>
                {data.unresolvedReviewItems.length > 0 ? (
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    {data.unresolvedReviewItems.map((item) => (
                      <div key={item.reviewItemId} className="rounded-2xl bg-amber-50 p-4 text-amber-900">
                        <div className="font-semibold">
                          {item.bidderId ? `${item.bidderId} - ${item.criterionId}` : item.criterionId}
                        </div>
                        <div className="mt-1">{item.issueSummary}</div>
                        <div className="mt-2 text-xs">{item.requestedAction}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                    No unresolved review items remain in this session.
                  </div>
                )}
              </div>
              <div className="panel rounded-[24px] p-5">
                <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Processing Log</div>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  {data.processingLog.map((entry) => (
                    <div key={`${entry.timestamp}-${entry.step}`} className="rounded-2xl bg-white/75 p-4">
                      <div className="font-semibold">{entry.step}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{entry.status}</div>
                      <div className="mt-2">{entry.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-[24px] border border-slate-200 bg-white/70 p-6 text-sm text-slate-600">Generating audit report...</div>
        )}
      </div>
    </main>
  );
}
