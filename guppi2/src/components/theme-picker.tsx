import { Check } from 'lucide-react';
import { ACCENTS, themeVars, type ProbeTheme } from '@/state/theme';
import { Switch, cn } from './ui/primitives';

const swatch = (t: ProbeTheme) => themeVars(t)['--accent'];

/** Pick an accent (six presets or a custom hue) and whether surfaces take its tint. */
export function ThemePicker({ value, onChange, tint = true }: { value: ProbeTheme; onChange: (t: ProbeTheme) => void; tint?: boolean }) {
  const custom = value.accent === 'custom';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent colour">
        {ACCENTS.map((a) => {
          const on = value.accent === a.id;
          return (
            <button
              key={a.id}
              role="radio"
              aria-checked={on}
              aria-label={a.name}
              title={a.name}
              onClick={() => onChange({ ...value, accent: a.id })}
              className={cn('grid h-7 w-7 place-items-center rounded-full ring-offset-2 ring-offset-panel transition-shadow', on ? 'ring-2 ring-ink' : 'hover:ring-1 hover:ring-ink-4')}
              style={{ background: swatch({ accent: a.id }) }}
            >
              {on && <Check className="h-3.5 w-3.5" style={{ color: themeVars({ accent: a.id })['--accent-ink'] }} />}
            </button>
          );
        })}
        <button
          role="radio"
          aria-checked={custom}
          onClick={() => onChange({ ...value, accent: 'custom', hue: value.hue ?? 200 })}
          className={cn('h-7 rounded-full border px-2.5 text-xs font-medium transition-colors', custom ? 'border-ink text-ink' : 'border-line-strong text-ink-3 hover:text-ink-2')}
        >
          Custom
        </button>
      </div>
      {custom && (
        <label className="flex items-center gap-3 text-[12.5px] text-ink-3">
          Hue
          <input
            type="range"
            min={0}
            max={359}
            value={value.hue ?? 200}
            onChange={(e) => onChange({ ...value, accent: 'custom', hue: Number(e.target.value) })}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full accent-[var(--accent)]"
            style={{ background: 'linear-gradient(90deg in oklch longer hue, oklch(0.78 0.13 0), oklch(0.78 0.13 359))' }}
            aria-label="Custom hue"
          />
          <span className="num w-8 text-right text-ink-2">{value.hue ?? 200}°</span>
        </label>
      )}
      {tint && (
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span>
            Tint the panels
            <span className="block text-[12px] text-ink-3">Surfaces take a hint of this colour.</span>
          </span>
          <Switch checked={!!value.tinted} onChange={(v) => onChange({ ...value, tinted: v })} label="Tint the panels" />
        </label>
      )}
    </div>
  );
}
