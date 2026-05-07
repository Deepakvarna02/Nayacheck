type EvidencePanelProps = {
  items: Array<{
    criterionId: string;
    criterionDescription: string;
    threshold?: string | null;
    verdict: string;
    reasoning: string;
    evidenceSummary: string;
    confidence: number;
    extractedValue?: string | null;
    structuredValue?: {
      raw?: string | null;
      numericMin?: number | null;
      countMin?: number | null;
      requiredStatus?: string | null;
      validityDate?: string | null;
    } | null;
    verificationSource?: string | null;
    sourceDocumentId?: string | null;
    sourceDocument: string | null;
    sourcePage?: number | null;
    sourceQuote: string | null;
    evidenceType?: string | null;
    reviewerAction: string | null;
  }>;
};

export function EvidencePanel({ items }: EvidencePanelProps) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <section key={item.criterionId} className="panel rounded-[24px] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.criterionId}</div>
              <h3 className="mt-2 text-lg font-semibold">{item.criterionDescription}</h3>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{item.verdict}</div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-700">{item.reasoning}</p>
          <div className="mt-4 rounded-2xl bg-white/70 p-4 text-sm">
            <div className="font-semibold">Evidence Chain</div>
            {item.threshold ? <p className="mt-2 text-slate-600">Threshold: {item.threshold}</p> : null}
            <p className="mt-2 text-slate-600">{item.evidenceSummary}</p>
            {item.extractedValue ? <p className="mt-2 text-slate-600">Extracted value: {item.extractedValue}</p> : null}
            {item.structuredValue?.numericMin ? (
              <p className="mt-2 text-slate-600">Normalized amount: Rs {item.structuredValue.numericMin.toLocaleString('en-IN')}</p>
            ) : null}
            {item.structuredValue?.countMin ? (
              <p className="mt-2 text-slate-600">Normalized count: {item.structuredValue.countMin}</p>
            ) : null}
            {item.structuredValue?.requiredStatus ? (
              <p className="mt-2 text-slate-600">Status: {item.structuredValue.requiredStatus}</p>
            ) : null}
            {item.structuredValue?.validityDate ? (
              <p className="mt-2 text-slate-600">Validity date: {item.structuredValue.validityDate}</p>
            ) : null}
            {item.sourceDocument ? (
              <p className="mt-2 text-slate-600">
                Source: {item.sourceDocument}
                {item.sourcePage ? `, page ${item.sourcePage}` : ''}
              </p>
            ) : null}
            {item.sourceDocumentId ? <p className="mt-2 text-slate-500">Document ID: {item.sourceDocumentId}</p> : null}
            {item.evidenceType ? <p className="mt-2 text-slate-500">Evidence type: {item.evidenceType}</p> : null}
            {item.sourceQuote ? <blockquote className="mt-2 border-l-2 border-amber-300 pl-3 text-slate-600">{item.sourceQuote}</blockquote> : null}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-500">Confidence {Math.round(item.confidence * 100)}%</span>
            {item.reviewerAction ? <span className="text-amber-700">{item.reviewerAction}</span> : null}
          </div>
        </section>
      ))}
    </div>
  );
}
