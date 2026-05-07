type ConsistencyHeatmapProps = {
  matrix: Array<{
    criterionId: string;
    description: string;
    bidders: Array<{
      bidderId: string;
      bidderName: string;
      verdict: 'PASS' | 'FAIL' | 'NEEDS_REVIEW';
    }>;
  }>;
};

const verdictClass: Record<'PASS' | 'FAIL' | 'NEEDS_REVIEW', string> = {
  PASS: 'bg-emerald-100 text-emerald-800',
  FAIL: 'bg-rose-100 text-rose-800',
  NEEDS_REVIEW: 'bg-amber-100 text-amber-800'
};

export function ConsistencyHeatmap({ matrix }: ConsistencyHeatmapProps) {
  if (matrix.length === 0) {
    return (
      <div className="panel rounded-[28px] p-6 text-sm text-slate-600">
        Criterion matrix will appear after bidder evaluations are available.
      </div>
    );
  }

  const bidderHeaders = matrix[0]?.bidders ?? [];

  return (
    <div className="panel rounded-[28px] p-6">
      <div className="space-y-4">
        <div>
          <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Consistency Matrix</div>
          <p className="mt-2 text-sm text-slate-600">Cross-bidder verdict comparison by criterion. Inconsistent verdicts highlight potential bias or missed evidence.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-100 border border-emerald-200"></div>
            <span className="text-xs text-slate-600">Pass</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-rose-100 border border-rose-200"></div>
            <span className="text-xs text-slate-600">Fail</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-amber-100 border border-amber-200"></div>
            <span className="text-xs text-slate-600">Needs Review</span>
          </div>
        </div>
      </div>

      {/* Desktop table view */}
      <div className="mt-6 hidden lg:block overflow-x-auto">
        <div
          className="grid gap-3 border-b border-slate-200 pb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
          style={{ gridTemplateColumns: `minmax(220px, 1.2fr) repeat(${bidderHeaders.length}, minmax(120px, 1fr))` }}
        >
          <div>Criterion</div>
          {bidderHeaders.map((bidder) => (
            <div key={bidder.bidderId}>{bidder.bidderName}</div>
          ))}
        </div>

        <div className="mt-3 space-y-3">
          {matrix.map((row) => (
            <div
              key={row.criterionId}
              className="grid gap-3"
              style={{ gridTemplateColumns: `minmax(220px, 1.2fr) repeat(${row.bidders.length}, minmax(120px, 1fr))` }}
            >
              <div className="rounded-2xl bg-white/70 p-3">
                <div className="font-semibold">{row.criterionId}</div>
                <div className="mt-1 text-xs leading-5 text-slate-600">{row.description}</div>
              </div>
              {row.bidders.map((bidder) => (
                <div
                  key={`${row.criterionId}-${bidder.bidderId}`}
                  className={`rounded-2xl p-3 text-center text-xs font-semibold ${verdictClass[bidder.verdict]}`}
                >
                  {bidder.verdict}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile card view */}
      <div className="mt-6 space-y-4 lg:hidden">
        {matrix.map((row) => (
          <div key={row.criterionId} className="rounded-2xl bg-white/70 p-4 space-y-3">
            <div>
              <div className="font-semibold text-sm">{row.criterionId}</div>
              <div className="mt-2 text-sm leading-5 text-slate-600">{row.description}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {row.bidders.map((bidder) => (
                <div key={`${row.criterionId}-${bidder.bidderId}`} className="text-center">
                  <div className="text-xs text-slate-600 truncate">{bidder.bidderName}</div>
                  <div
                    className={`mt-2 rounded-lg p-2 text-xs font-semibold ${verdictClass[bidder.verdict]}`}
                  >
                    {bidder.verdict}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
