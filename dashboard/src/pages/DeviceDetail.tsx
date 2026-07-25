import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowClockwise, ChartLineUp, Trash, Pencil } from '@phosphor-icons/react';
import { api } from '../lib/apiClient';
import { ErrorMessage } from '../components/ErrorMessage';
import { HealthBadge } from '../components/HealthBadge';
import { ReadingChart } from '../components/ReadingChart';
import { ReadingTable } from '../components/ReadingTable';
import { TokenRevealModal } from '../components/TokenRevealModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EditRatingModal } from '../components/EditRatingModal';
import { SohGauge } from '../components/SohGauge';

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const deviceId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditRating, setShowEditRating] = useState(false);

  const devicesQuery = useQuery({ queryKey: ['devices'], queryFn: api.listDevices });
  const readingsQuery = useQuery({
    queryKey: ['readings', deviceId],
    queryFn: () => api.getReadings(deviceId),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => api.regenerateToken(deviceId),
    onSuccess: (res) => setRevealedToken(res.token),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteDevice(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      navigate('/devices');
    },
  });

  const updateRatingMutation = useMutation({
    mutationFn: (vars: { rNew: number; rEol?: number }) => api.updateDeviceRating(deviceId, vars.rNew, vars.rEol),
    onSuccess: () => {
      // SOH is recomputed server-side from stored rInt values, not stored per-reading —
      // refetching readings is what picks up the new rating there. Devices must also be
      // refetched: the SOH formula panel reads device.rNew/rEol directly, and that would
      // otherwise stay stale after an edit even though the readings' soh values update.
      queryClient.invalidateQueries({ queryKey: ['readings', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setShowEditRating(false);
    },
  });

  const device = devicesQuery.data?.find((d) => d.id === deviceId);
  const readings = readingsQuery.data ?? [];
  const latest = readings.length > 0 ? readings[readings.length - 1] : undefined;

  return (
    <div className="mx-auto mt-10 w-full max-w-3xl">
      <Link to="/devices" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft size={16} /> All devices
      </Link>

      <div className="mt-3 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{device?.name ?? `Device #${deviceId}`}</h1>
          {latest && <HealthBadge status={latest.status} />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditRating(true)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Pencil size={16} />
            Edit rating
          </button>
          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <ArrowClockwise size={16} />
            {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate token'}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-destructive hover:bg-muted"
          >
            <Trash size={16} />
            Delete device
          </button>
        </div>
      </div>

      {latest && (
        <div className="mb-6 flex items-center gap-4 rounded-lg border border-border bg-background p-4 shadow-sm">
          <SohGauge soh={latest.soh} rInt={latest.rInt} rNew={device?.rNew ?? null} rEol={device?.rEol ?? null} />
          <div>
            <p className="text-sm font-medium">Battery State of Health</p>
            <p className="text-xs text-muted-foreground">
              Absolute quality vs. a rated new battery — separate from the trend badge above, which only
              compares against this device's own first reading.
            </p>
          </div>
        </div>
      )}

      {deleteMutation.isError && (
        <div className="mb-4">
          <ErrorMessage message="Could not delete device." />
        </div>
      )}

      {readingsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {readingsQuery.isError && <ErrorMessage message="Could not load reading history." />}

      {readingsQuery.data && readings.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-10 text-center">
          <ChartLineUp size={36} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No readings yet. Once this device uploads a measurement, it will show up here.
          </p>
        </div>
      )}

      {readings.length > 0 && (
        <div className="space-y-6">
          <ReadingChart readings={readings} />
          <ReadingTable readings={readings} />
        </div>
      )}

      {revealedToken && <TokenRevealModal token={revealedToken} onClose={() => setRevealedToken(null)} />}

      {showEditRating && (
        <EditRatingModal
          currentRNew={device?.rNew ?? null}
          currentREol={device?.rEol ?? null}
          isPending={updateRatingMutation.isPending}
          onSave={(rNew, rEol) => updateRatingMutation.mutate({ rNew, rEol })}
          onClose={() => setShowEditRating(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete this device?"
          message={`This will permanently delete "${device?.name ?? `Device #${deviceId}`}" and all of its reading history. This cannot be undone.`}
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
