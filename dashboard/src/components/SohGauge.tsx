import { useState } from 'react';
import { Info } from '@phosphor-icons/react';

const RADIUS = 30;
const STROKE = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Band = 'success' | 'warning' | 'destructive';

function bandFor(soh: number): Band {
  if (soh >= 70) return 'success';
  if (soh >= 40) return 'warning';
  return 'destructive';
}

const RING_CLASS: Record<Band, string> = {
  success: 'stroke-success',
  warning: 'stroke-warning',
  destructive: 'stroke-destructive',
};

const TEXT_CLASS: Record<Band, string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/** Battery State of Health, shown as a radial gauge with a formula disclosure —
 * distinct visual language from HealthBadge's status pill (baseline-drift vs. absolute quality). */
export function SohGauge({
  soh,
  rInt,
  rNew,
  rEol,
}: {
  soh: number | null;
  rInt: number;
  rNew: number | null;
  rEol: number | null;
}) {
  const [showFormula, setShowFormula] = useState(false);
  const isRated = typeof soh === 'number';
  const band = isRated ? bandFor(soh) : null;
  const offset = isRated ? CIRCUMFERENCE * (1 - soh / 100) : CIRCUMFERENCE;

  return (
    <div className="relative flex items-center gap-1">
      <div
        className="relative h-16 w-16 shrink-0"
        role="img"
        aria-label={isRated ? `State of health: ${Math.round(soh)} percent` : 'State of health: not rated'}
      >
        <svg viewBox="0 0 72 72" className="h-16 w-16 -rotate-90">
          <circle cx="36" cy="36" r={RADIUS} strokeWidth={STROKE} className="fill-none stroke-muted" />
          {isRated && (
            <circle
              cx="36"
              cy="36"
              r={RADIUS}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              className={`fill-none transition-[stroke-dashoffset] duration-500 ${RING_CLASS[band!]}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isRated ? (
            <>
              <span data-testid="soh-value" className={`text-lg font-bold tabular-nums ${TEXT_CLASS[band!]}`}>
                {Math.round(soh)}%
              </span>
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">SOH</span>
            </>
          ) : (
            <span data-testid="soh-value" className="text-xs font-medium text-muted-foreground">
              Not rated
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowFormula((v) => !v)}
        aria-label="How is SOH calculated?"
        aria-expanded={showFormula}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Info size={16} />
      </button>

      {showFormula && (
        <div
          role="tooltip"
          className="absolute top-0 left-full z-10 ml-2 w-72 rounded-md border border-border bg-background p-3 text-xs shadow-lg"
        >
          <p className="font-semibold text-foreground">State of Health (SOH)</p>
          <p className="mt-1 text-muted-foreground">
            How much this battery has left compared to a brand-new one, based on internal resistance (R_int).
          </p>
          <code className="mt-2 block rounded bg-muted px-2 py-1 font-mono">
            SOH = (R_eol − R_int) / (R_eol − R_new) × 100
          </code>
          {isRated && typeof rNew === 'number' && typeof rEol === 'number' ? (
            <p className="mt-2 text-muted-foreground">
              This reading: ({rEol} − {rInt}) / ({rEol} − {rNew}) × 100 ={' '}
              <span className="font-medium text-foreground">{Math.round(soh)}%</span>
            </p>
          ) : (
            <p className="mt-2 text-muted-foreground">
              This device has no rated R_new/R_eol yet — use "Edit rating" to enable SOH tracking.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
