import React from 'react';

type SectionHeaderProps = {
  kicker: string;
  title: string;
  description?: string;
  badge?: {
    label: string;
    tone?: 'success' | 'warning' | 'neutral';
  };
  actions?: React.ReactNode;
};

const badgeToneClass = {
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  neutral: 'bg-slate-100 text-slate-700'
};

export function SectionHeader({ kicker, title, description, badge, actions }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="section-kicker">{kicker}</div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-semibold">{title}</h1>
          {badge ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${badgeToneClass[badge.tone ?? 'neutral']}`}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
        {description ? <p className="page-copy">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
