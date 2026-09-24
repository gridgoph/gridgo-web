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

## Desk chime

Every fresh unread arrival plays `public/audio/notification_user.mp3`, the same chime the
legacy admin used. `src/lib/live/notificationSound.ts` owns it: bursts coalesce into one
chime, a browser refusal (no interaction yet) drops the chime and primes the element on the
next click or keypress, and rows already shown, read, older than the freshness window, or
received before the first inbox fetch never chime, so page-load replay stays silent. The Desk
panel's speaker button turns the chime off per browser (localStorage); turning it back on
plays it once as a preview.

## Desk arrival toast

The same fresh unread arrival that chimes also lands as a slip in the bottom-right corner:
the family icon tile, the event headline, the order underneath, and one **Open** that goes
where the inbox row would and marks it read. `src/lib/live/arrivalToast.ts` owns it on the
root `Toaster`: arrivals within 1.5 s fold into one "N new updates on the desk" line, the
slip dismisses itself after 8 s, and it shows whether or not the sound is on. Replayed rows,
read rows, and anything received before the first inbox fetch never toast, exactly as they
never chime. Returning to the tab now leaves a healthy stream connected (the handle's
`wake` reconnects only a dropped one) while the inbox is still reconciled on return.

## Desktop alerts

The chime and the toast only reach someone looking at the tab. A desktop alert is the same
fresh slip, raised by the operating system while the portal is hidden or behind another
window. `src/lib/live/desktopAlerts.ts` owns the rules; `public/desk-alerts-sw.js` raises the
alerts and routes their clicks.

- **Opt in only.** The Desk shows a one-time "Get desktop alerts" invitation while the
  browser has not been asked; "Not now" folds it into a standing footer line at the bottom
  of the Desk (on / off / blocked / unavailable). Permission is requested only from a
  "Turn on" press, never on load. Once granted, the footer's off/on switch is a per-browser
  preference (`gridgo-web.desktop-alerts` in localStorage) that never re-asks. A first grant
  raises one "Desktop alerts are on" alert, which also shows whether the OS is holding
  browser notifications back.
- **One announcement per slip.** `LiveProvider` offers each news arrival to the desktop
  announcer first; if it goes to the desktop, the toast stays quiet, otherwise the toast
  shows as before. The chime is unaffected (alerts are raised `silent`, so the Desk sound
  toggle still decides whether anything is heard). The worker drops an alert when any
  portal window has focus, and each alert is tagged by its row, so several open tabs raise
  one alert. Bursts inside the toast's coalescing window replace the open alert with
  "N new updates on the desk".
- **Role.** Suppliers are alerted for jobs and order changes only (`orderId`, `shop_job_*`,
  `supplier_assignment_*`); Operations and Super Admin for every row their inbox receives.
- **Click.** The worker focuses a portal tab in the alert's own route tree (or opens one) and
  posts the row back; the tab marks it read and navigates through `notificationHref`, the
  same destination as the inbox row. Only same-origin paths are accepted.
- **Degrading.** No Notification API or an insecure origin reads "unavailable"; a denied
  permission reads "blocked" with the way out; no service worker falls back to a
  page-level `Notification`, and a browser that refuses that constructor keeps the bell and
  toast.

Nothing arrives with the browser closed: that needs Web Push (VAPID keys, a subscription
endpoint and sender in `gridgo-api`), a follow-up the worker is already shaped for.

## Inbox destinations

`src/lib/live/notificationHref.ts` owns event-to-destination selection. Order rows open
`/ops/orders/:id` for Operations and `/admin/orders/:id` for Super Admin. Both mount
`OrderWorkspace`; the Super Admin back link returns to the overview. Pickup escalations
open the matching role's escalations page, including `/admin/escalations`. These Super Admin
destinations are inbox workspaces, not rail items, and stay within its authorized route tree.
Payout releases open the Operations payout desk (`/ops/payouts/:id`); Super Admin has no
payout tree, so its copy opens the order.

Operations approvals and Super Admin verification mount the same sign-up and service-line
queues. Service-review links select `?tab=services`; sign-up links select the default tab.
Tab selection follows the URL so an inbox link can switch an already-open queue. Both route
components wrap their search-parameter consumers in Suspense for production rendering.
