import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ReadingWithHealth } from '../lib/apiClient';

export function ReadingChart({ readings }: { readings: ReadingWithHealth[] }) {
  const data = readings.map((r) => ({ cycle: r.cycle, rInt: Number(r.rInt.toFixed(3)) }));

  return (
    <div className="h-64 rounded-md border border-border bg-background p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="cycle" tick={{ fontSize: 12 }} label={{ value: 'Cycle', position: 'insideBottom', offset: -2, fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} label={{ value: 'Rint (mΩ)', angle: -90, position: 'insideLeft', fontSize: 12 }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: 'var(--color-border)' }}
            formatter={(value) => [`${value} mΩ`, 'Rint']}
            labelFormatter={(cycle) => `Cycle ${cycle}`}
          />
          <Line type="monotone" dataKey="rInt" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
