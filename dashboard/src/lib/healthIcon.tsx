import { BatteryFull, BatteryWarning, BatteryLow } from '@phosphor-icons/react';
import type { Device } from './apiClient';

const ICONS = {
  stable: BatteryFull,
  degrading: BatteryWarning,
  replace: BatteryLow,
};

const COLOR_CLASSES: Record<NonNullable<Device['status']>, string> = {
  stable: 'text-success',
  degrading: 'text-warning',
  replace: 'text-destructive',
};

export function StatusIcon({ status, size = 24 }: { status: Device['status']; size?: number }) {
  const Icon = status ? ICONS[status] : BatteryFull;
  const colorClass = status ? COLOR_CLASSES[status] : 'text-muted-foreground';
  return <Icon size={size} weight="fill" className={colorClass} />;
}
