import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Cube, BatteryFull, BatteryWarning, BatteryLow } from '@phosphor-icons/react';
import { api, ApiError, type DeviceWithToken } from '../lib/apiClient';
import { DeviceCard } from '../components/DeviceCard';
import { ErrorMessage } from '../components/ErrorMessage';
import { TokenRevealModal } from '../components/TokenRevealModal';
import { HomeBanner } from '../components/HomeBanner';
import { StatCard } from '../components/StatCard';

export function DeviceList() {
  const queryClient = useQueryClient();
  const devicesQuery = useQuery({ queryKey: ['devices'], queryFn: api.listDevices });
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [revealedDevice, setRevealedDevice] = useState<DeviceWithToken | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.createDevice(name),
    onSuccess: (device) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setRevealedDevice(device);
      setShowAddForm(false);
      setName('');
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  const devices = devicesQuery.data ?? [];
  const stableCount = devices.filter((d) => d.status === 'stable').length;
  const degradingCount = devices.filter((d) => d.status === 'degrading').length;
  const replaceCount = devices.filter((d) => d.status === 'replace').length;

  return (
    <div className="mx-auto mt-10 w-full max-w-2xl">
      <HomeBanner />

      {devices.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total devices" value={devices.length} icon={Cube} colorClass="text-primary" />
          <StatCard label="Stable" value={stableCount} icon={BatteryFull} colorClass="text-success" />
          <StatCard label="Degrading" value={degradingCount} icon={BatteryWarning} colorClass="text-warning" />
          <StatCard label="Replace" value={replaceCount} icon={BatteryLow} colorClass="text-destructive" />
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your devices</h1>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus size={16} weight="bold" />
          Add device
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="mb-6 flex gap-2 rounded-md border border-border bg-background p-4 shadow-sm">
          <input
            autoFocus
            placeholder="Device name (e.g. Bench pack #3)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {createMutation.isError && (
        <div className="mb-4">
          <ErrorMessage
            message={createMutation.error instanceof ApiError ? createMutation.error.message : 'Something went wrong'}
          />
        </div>
      )}

      {devicesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {devicesQuery.isError && <ErrorMessage message="Could not load devices." />}

      {devicesQuery.data && devices.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-10 text-center">
          <Cube size={36} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No devices yet. Add your first device to start logging readings.</p>
        </div>
      )}

      {devices.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} />
          ))}
        </div>
      )}

      {revealedDevice && (
        <TokenRevealModal token={revealedDevice.token} onClose={() => setRevealedDevice(null)} />
      )}
    </div>
  );
}
