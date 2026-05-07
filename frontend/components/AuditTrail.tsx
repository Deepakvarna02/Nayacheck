type AuditTrailProps = {
  auditId: string;
  integrityHash: string;
  integrityStatement: string;
  checklist: string[];
};

export function AuditTrail({ auditId, integrityHash, integrityStatement, checklist }: AuditTrailProps) {
  return (
    <div className="panel rounded-[28px] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Audit Trail</div>
          <h2 className="mt-3 font-display text-3xl font-semibold">{auditId}</h2>
        </div>
        <div className="rounded-2xl bg-slate-950 px-4 py-3 text-xs text-slate-100">{integrityHash}</div>
      </div>
      <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-700">{integrityStatement}</p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {checklist.map((item) => (
          <div key={item} className="rounded-2xl bg-white/70 p-4 text-sm text-slate-600">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
