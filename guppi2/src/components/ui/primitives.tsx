import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

// ── Button ───────────────────────────────────────────────────────────────
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]',
        {
          primary:
            'bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-[#050810] shadow-[0_8px_24px_-8px_var(--accent)] hover:brightness-110',
          secondary: 'border border-line-strong bg-raised text-ink hover:bg-hover hover:border-[rgb(148_163_184/0.24)]',
          outline: 'border border-line-strong text-ink-2 hover:text-ink hover:bg-raised',
          ghost: 'text-ink-2 hover:bg-raised hover:text-ink',
          danger: 'border border-bad/30 bg-bad/10 text-bad hover:bg-bad/20',
        }[variant],
        {
          xs: 'h-7 px-2.5 text-xs',
          sm: 'h-8 px-3 text-[13px]',
          md: 'h-9 px-3.5 text-sm',
          lg: 'h-11 px-5 text-[15px]',
          icon: 'h-8 w-8 p-0',
        }[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ── Card ─────────────────────────────────────────────────────────────────
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-card animate-rise', className)} {...rest} />;
}

export function CardHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3 border-b border-line px-5 py-3.5', className)}>
      {icon && <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent [&>svg]:h-4 [&>svg]:w-4">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold tracking-tight text-ink">{title}</div>
        {subtitle && <div className="truncate text-xs text-ink-3">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export const CardBody = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => <div className={cn('p-5', className)} {...rest} />;

// ── Badge ────────────────────────────────────────────────────────────────
export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'info';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-white/[0.05] text-ink-2 border-line-strong',
  accent: 'bg-accent-soft text-accent border-[color-mix(in_oklab,var(--accent)_30%,transparent)]',
  ok: 'bg-ok/10 text-ok border-ok/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  bad: 'bg-bad/10 text-bad border-bad/25',
  info: 'bg-info/10 text-info border-info/25',
};

export function Badge({ tone = 'neutral', dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-[11px] font-medium', toneClass[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StatusDot({ tone = 'ok', pulse }: { tone?: Tone; pulse?: boolean }) {
  const color = { neutral: 'bg-ink-3', accent: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', info: 'bg-info' }[tone];
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', color)} />}
      <span className={cn('relative h-2 w-2 rounded-full', color)} />
    </span>
  );
}

// ── Form controls ────────────────────────────────────────────────────────
const field =
  'w-full rounded-[10px] border border-line-strong bg-void/60 px-3 text-sm text-ink placeholder:text-ink-4 transition-colors hover:border-[rgb(148_163_184/0.24)] focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field, 'h-9', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(field, 'min-h-24 py-2 leading-relaxed', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        field,
        'h-9 cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%236b7790%27%20stroke-width=%272.5%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, error, children, className, group }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; group?: boolean }) {
  // Groups of buttons must not sit inside a <label>: a click on any of them would
  // also be forwarded to the first button in the label.
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={cn('flex flex-col gap-1.5', className)} {...(group ? { role: 'group', 'aria-label': typeof label === 'string' ? label : undefined } : {})}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="text-xs text-bad">{error}</span> : hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </Tag>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 cursor-pointer rounded-full border border-line-strong bg-raised transition-colors data-[state=checked]:border-transparent data-[state=checked]:bg-accent"
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-ink shadow transition-transform data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-[#050810]" />
    </SwitchPrimitive.Root>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────────
export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[100] max-w-72 animate-fade-in rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 text-xs text-ink-2 shadow-pop"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;

// ── Misc ─────────────────────────────────────────────────────────────────
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-white/[0.04] px-1.5 font-sans text-[10px] font-medium text-ink-3', className)}>
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4', className)} />;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-raised text-ink-3 [&>svg]:h-5 [&>svg]:w-5">{icon}</div>}
      <div className="text-sm font-medium text-ink-2">{title}</div>
      {children && <div className="max-w-sm text-xs leading-relaxed text-ink-3">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-bad/25 bg-bad/[0.06] px-4 py-3 text-sm text-bad">
      <div className="flex-1 leading-relaxed">{error instanceof Error ? error.message : String(error)}</div>
      {onRetry && (
        <Button size="xs" variant="danger" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{children}</div>
      {actions}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-[10px] border border-line bg-void/50 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-lg px-3 text-xs font-medium transition-colors',
            value === o.value ? 'bg-raised text-ink shadow-[0_1px_0_rgb(255_255_255/0.05)_inset,0_0_0_1px_var(--color-line-strong)]' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
