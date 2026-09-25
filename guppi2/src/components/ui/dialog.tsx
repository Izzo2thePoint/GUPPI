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
        <D.Overlay className="fixed inset-0 z-50 animate-fade-in bg-[#02040a]/70 backdrop-blur-sm" />
        <D.Content
          className={cn(
            'fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] w-[calc(100vw-32px)] -translate-x-1/2 animate-rise flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-pop focus:outline-none',
            wide ? 'max-w-3xl' : 'max-w-lg',
          )}
        >
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            {icon && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</div>}
            <div className="min-w-0 flex-1">
              <D.Title className="text-[15px] font-semibold tracking-tight">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-xs leading-relaxed text-ink-3">{description}</D.Description> : <D.Description className="sr-only">{String(title)}</D.Description>}
            </div>
            <D.Close className="rounded-lg p-1.5 text-ink-3 hover:bg-raised hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-void/30 px-5 py-3">{footer}</div>}
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
