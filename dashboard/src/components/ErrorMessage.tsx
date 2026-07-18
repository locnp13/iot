import { WarningCircle } from '@phosphor-icons/react';

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <WarningCircle size={16} weight="fill" className="shrink-0" />
      {message}
    </div>
  );
}
