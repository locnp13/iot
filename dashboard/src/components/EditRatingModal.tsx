import { useState } from 'react';

export function EditRatingModal({
  currentRNew,
  currentREol,
  isPending,
  onSave,
  onClose,
}: {
  currentRNew: number | null;
  currentREol: number | null;
  isPending: boolean;
  onSave: (rNew: number, rEol?: number) => void;
  onClose: () => void;
}) {
  const [rNew, setRNew] = useState(currentRNew !== null ? String(currentRNew) : '');
  const [rEol, setREol] = useState(currentREol !== null ? String(currentREol) : '');

  const parsedRNew = Number(rNew);
  const canSave = rNew.trim() !== '' && Number.isFinite(parsedRNew) && parsedRNew > 0;

  function submit() {
    if (!canSave) return;
    const parsedREol = rEol.trim() !== '' ? Number(rEol) : undefined;
    onSave(parsedRNew, parsedREol);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-md border border-border bg-background p-5 shadow-lg">
        <h2 className="text-base font-semibold">Edit battery rating</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Used to compute SOH% — how this battery's current internal resistance compares to a
          manufacturer-rated new battery.
        </p>

        <label className="mt-4 block text-sm font-medium">
          R_new (Ω)
          <input
            type="number"
            step="any"
            min="0"
            value={rNew}
            onChange={(e) => setRNew(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </label>

        <label className="mt-3 block text-sm font-medium">
          R_eol (Ω) <span className="font-normal text-muted-foreground">— optional, defaults to 2× R_new</span>
          <input
            type="number"
            step="any"
            min="0"
            value={rEol}
            onChange={(e) => setREol(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={isPending || !canSave}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
