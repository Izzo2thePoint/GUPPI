import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FilePlus2, Save, Search, Trash2 } from 'lucide-react';
import { useGame } from '@/state/session';
import { keys, useAction, useLogbook, useSelectedProbeId } from '@/state/hooks';
import { fmtRelative, fmtTime } from '@/core/format';
import { Button, Card, Empty, ErrorNote, Input, Skeleton, Textarea, cn } from '@/components/ui/primitives';
import { Confirm } from '@/components/ui/dialog';
import { Page, PageHeader } from '@/components/shared';

const DRAFT = (probeId: string, page: string) => `guppi2.logdraft.${probeId}.${page}`;
const readDraft = (k: string) => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as { title: string; content: string }) : null;
  } catch {
    return null;
  }
};

export default function Logbook() {
  const probeId = useSelectedProbeId();
  const game = useGame();
  const list = useLogbook(probeId);
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pages = useMemo(() => (list.data?.pages ?? []).filter((p) => p.title.toLowerCase().includes(query.toLowerCase())), [list.data, query]);
  const active = selected ?? pages[0]?.id ?? null;

  const page = useQuery({
    queryKey: keys.page(probeId, String(active)),
    queryFn: ({ signal }) => game.logbookPage(probeId, String(active), { signal }),
    enabled: !!active && active !== 'new',
  });

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);

  // Load the page (or an unsaved local draft, which always wins).
  useEffect(() => {
    if (!active) return;
    const draft = readDraft(DRAFT(probeId, String(active)));
    if (draft) {
      setTitle(draft.title);
      setContent(draft.content);
      setDirty(true);
    } else if (active === 'new') {
      setTitle('');
      setContent('');
      setDirty(false);
    } else if (page.data) {
      setTitle(page.data.title);
      setContent(page.data.content ?? '');
      setDirty(false);
    }
  }, [active, page.data, probeId]);

  // Autosave drafts locally so nothing is lost on a crash or refresh.
  useEffect(() => {
    if (!dirty || !active) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT(probeId, String(active)), JSON.stringify({ title, content }));
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [title, content, dirty, active, probeId]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT(probeId, String(active)));
    } catch {
      /* ignore */
    }
    setDirty(false);
  };

  const save = useAction(
    async () => {
      if (active === 'new') {
        const r = (await game.createPage(probeId, { title: title.trim(), content })) as { page?: { id?: unknown } };
        clearDraft();
        if (r?.page?.id !== undefined) setSelected(String(r.page.id));
        return r;
      }
      const r = await game.updatePage(probeId, String(active), { title: title.trim(), content });
      clearDraft();
      return r;
    },
    { label: 'Saving page…', success: 'Page saved', invalidate: [keys.logbook(probeId), keys.page(probeId, String(active))] },
  );
  const remove = useAction(() => game.deletePage(probeId, String(active)), { label: 'Deleting page…', success: 'Page deleted', invalidate: [keys.logbook(probeId)] });

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <Page>
      <PageHeader
        title="Logbook"
        subtitle="Your in-game journal. Drafts autosave on this computer until you save them to the game."
        actions={<Button variant="primary" size="sm" icon={<FilePlus2 className="h-3.5 w-3.5" />} onClick={() => setSelected('new')}>New page</Button>}
      />
      {list.error && <ErrorNote error={list.error} onRetry={() => list.refetch()} />}
      <Card className="grid min-h-[600px] overflow-hidden lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col border-b border-line lg:border-b-0 lg:border-r">
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
              <Input className="pl-8" placeholder="Search titles" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {list.isLoading && <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
            {selected === 'new' && <div className="mb-1 rounded-lg bg-raised px-3 py-2.5 text-sm font-medium">{title || 'Untitled page'}</div>}
            {pages.map((p) => (
              <button key={p.id} onClick={() => setSelected(p.id)} className={cn('w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-raised', active === p.id && 'bg-raised')}>
                <div className="truncate text-sm font-medium">{p.title}</div>
                <div className="text-[12px] text-ink-4">
                  {fmtRelative(p.updatedAt ?? p.createdAt)}
                  {readDraft(DRAFT(probeId, p.id)) && <span className="ml-2 text-warn">· draft</span>}
                </div>
              </button>
            ))}
            {list.data && !pages.length && selected !== 'new' && <Empty icon={<BookOpen />} title="No pages yet" />}
          </div>
        </div>
        <div className="flex flex-col">
          {active ? (
            <>
              <div className="flex items-center gap-2 border-b border-line px-6 py-3">
                <div className="text-xs text-ink-3">
                  {active === 'new' ? 'New page' : page.data?.updatedAt ? `Last saved ${fmtTime(page.data.updatedAt)}` : ''}
                  {dirty && <span className="ml-2 text-warn">Unsaved changes (draft kept locally)</span>}
                </div>
                <div className="flex-1" />
                {active !== 'new' && (
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete(true)}>Delete</Button>
                )}
                {dirty && active !== 'new' && (
                  <Button size="sm" variant="ghost" onClick={() => { clearDraft(); void page.refetch(); if (page.data) { setTitle(page.data.title); setContent(page.data.content ?? ''); } }}>
                    Discard
                  </Button>
                )}
                <Button size="sm" variant="primary" icon={<Save className="h-3.5 w-3.5" />} disabled={!title.trim() || !dirty} loading={save.isPending} onClick={() => save.mutate(undefined)}>
                  Save
                </Button>
              </div>
              {page.isLoading ? (
                <div className="space-y-3 p-6"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-64" /></div>
              ) : (
                <div className="flex flex-1 flex-col px-6 py-5">
                  <input
                    value={title}
                    onChange={(e) => (setTitle(e.target.value), setDirty(true))}
                    placeholder="Page title"
                    className="bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-ink-4"
                  />
                  <Textarea
                    value={content}
                    onChange={(e) => (setContent(e.target.value), setDirty(true))}
                    placeholder="Captain’s log, stardate…"
                    className="mt-4 flex-1 resize-none border-none bg-transparent px-0 text-[15px] leading-7 text-ink-2 focus:ring-0"
                  />
                  <div className="mt-2 text-right text-[12px] text-ink-4">{words} words</div>
                </div>
              )}
            </>
          ) : (
            <Empty icon={<BookOpen />} title="Start your first page" action={<Button onClick={() => setSelected('new')}>New page</Button>} />
          )}
        </div>
      </Card>
      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        danger
        title="Delete this page?"
        body="The page is removed from the game’s logbook."
        confirmLabel="Delete page"
        onConfirm={async () => {
          await remove.mutateAsync(undefined);
          clearDraft();
          setSelected(null);
        }}
      />
    </Page>
  );
}
