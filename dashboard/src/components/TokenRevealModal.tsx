import { useState } from 'react';

export function TokenRevealModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-md border border-border bg-background p-5 shadow-lg">
        <h2 className="text-base font-semibold">Device token</h2>
        <p className="mt-2 text-sm text-warning">
          This token is shown only once. Copy it into the device firmware now — it cannot be retrieved again.
        </p>
        <code className="mt-3 block break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
          {token}
        </code>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={copy}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
