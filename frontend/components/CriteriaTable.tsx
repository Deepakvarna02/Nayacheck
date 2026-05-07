type Criterion = {
  id: string;
  description: string;
  threshold: string;
  type: string;
  category: string;
  verificationSource?: string;
  ambiguityFlag?: boolean;
  ambiguityReason?: string | null;
  sourceQuote?: string | null;
  sourcePage?: number | null;
  normalisedThresholdType?: string;
  manualReviewHeavy?: boolean;
};

export function CriteriaTable({ criteria }: { criteria: Criterion[] }) {
  const mandatoryCriteria = criteria.filter((c) => c.type === 'mandatory');
  const optionalCriteria = criteria.filter((c) => c.type === 'optional');

  return (
    <div className="space-y-8">
      {mandatoryCriteria.length > 0 && (
        <div className="panel overflow-hidden rounded-[28px]">
          <div className="border-b border-slate-200 bg-white/50 px-6 py-4">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-700">Mandatory Criteria</div>
            <div className="mt-1 text-xs text-slate-500">Bidder must meet all of these requirements</div>
          </div>
          <div>
            {mandatoryCriteria.map((criterion) => (
              <CriterionRow key={criterion.id} criterion={criterion} />
            ))}
          </div>
        </div>
      )}

      {optionalCriteria.length > 0 && (
        <div className="panel overflow-hidden rounded-[28px]">
          <div className="border-b border-slate-200 bg-white/50 px-6 py-4">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Optional Criteria</div>
            <div className="mt-1 text-xs text-slate-500">Bidder may meet these for added qualification</div>
          </div>
          <div>
            {optionalCriteria.map((criterion) => (
              <CriterionRow key={criterion.id} criterion={criterion} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CriterionRow({ criterion }: { criterion: Criterion }) {
  return (
    <div className="border-b border-slate-100 px-6 py-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-3">
            <div className="font-semibold text-slate-900">{criterion.id}</div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
              criterion.type === 'mandatory'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {criterion.type}
            </span>
            {criterion.ambiguityFlag && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
                ⚠ Ambiguous
              </span>
            )}
          </div>
          <div className="mt-3 text-sm font-medium text-slate-900">{criterion.description}</div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
            {criterion.sourcePage && <span>📄 Page {criterion.sourcePage}</span>}
            {criterion.verificationSource && <span>✓ {criterion.verificationSource}</span>}
          </div>
        </div>
        <div className="flex-1 min-w-[200px] space-y-2">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Threshold</div>
            <div className="mt-1 font-semibold text-slate-900">{criterion.threshold}</div>
          </div>
          {criterion.normalisedThresholdType && (
            <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{criterion.normalisedThresholdType}</div>
          )}
        </div>
      </div>
      {criterion.ambiguityReason && (
        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">Ambiguity Alert</div>
          <div className="mt-1">{criterion.ambiguityReason}</div>
        </div>
      )}
      {criterion.sourceQuote && (
        <blockquote className="mt-4 border-l-4 border-slate-300 pl-4 text-sm italic text-slate-700">
          "{criterion.sourceQuote}"
        </blockquote>
      )}
    </div>
  );
}
