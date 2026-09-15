# Live resource updates

## Workspace context and transport

The app sends its active workspace as `X-GRIDGO-Role` on ordinary API requests;
`/auth/me` remains identity-wide and role projections send their fixed role explicitly.
Notification list, stream, and read-all also share an explicit `role` query parameter.
The API must verify membership and record access; selecting a workspace never grants access.
The local API proxy forwards the role and idempotency headers.

`LiveProvider` owns one Clerk-bearer SSE connection per signed-in tab and workspace.
Account or workspace changes replace that provider, clearing its inbox and rejecting late
responses. Identity events refresh `/auth/me` and revalidate the mounted role projection.
The authenticated stream carries both inbox notifications and minimal resource invalidations.

## Refresh and recovery

The Desk inbox shows **Floor live** while connected and **Reconnecting** otherwise.
Reconnects refresh the inbox, identity, and subscribed pages. Returning to the foreground
wakes the stream and reconciles the inbox. While disconnected, subscribed pages also refresh
on foreground return and poll as a fallback. Existing Refresh buttons remain available.

`useLiveReload` coalesces matching events and permits one follow-up refresh during a load.
Pages using `useSerializedLoad` share that boundary with initial and manual loads: there is
one running request and at most one pending callback, replaced by the latest invocation.
Request deadlines cover token acquisition, headers, and body reads; the SSE connection has
a separate inactivity watchdog. Timing constants live in the implementation.

Inbox reconciliation merges arrivals received during a fetch and preserves successful read
and delete actions completed after that fetch began. An unavailable resume cursor triggers
a fresh inbox fetch before reconnecting.

Refresh backing data without reinitializing in-progress form drafts. Supplier listing and
option-price drafts retain their originating versions for conflict detection; a saved option
price stays visible as entered if its reconciliation request fails. Definitive access denial
or deletion still removes the supplier editor. Print-job example text stays mounted during
background refresh. These boundaries are covered by the catalogue editor tests; load and
inbox reconciliation tests live under `src/lib/live/__tests__/`.

## Inbox destinations

`src/lib/live/notificationHref.ts` owns event-to-destination selection. Order rows open
`/ops/orders/:id` for Operations and `/admin/orders/:id` for Super Admin. Both mount
`OrderWorkspace`; the Super Admin back link returns to the overview. Pickup escalations
open the matching role's escalations page, including `/admin/escalations`. These Super Admin
destinations are inbox workspaces, not rail items, and stay within its authorized route tree.

Operations approvals and Super Admin verification mount the same sign-up and service-line
queues. Service-review links select `?tab=services`; sign-up links select the default tab.
Tab selection follows the URL so an inbox link can switch an already-open queue. Both route
components wrap their search-parameter consumers in Suspense for production rendering.
