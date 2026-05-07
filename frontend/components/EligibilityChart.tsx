'use client';

import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from 'recharts';

const COLORS = ['#2f855a', '#b83232', '#c17f00'];

export function EligibilityChart({
  eligible,
  notEligible,
  needsReview
}: {
  eligible: number;
  notEligible: number;
  needsReview: number;
}) {
  const data = [
    { name: 'Eligible', value: eligible },
    { name: 'Not Eligible', value: notEligible },
    { name: 'Needs Review', value: needsReview }
  ];

  return (
    <div className="panel rounded-[28px] p-6">
      <div className="text-sm uppercase tracking-[0.22em] text-slate-500">Verdict Mix</div>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={4}>
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
