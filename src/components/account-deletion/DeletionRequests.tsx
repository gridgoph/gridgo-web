"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { listAccountDeletionRequests, completeAccountDeletionRequest } from '@/lib/api/client';
import type { AccountDeletionRequest } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { useLiveReload } from '@/lib/live/useLiveReload';

export function DeletionRequests() {
  const [status, setStatus] = useState<'pending' | 'done'>('pending');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AccountDeletionRequest[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AccountDeletionRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError('');
    try {
      const result = await listAccountDeletionRequests(status, offset);
      if (sequence.current !== current) return;
      setRows(result.requests); setNext(result.nextOffset);
    } catch { if (sequence.current === current) setError('Could not load deletion requests. Try again.'); }
    finally { if (sequence.current === current) setLoading(false); }
  }, [status, offset]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  useLiveReload('account-deletion-requests', load);
  async function complete() {
    if (!selected || saving) return;
    setSaving(true); setSaveError('');
    try { await completeAccountDeletionRequest(selected.id); setSelected(null); await load(); }
    catch { setSaveError('Could not mark this request done. Try again.'); }
    finally { setSaving(false); }
  }
  const columns: DataTableColumn<AccountDeletionRequest>[] = [
    { id: 'contact', header: 'Contact', primary: true, cell: (r) => <span className="break-all">{r.contactEmail || 'Contact unavailable'}</span> },
    { id: 'source', header: 'Requested from', cell: (r) => r.source === 'app' ? 'Signed-in app' : 'Website · verify ownership' },
    { id: 'requested', header: 'Requested', cell: (r) => formatDateTime(r.requestedAt) },
    { id: 'due', header: status === 'pending' ? 'Complete by' : 'Completed', cell: (r) => formatDateTime(status === 'pending' ? r.dueAt : r.completedAt) },
  ];
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-h2">Account deletion</h1><p className="text-body text-text-secondary max-w-prose">Complete requests within 30 days. Mark done only after manually deleting sign-in and personal data under the approved retention rules.</p></div>
      <Button onClick={() => void load()} disabled={loading}>Refresh</Button>
    </div>
    <ToggleGroup aria-label="Request status" value={[status]} onValueChange={(values) => { if (values[0] === 'pending' || values[0] === 'done') { setStatus(values[0]); setOffset(0); } }} variant="outline">
      <ToggleGroupItem value="pending">Pending</ToggleGroupItem><ToggleGroupItem value="done">Completed</ToggleGroupItem>
    </ToggleGroup>
    {error ? <ErrorState body={error} action={<Button onClick={() => void load()}>Try again</Button>} /> : <DataTable data={rows} columns={columns} getRowId={(r) => r.id} loading={loading} caption="Account deletion requests" pageSize={100} rowActions={status === 'pending' ? (r) => <Button onClick={() => { setSelected(r); setSaveError(''); }}>Mark done</Button> : undefined} empty={<EmptyState title={status === 'pending' ? 'No pending requests' : 'No completed requests'} body="Requests from the apps and website appear here. Refresh to check for updates." />} />}
    <div className="flex flex-wrap gap-2"><Button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Previous page</Button><Button disabled={loading || next === null} onClick={() => { if (next !== null) setOffset(next); }}>Next page</Button></div>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !saving) setSelected(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Has deletion been completed?</DialogTitle><DialogDescription>Verify ownership for website requests. Confirm that sign-in and personal data have been deleted manually, with only approved records retained. This button only updates the request status.</DialogDescription></DialogHeader>
        <p className="break-all">{selected?.contactEmail || 'Contact unavailable'}</p>
        {saveError && <p role="alert">{saveError}</p>}
        <DialogFooter><Button disabled={saving} onClick={() => setSelected(null)}>Cancel</Button><Button disabled={saving} onClick={() => void complete()}>{saving ? 'Saving…' : 'Confirm deletion completed'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
