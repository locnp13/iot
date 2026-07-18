import type { Icon } from '@phosphor-icons/react';

export function StatCard({
  label,
  value,
  icon: Icon,
  colorClass = 'text-foreground',
}: {
  label: string;
  value: number;
  icon: Icon;
  colorClass?: string;
}) {
  return (
    <div
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className="flex items-center gap-3 rounded-md border border-border bg-background p-4 shadow-sm"
    >
      <Icon size={28} weight="fill" className={colorClass} />
      <div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
