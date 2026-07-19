import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { X, WifiSlash } from '@phosphor-icons/react';
import { api } from '../lib/apiClient';
import { useCurrentUser } from '../lib/useCurrentUser';
import { useDocumentVisible } from '../lib/useDocumentVisible';

const POLL_INTERVAL_MS = 5000;
const TOAST_DURATION_MS = 5000;

interface Toast {
  id: string;
  message: string;
  navigateTo: string;
}

export function NotificationCenter() {
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const isVisible = useDocumentVisible();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastSeenReadingId = useRef<Map<number, number | null>>(new Map());
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: api.listDevices,
    enabled: !!user,
    refetchInterval: isVisible ? POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const timers = dismissTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const devices = devicesQuery.data;
    if (!devices) return;

    const changed: { id: number; name: string; rInt: number }[] = [];

    for (const device of devices) {
      const previousReadingId = lastSeenReadingId.current.get(device.id);
      const currentReadingId = device.latestReading?.id ?? null;

      // First time seeing this device (whether on initial load or added later) — record its
      // current state as the baseline, without notifying. Only reactions to LATER changes count.
      if (previousReadingId === undefined) {
        lastSeenReadingId.current.set(device.id, currentReadingId);
        continue;
      }

      if (currentReadingId !== previousReadingId) {
        lastSeenReadingId.current.set(device.id, currentReadingId);
        if (device.latestReading) {
          changed.push({ id: device.id, name: device.name, rInt: device.latestReading.rInt });
        }
      }
    }

    if (changed.length === 0) return;

    const message =
      changed.length === 1
        ? `${changed[0].name} vừa có reading mới (Rint: ${changed[0].rInt.toFixed(1)}mΩ)`
        : `${changed.length} thiết bị vừa có dữ liệu mới`;
    const navigateTo = changed.length === 1 ? `/devices/${changed[0].id}` : '/devices';

    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, navigateTo }]);
    dismissTimers.current.set(
      id,
      setTimeout(() => dismissToast(id), TOAST_DURATION_MS),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devicesQuery.data]);

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = dismissTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      dismissTimers.current.delete(id);
    }
  }

  function handleToastClick(toast: Toast) {
    dismissToast(toast.id);
    navigate(toast.navigateTo);
  }

  if (!user) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite" role="status">
      {devicesQuery.isError && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow-lg">
          <WifiSlash size={14} className="text-destructive" />
          Mất kết nối — thông báo có thể không cập nhật
        </div>
      )}

      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm shadow-lg"
        >
          <button onClick={() => handleToastClick(toast)} className="flex-1 text-left hover:underline">
            {toast.message}
          </button>
          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Đóng thông báo"
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
