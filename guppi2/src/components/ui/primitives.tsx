import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type OptgroupHTMLAttributes,
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import * as SelectPrimitive from '@radix-ui/react-select';
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
        'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 [&>svg]:shrink-0',
        {
          primary: 'bg-accent font-semibold text-accent-ink hover:bg-accent-hover active:bg-accent',
          secondary: 'border border-line-strong bg-raised text-ink hover:border-ink-4 hover:bg-hover',
          outline: 'border border-line-strong text-ink-2 hover:bg-raised hover:text-ink',
          ghost: 'text-ink-2 hover:bg-raised hover:text-ink',
          danger: 'border border-bad/40 bg-bad/12 text-bad hover:bg-bad/20',
        }[variant],
        {
          xs: 'h-7 px-2.5 text-xs',
          sm: 'h-8 px-3 text-[13px]',
          md: 'h-9 px-3.5 text-[13.5px]',
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
  return <div className={cn('surface rounded-card', className)} {...rest} />;
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
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {icon && <span className="text-ink-3 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
          {title}
        </div>
        {subtitle && <div className="mt-0.5 truncate text-xs text-ink-3">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export const CardBody = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => <div className={cn('p-5', className)} {...rest} />;

// ── Badge ────────────────────────────────────────────────────────────────
export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'info';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-raised text-ink-2 border-line-strong',
  accent: 'bg-accent-soft text-accent border-accent-line',
  ok: 'bg-ok/10 text-ok border-ok/30',
  warn: 'bg-warn/10 text-warn border-warn/30',
  bad: 'bg-bad/10 text-bad border-bad/30',
  info: 'bg-info/10 text-info border-info/30',
};

export function Badge({ tone = 'neutral', dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[11.5px] font-medium', toneClass[tone], className)}>
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
  'w-full rounded-lg border border-line-strong bg-void px-3 text-[13.5px] text-ink transition-colors hover:border-ink-4 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field, 'h-9', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(field, 'min-h-24 py-2 leading-relaxed', className)} {...rest} />;
});

// ── Select ───────────────────────────────────────────────────────────────
// A native <select> opens the operating system's own list, in its colours, so
// the open menu never matched the theme. This one is drawn by the app from the
// same tokens as everything else, while keeping the <select> API: pass
// <option> and <optgroup> children, read `e.target.value` in onChange.

type SelectOption = { kind: 'option'; value: string; label: ReactNode; disabled?: boolean };
type SelectGroup = { kind: 'group'; label: ReactNode; items: SelectOption[] };
/** Radix refuses an empty item value, so '' (the usual "Choose…" placeholder) travels as this sentinel. */
const EMPTY_VALUE = '\u0000';
const toRadix = (v: string) => (v === '' ? EMPTY_VALUE : v);
const fromRadix = (v: string) => (v === EMPTY_VALUE ? '' : v);

function readOptions(children: ReactNode): (SelectOption | SelectGroup)[] {
  const out: (SelectOption | SelectGroup)[] = [];
  const option = (el: ReactElement<OptionHTMLAttributes<HTMLOptionElement>>): SelectOption => {
    const text = el.props.children;
    const value = el.props.value ?? (typeof text === 'string' || typeof text === 'number' ? text : '');
    return { kind: 'option', value: String(value), label: text, disabled: el.props.disabled };
  };
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    if (child.type === 'option') out.push(option(child as ReactElement<OptionHTMLAttributes<HTMLOptionElement>>));
    else if (child.type === 'optgroup') {
      const g = child as ReactElement<OptgroupHTMLAttributes<HTMLOptGroupElement> & { children?: ReactNode }>;
      out.push({
        kind: 'group',
        label: g.props.label,
        items: Children.toArray(g.props.children)
          .filter((c): c is ReactElement<OptionHTMLAttributes<HTMLOptionElement>> => isValidElement(c) && c.type === 'option')
          .map(option),
      });
    } else if (child.type === Fragment) out.push(...readOptions((child.props as { children?: ReactNode }).children));
  }
  return out;
}

const selectItem =
  'relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-2.5 pr-8 text-[13px] text-ink-2 outline-none data-[highlighted]:bg-accent/15 data-[highlighted]:text-ink data-[state=checked]:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-40';

function SelectItem({ item }: { item: SelectOption }) {
  return (
    <SelectPrimitive.Item value={toRadix(item.value)} disabled={item.disabled} className={selectItem}>
      <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 inline-flex text-accent">
        <Check className="h-3.5 w-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function Select({ className, children, value, defaultValue, onChange, disabled, name, id, title, 'aria-label': ariaLabel }: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = readOptions(children);
  const controlled = value !== undefined;
  const emit = (v: string) => {
    if (!onChange) return;
    const plain = fromRadix(v);
    const target = { value: plain, name: name ?? '' } as unknown as HTMLSelectElement;
    onChange({ target, currentTarget: target, type: 'change' } as unknown as ChangeEvent<HTMLSelectElement>);
  };
  return (
    <SelectPrimitive.Root
      value={controlled ? toRadix(String(value)) : undefined}
      defaultValue={!controlled && defaultValue !== undefined ? toRadix(String(defaultValue)) : undefined}
      onValueChange={emit}
      disabled={disabled}
      name={name}
    >
      <SelectPrimitive.Trigger
        id={id}
        title={title}
        aria-label={ariaLabel}
        className={cn(field, 'inline-flex h-9 cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-default [&>span:first-child]:truncate', className)}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon className="shrink-0 text-ink-3">
          <ChevronDown className="h-3.5 w-3.5" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[70] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line-strong bg-panel text-ink shadow-pop animate-rise"
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-ink-3">
            <ChevronUp className="h-3.5 w-3.5" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o, i) =>
              o.kind === 'option' ? (
                <SelectItem key={`${o.value}-${i}`} item={o} />
              ) : (
                <SelectPrimitive.Group key={`g-${i}`}>
                  <SelectPrimitive.Label className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">{o.label}</SelectPrimitive.Label>
                  {o.items.map((it, j) => (
                    <SelectItem key={`${it.value}-${j}`} item={it} />
                  ))}
                </SelectPrimitive.Group>
              ),
            )}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-ink-3">
            <ChevronDown className="h-3.5 w-3.5" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
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
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-ink-2 transition-transform duration-150 data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-accent-ink" />
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
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-raised px-1.5 font-sans text-[11.5px] font-medium text-ink-3', className)}>
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4', className)} />;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 text-ink-4 [&>svg]:h-6 [&>svg]:w-6 [&>svg]:stroke-[1.5]">{icon}</div>}
      <div className="text-[14px] font-medium text-ink-2">{title}</div>
      {children && <div className="max-w-sm text-[13px] leading-relaxed text-ink-3">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-bad/35 bg-bad/[0.08] px-4 py-3 text-[13.5px] text-bad">
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
      <h2 className="text-[13px] font-semibold text-ink-2">{children}</h2>
      {actions}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-lg border border-line bg-void p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('h-7 rounded-md px-3 text-xs font-medium transition-colors', value === o.value ? 'bg-raised text-ink ring-1 ring-line-strong' : 'text-ink-3 hover:text-ink-2')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
