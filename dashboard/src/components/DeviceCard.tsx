import { Link } from 'react-router';
import { CaretRight } from '@phosphor-icons/react';
import type { Device } from '../lib/apiClient';
import { StatusIcon } from '../lib/healthIcon';
import { HealthBadge } from './HealthBadge';

export function DeviceCard({ device }: { device: Device }) {
  return (
    <Link
      to={`/devices/${device.id}`}
      className="group flex items-center gap-4 rounded-md border border-border bg-background p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted">
        <StatusIcon status={device.status} size={24} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{device.name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Added {new Date(device.createdAt).toLocaleDateString()}
        </div>
      </div>

      {device.status && <HealthBadge status={device.status} />}

      <CaretRight size={18} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
