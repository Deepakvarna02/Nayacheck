'use client';

import type { ChangeEventHandler } from 'react';

type UploadZoneProps = {
  title: string;
  subtitle: string;
  multiple?: boolean;
  accept?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  selectedLabel?: string | null;
  disabled?: boolean;
};

export function UploadZone({
  title,
  subtitle,
  multiple = false,
  accept,
  onChange,
  selectedLabel,
  disabled = false
}: UploadZoneProps) {
  return (
    <label
      className={`panel flex min-h-52 flex-col justify-between rounded-[28px] p-6 transition ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:-translate-y-1'
      }`}
    >
      <div>
        <div className="text-sm uppercase tracking-[0.3em] text-slate-500">Document Intake</div>
        <h3 className="mt-3 font-display text-2xl font-semibold text-ink">{title}</h3>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">{subtitle}</p>
      </div>
      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-sm text-slate-500">
        {selectedLabel ?? 'Drag and drop files here, or click to browse.'}
      </div>
      <input className="hidden" type="file" multiple={multiple} accept={accept} onChange={onChange} disabled={disabled} />
    </label>
  );
}
