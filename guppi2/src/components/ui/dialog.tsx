import { useState, type ReactNode } from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button, Input, cn } from './primitives';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
  icon,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  icon?: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 animate-fade-in bg-void/80" />
        <D.Content
          className={cn(
            'fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] w-[calc(100vw-32px)] -translate-x-1/2 animate-rise flex-col overflow-hidden rounded-xl border border-line-strong bg-panel shadow-pop focus:outline-none',
            // Phones: a bottom sheet that respects the home indicator.
            'max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[88dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)]',
            wide ? 'max-w-3xl' : 'max-w-lg',
          )}
        >
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <D.Title className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.01em]">
                {icon && <span className="text-accent [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
                {title}
              </D.Title>
              {description ? <D.Description className="mt-1 text-[13px] leading-relaxed text-ink-3">{description}</D.Description> : <D.Description className="sr-only">{String(title)}</D.Description>}
            </div>
            <D.Close className="rounded-lg p-1.5 text-ink-3 hover:bg-raised hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-chrome px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** A confirmation that optionally requires typing a phrase (for destructive actions). */
export function Confirm({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  phrase,
  disabled,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  phrase?: string;
  disabled?: boolean;
  onConfirm: () => unknown;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = !phrase || typed.trim() === phrase;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setTyped('');
        onOpenChange(v);
      }}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={!ready || disabled}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
                setTyped('');
              } catch {
                /* The action reports its own error; keep the dialog open. */
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-ink-2">
        {body}
        {phrase && (
          <div className="space-y-1.5">
            <div className="text-xs text-ink-3">
              Type <span className="num rounded bg-raised px-1.5 py-0.5 text-ink">{phrase}</span> to confirm.
            </div>
            <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
      </div>
    </Dialog>
  );
}
