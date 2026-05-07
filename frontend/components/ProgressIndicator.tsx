import React from 'react';

interface ProgressIndicatorProps {
  steps: string[];
  currentStep: number;
}

export function ProgressIndicator({ steps, currentStep }: ProgressIndicatorProps) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const stepNum = index + 1;
        const isCompleted = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;

        return (
          <div key={step} className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm transition-all ${
                isCompleted
                  ? 'bg-emerald-500 text-white'
                  : isCurrent
                    ? 'bg-ink text-white ring-2 ring-ink/20'
                    : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isCompleted ? '✓' : stepNum}
            </div>
            <span
              className={`text-sm font-medium ${
                isCurrent ? 'text-ink font-semibold' : isCompleted ? 'text-emerald-600' : 'text-slate-600'
              }`}
            >
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ProgressBar({ value, max = 100, showLabel = true }: { value: number; max?: number; showLabel?: boolean }) {
  const percentage = (value / max) * 100;

  return (
    <div className="space-y-2">
      <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-emerald-500 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && <p className="text-xs text-slate-600 text-center">{Math.round(percentage)}% complete</p>}
    </div>
  );
}
