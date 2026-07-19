import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { X, Pulse, Stack, WifiSlash, ArrowRight } from '@phosphor-icons/react';
import { api } from '../lib/apiClient';
import { useCurrentUser } from '../lib/useCurrentUser';
import { useDocumentVisible } from '../lib/useDocumentVisible';

const POLL_INTERVAL_MS = 5000;
const TOAST_DURATION_MS = 5000;
const EXIT_ANIMATION_MS = 200;

type ToastItem =
  | { id: string; kind: 'single'; navigateTo: string; deviceName: string; rIntLabel: string; leaving?: boolean }
  | { id: string; kind: 'batch'; navigateTo: string; count: number; leaving?: boolean };

function Toast({ toast, onClick, onDismiss }: { toast: ToastItem; onClick: () => void; onDismiss: () => void }) {
  return (
    <div
      className={[
        'flex w-full items-start gap-3 rounded-lg border border-l-4 border-border/80 border-l-primary bg-background/95 p-3.5 shadow-xl backdrop-blur-sm',
        'motion-reduce:animate-none',
        toast.leaving ? 'animate-[toast-out_0.2s_ease-in_forwards]' : 'animate-[toast-in_0.25s_ease-out]',
      ].join(' ')}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        {toast.kind === 'single' ? <Pulse size={18} weight="bold" /> : <Stack size={18} weight="bold" />}
      </div>

      <button onClick={onClick} className="group min-w-0 flex-1 text-left">
        {toast.kind === 'single' ? (
          <>
            <div className="truncate text-sm font-medium text-foreground">{toast.deviceName}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              Reading mới
              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary">
                Rint {toast.rIntLabel}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-medium text-foreground">{toast.count} thiết bị vừa có dữ liệu mới</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary">
              Xem tất cả
              <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </div>
          </>
        )}
      </button>

      <button
        onClick={onDismiss}
        aria-label="Đóng thông báo"
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}

export function NotificationCenter() {
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const isVisible = useDocumentVisible();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastSeenReadingId = useRef<Map<number, number | null>>(new Map());
  const autoDismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const removeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: api.listDevices,
    enabled: !!user,
    refetchInterval: isVisible ? POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const autoTimers = autoDismissTimers.current;
    const cleanupTimers = removeTimers.current;
    return () => {
      for (const timer of autoTimers.values()) clearTimeout(timer);
      for (const timer of cleanupTimers.values()) clearTimeout(timer);
    };
  }, []);

  function removeToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    removeTimers.current.delete(id);
  }

  // Two-phase dismiss: mark "leaving" to play the exit animation, then remove from the DOM
  // once it's finished — an instant filter() would cut the animation off before it plays.
  function startDismiss(id: string) {
    const autoTimer = autoDismissTimers.current.get(id);
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoDismissTimers.current.delete(id);
    }
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    removeTimers.current.set(id, setTimeout(() => removeToast(id), EXIT_ANIMATION_MS));
  }

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

    const id = crypto.randomUUID();
    const toast: ToastItem =
      changed.length === 1
        ? {
            id,
            kind: 'single',
            navigateTo: `/devices/${changed[0].id}`,
            deviceName: changed[0].name,
            rIntLabel: `${changed[0].rInt.toFixed(1)}mΩ`,
          }
        : { id, kind: 'batch', navigateTo: '/devices', count: changed.length };

    setToasts((prev) => [...prev, toast]);
    autoDismissTimers.current.set(id, setTimeout(() => startDismiss(id), TOAST_DURATION_MS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devicesQuery.data]);

  function handleToastClick(toast: ToastItem) {
    startDismiss(toast.id);
    navigate(toast.navigateTo);
  }

  if (!user) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:right-6 sm:bottom-6"
      aria-live="polite"
      role="status"
    >
      {devicesQuery.isError && (
        <div className="flex w-full items-center gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs font-medium text-warning shadow-xl backdrop-blur-sm">
          <WifiSlash size={16} weight="bold" />
          Mất kết nối — thông báo có thể không cập nhật
        </div>
      )}

      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          toast={toast}
          onClick={() => handleToastClick(toast)}
          onDismiss={() => startDismiss(toast.id)}
        />
      ))}
    </div>
  );
}
