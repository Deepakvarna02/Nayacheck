type ReviewQueueItem = {
  reviewItemId: string;
  bidderId: string | null;
  criterionId: string;
  issueType: string;
  issueSummary: string;
  requestedAction: string;
  status: string;
};

export function ReviewQueue({ items }: { items: ReviewQueueItem[] }) {
  return (
    <div className="panel rounded-[28px] p-6">
      <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Manual Review Queue</div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl bg-white/70 p-4 text-sm text-slate-600">No pending review items.</div>
        ) : (
          items.map((item) => (
            <div key={item.reviewItemId} className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-semibold">
                {item.bidderId ? `${item.bidderId} - ${item.criterionId}` : item.criterionId}
              </div>
              <div className="mt-1">{item.issueSummary}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-amber-800">
                <span className="rounded-full bg-white/70 px-2.5 py-1 font-semibold uppercase tracking-[0.12em]">
                  {item.issueType.replace(/_/g, ' ')}
                </span>
                <span>Requested action: {item.requestedAction}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
