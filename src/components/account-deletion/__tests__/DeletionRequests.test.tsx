// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DeletionRequests } from '../DeletionRequests';
vi.stubGlobal('React', React);
const { list, complete } = vi.hoisted(() => ({ list: vi.fn(), complete: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ listAccountDeletionRequests: list, completeAccountDeletionRequest: complete }));
vi.mock('@/lib/live/useLiveReload', () => ({ useLiveReload: vi.fn() }));
const row = { id: 'request-test', userId: null, contactEmail: 'account@example.test', source: 'web', status: 'pending', requestedAt: '2026-10-07T00:00:00Z', dueAt: '2026-11-06T00:00:00Z', completedAt: null, completedBy: null };
beforeEach(() => { list.mockReset().mockResolvedValue({ requests: [row], nextOffset: null }); complete.mockReset().mockResolvedValue({ request: { ...row, status: 'done' } }); });
afterEach(cleanup);
it('requires an explicit manual deletion confirmation before marking done', async () => {
  render(<DeletionRequests />);
  await screen.findAllByText('account@example.test');
  fireEvent.click(screen.getAllByRole('button', { name: 'Mark done' })[0]);
  expect(complete).not.toHaveBeenCalled();
  expect(screen.getByText(/Verify ownership/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion completed' }));
  await waitFor(() => expect(complete).toHaveBeenCalledWith('request-test'));
});
it('keeps a failed completion open for retry', async () => {
  complete.mockRejectedValue(new Error('offline'));
  render(<DeletionRequests />);
  await screen.findAllByText('account@example.test');
  fireEvent.click(screen.getAllByRole('button', { name: 'Mark done' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion completed' }));
  expect(await screen.findByText(/Could not mark this request done/)).toBeInTheDocument();
});
it('switches to completed requests and loads the next page', async () => {
  list.mockResolvedValue({ requests: [row], nextOffset: 100 });
  render(<DeletionRequests />);
  fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(list).toHaveBeenCalledWith('pending', 100));
  fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
  await waitFor(() => expect(list).toHaveBeenCalledWith('done', 0));
});
