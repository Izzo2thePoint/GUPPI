import { useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { catalog, compile, type Operation } from '@/core/catalog';
import type { Manny } from '@/core/models';
import { claimsFor } from '@/core/claims';
import { useGame } from '@/state/session';
import { keys, useAction, useSector } from '@/state/hooks';
import { pickersForAction, usePickers } from '@/state/pickers';
import type { MannyTask } from '@/core/game';
import { Dialog } from './ui/dialog';
import { Badge, Button, ErrorNote, Field, Select } from './ui/primitives';
import { SchemaForm } from './schema-form';

const PREFIX = 'POST /api/probe/{probeId}/mannies/{mannyId}/';
export const MANNY_ACTIONS: (Operation & { action: string })[] = catalog
  .filter((o) => o.id.startsWith(PREFIX))
  .map((o) => ({ ...o, action: o.id.slice(PREFIX.length) }))
  .sort((a, b) => a.title.localeCompare(b.title));

/** Tasks accepted by the atomic batch endpoint. */
const BATCHABLE = new Set<string>(
  ((catalog.find((o) => o.id === 'POST /api/probe/{probeId}/mannies/tasks')?.schema.properties?.tasks?.items?.properties?.task?.enum ?? []) as string[]),
);

export function OrderDialog({
  open,
  onOpenChange,
  probeId,
  mannies,
  initialAction,
  initialBody,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  probeId: string;
  mannies: Manny[];
  initialAction?: string;
  initialBody?: Record<string, unknown>;
}) {
  const game = useGame();
  const pickers = usePickers(probeId);
  const sector = useSector(probeId);
  const [action, setAction] = useState(initialAction ?? 'craft');
  const [body, setBody] = useState<Record<string, unknown>>(initialBody ?? {});
  const op = MANNY_ACTIONS.find((a) => a.action === action);
  const batch = mannies.length > 1;

  const validation = useMemo(() => {
    if (!op) return 'Choose an order.';
    if (batch && !BATCHABLE.has(action)) return 'This order cannot be assigned to several Mannies at once.';
    try {
      compile({ operation: op.id, params: { probeId, mannyId: mannies[0]?.id ?? 'x' }, body: op.body === null ? undefined : body });
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [op, body, probeId, mannies, batch, action]);

  const send = useAction(
    async () => {
      if (!op) return;
      if (batch)
        return game.assignTasks(
          probeId,
          mannies.map((m) => ({ mannyId: m.id, task: action as MannyTask, payload: body })),
        );
      return game.mannyAction(probeId, mannies[0].id, action, op.body === null ? undefined : body);
    },
    () => ({
      label: batch ? `Assigning ${op?.title.toLowerCase()} to ${mannies.length} Mannies…` : `${mannies[0]?.name}: ${op?.title.toLowerCase()}…`,
      success: batch ? 'Orders accepted' : `${mannies[0]?.name} accepted the order`,
      invalidate: [keys.mannies(probeId), keys.probe(probeId), keys.sector(probeId)],
      claim: batch
        ? { operation: 'POST /api/probe/{probeId}/mannies/tasks', probeId, body: { tasks: mannies.map((m) => ({ mannyId: m.id })) } }
        : { operation: op?.id ?? '', probeId, params: { mannyId: mannies[0]?.id }, body },
    }),
  );

  const claims = op ? claimsFor(op.id, { mannyId: mannies[0]?.id }, body) : [];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      icon={<Send />}
      title={batch ? `Order ${mannies.length} Mannies` : `Order ${mannies[0]?.name ?? 'Manny'}`}
      description={op?.description?.split('\n')[0] || op?.title}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!!validation}
            loading={send.isPending}
            onClick={() =>
              send.mutate(undefined, {
                onSuccess: () => {
                  onOpenChange(false);
                  setBody({});
                },
              })
            }
          >
            Send order
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Order">
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setBody({});
            }}
          >
            {MANNY_ACTIONS.filter((a) => !batch || BATCHABLE.has(a.action)).map((a) => (
              <option key={a.action} value={a.action}>
                {a.title}
              </option>
            ))}
          </Select>
        </Field>
        {op && op.body !== null && <SchemaForm schema={op.schema} value={body} onChange={setBody} pickers={pickersForAction(pickers, sector.data?.sector, action, body)} hide={['resource', 'percent']} />}
        {op && op.body === null && <div className="text-sm text-ink-3">No further details needed.</div>}
        {claims.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
            Reserves:
            {claims.map((c) => (
              <Badge key={c.key} tone="neutral">
                {c.key}
              </Badge>
            ))}
          </div>
        )}
        {validation && Object.keys(body).length > 0 && <ErrorNote error={validation} />}
      </div>
    </Dialog>
  );
}
