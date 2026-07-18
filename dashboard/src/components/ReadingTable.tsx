import type { ReadingWithHealth } from '../lib/apiClient';
import { HealthBadge } from './HealthBadge';

export function ReadingTable({ readings }: { readings: ReadingWithHealth[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] font-mono text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-sans font-medium">Cycle</th>
            <th className="px-3 py-2 text-right font-sans font-medium">V rest (V)</th>
            <th className="px-3 py-2 text-right font-sans font-medium">&Delta;V (V)</th>
            <th className="px-3 py-2 text-right font-sans font-medium">I max (A)</th>
            <th className="px-3 py-2 text-right font-sans font-medium">R int (m&Omega;)</th>
            <th className="px-3 py-2 text-right font-sans font-medium">% vs baseline</th>
            <th className="px-3 py-2 text-left font-sans font-medium">Status</th>
            <th className="px-3 py-2 text-left font-sans font-medium">Time</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-2">{r.cycle}</td>
              <td className="px-3 py-2 text-right">{r.vRest.toFixed(2)}</td>
              <td className="px-3 py-2 text-right">{r.deltaV.toFixed(2)}</td>
              <td className="px-3 py-2 text-right">{r.iMax.toFixed(2)}</td>
              <td className="px-3 py-2 text-right">{r.rInt.toFixed(2)}</td>
              <td className="px-3 py-2 text-right">
                {r.percentChangeFromBaseline > 0 ? '+' : ''}
                {r.percentChangeFromBaseline.toFixed(1)}%
              </td>
              <td className="px-3 py-2">
                <HealthBadge status={r.status} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
