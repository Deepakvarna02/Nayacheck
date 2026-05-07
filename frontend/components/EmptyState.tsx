import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, icon = '📋', action }: EmptyStateProps) {
  return (
    <div className="panel rounded-[28px] p-12 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:shadow-md transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
