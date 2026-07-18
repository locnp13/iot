import type { ReadingWithHealth } from '../lib/apiClient';

const STYLES: Record<ReadingWithHealth['status'], string> = {
  stable: 'bg-success/15 text-success border-success/30',
  degrading: 'bg-warning/15 text-warning border-warning/30',
  replace: 'bg-destructive/15 text-destructive border-destructive/30',
};

const LABELS: Record<ReadingWithHealth['status'], string> = {
  stable: 'Stable',
  degrading: 'Degrading',
  replace: 'Replace',
};

export function HealthBadge({ status }: { status: ReadingWithHealth['status'] }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
