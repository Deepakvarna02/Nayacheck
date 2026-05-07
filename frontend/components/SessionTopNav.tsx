import Link from 'next/link';

type SessionTopNavProps = {
  sessionId: string;
  current: 'criteria' | 'dashboard' | 'bidders' | 'report';
};

const navItems: Array<{ key: SessionTopNavProps['current']; label: string; href: (sessionId: string) => string }> = [
  { key: 'criteria', label: 'Criteria', href: (sessionId) => `/evaluate/${sessionId}/criteria` },
  { key: 'dashboard', label: 'Dashboard', href: (sessionId) => `/evaluate/${sessionId}` },
  { key: 'bidders', label: 'Bidder Deep Dive', href: (sessionId) => `/evaluate/${sessionId}/bidders` },
  { key: 'report', label: 'Audit Report', href: (sessionId) => `/evaluate/${sessionId}/report` }
];

export function SessionTopNav({ sessionId, current }: SessionTopNavProps) {
  return (
    <nav className="panel sticky top-4 z-30 rounded-[22px] p-3" aria-label="Session navigation">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
          Session {sessionId}
        </div>
        <div className="flex flex-wrap gap-2">
          {navItems.map((item) => {
            const isActive = item.key === current;
            return (
              <Link
                key={item.key}
                href={item.href(sessionId)}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                  isActive
                    ? 'bg-ink text-white'
                    : 'border border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:text-slate-800'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
