type BidderCardProps = {
  bidderName: string;
  overallVerdict: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NEEDS_REVIEW';
  overallConfidence: number;
  recommendation: string;
  redFlagCount: number;
};

const verdictStyles = {
  ELIGIBLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  NOT_ELIGIBLE: 'bg-rose-50 text-rose-700 border-rose-200',
  NEEDS_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200'
};

export function BidderCard(props: BidderCardProps) {
  return (
    <article className="panel rounded-[28px] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-xl font-semibold">{props.bidderName}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{props.recommendation}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${verdictStyles[props.overallVerdict]}`}>
          {props.overallVerdict.replace('_', ' ')}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-2xl bg-white/70 p-4">
          <div className="text-slate-500">Overall Confidence</div>
          <div className="mt-1 text-2xl font-semibold">{Math.round(props.overallConfidence * 100)}%</div>
        </div>
        <div className="rounded-2xl bg-white/70 p-4">
          <div className="text-slate-500">Red Flags</div>
          <div className="mt-1 text-2xl font-semibold">{props.redFlagCount}</div>
        </div>
      </div>
    </article>
  );
}
