# AGENTS.md — GRIDGO Web Portal

Guidance for any agent or human picking up this codebase.

## What this is

A single Next.js (App Router) portal for three roles: `supplier`, `ops_admin`, `super_admin`. Shared design system, API client, and auth. The signed-in role decides which route tree exists.

Mobile apps (client / supplier / rider) are separate repos. Do not invent a parallel product identity here.

**Operations is a required participant in the order flow, not an observer.** A client's 75% downpayment waits for a person here to confirm the money arrived; until they do, the order physically cannot progress. `/ops/payments` is that screen, and it is the reason this portal exists rather than being a dashboard.

The operational model is v2. Its contract is `gridgo-api/docs/OPERATIONAL_MODEL_V2_API.md`; the captain's reasoning is in `/home/kali/firstmate/data/gridgo-operational-model-v2.md`. Read the contract before changing anything that touches money, states, or roles.

## Commands

```bash
npm run dev          # http://localhost:3000
npm run build        # production build (must pass before PR)
npm run typecheck
npm run lint
npm test
```

API base: `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8787`).
`next dev` does **not** let the browser CORS-hit that origin — see Local sign-in.

Demo logins, password is the API's `DEMO_PASSWORD` (`Ilovegridgo-0990` in `gridgo-api/src/demo-fixtures.js`):

- `supplier@gridgo.ph`
- `ops@gridgo.ph`
- `admin@gridgo.ph`

## Layout of the code

| Path | Owns |
|---|---|
| `src/lib/api/client.ts` | Typed HTTP client — **only** place pages call `fetch` for the API |
| `src/app/api/gridgo/[...path]/route.ts` | Local-dev same-origin proxy to a loopback API (strips `Origin`) |
| `src/lib/api/types.ts` | Response/request types (no `any`) |
| `src/lib/api/constraints.ts` | Server rules the UI can explain *before* rejection (payment/milestone gates, holds, issue window) |
| `src/lib/nav.ts` | **Single** role→nav structure (`ROLE_NAV`); AppShell reads this only |
| `src/lib/auth/` | Session cookies, AuthProvider, sign-in/out |
| `src/middleware.ts` | Role-path gate (supplier / ops / admin prefixes) |
| `src/lib/order-state.ts` | Plain-language state labels (no snake_case on screen) |
| `src/lib/supplier-actions.ts` | Valid supplier transitions for current state |
| `src/lib/ops-actions.ts` | Valid ops transitions + queue membership |
| `src/components/ui/` | shadcn/ui primitives + GRIDGO-specific components |
| `src/components/shell/` | App shell, nav rail, RoleGate, `ComingNext` placeholders |
| `src/app/supplier/` | Supplier partner surfaces |
| `src/app/ops/` | Operations surfaces — overview, QA, **payment confirmations**, matching, sign-up approvals, dispatch, **pickup escalations**, **milestone payouts**, claims, recovery, schedule, settings, audit |
| `src/app/ops/_lib/` | Ops-only pure helpers (payment queue, overview buckets, matching explainers, location freshness, schedule events, error copy) — tests under `_lib/__tests__` |
| `src/components/orders/` | Order-shaped views: `MoneyBreakdown` (ops/super **only**), `PaymentSummary`, `MilestoneList`, `OrderMeta`, `Timeline` |
| `src/app/admin/` | Super Admin surfaces — including `broadcast`, the push megaphone |
| `src/app/admin/_lib/broadcasts.ts` | Broadcast rules: destination allow-list, lock-screen budget, resend detection, delivery reading |
| `src/app/globals.css` | Design tokens + shadcn semantic CSS variables |
| `components.json` | shadcn CLI config (style: `base-nova`, Base UI) |
| `.agents/skills/shadcn/` | Committed shadcn agent skill — use it for UI work |

## Design tokens

Ported from `gridgo-client/constants/theme.ts` and `global.css`.

- **No new hex values.** Add tokens only if they exist in the mobile source of truth.
- Yellow (`action-yellow`) is a finite budget: one primary CTA per screen/panel; dense queues must not become yellow grids.
- Status is never colour alone — use `StatusChip` (icon + label).
- Spacing base 4px; radii field 12 / card 16 / pill 999.
- Breakpoints: mobile &lt;768, tablet 768–1023, desktop 1024–1439, wide 1440+.
  **All five must stay declared in ascending order in the `@theme` block of `globals.css`.**
  Tailwind v4 emits breakpoint media queries in theme-declaration order, not numeric
  order — leaving `sm`/`2xl` at their defaults while redefining `md`/`lg`/`xl` puts the
  `sm` block last, and `sm:` then silently beats `lg:` and `xl:` at every width above
  640px. That flattens every responsive step on any element that uses both.
- Face: **Satoshi** (`--font-sans` / `--font-bold` / …). Never reintroduce Geist or the shadcn default stack.

Binding UX copy/interaction rules: `/home/kali/firstmate/data/gridgo-design-addendum.md` and the design requirements document under `gridgo-tinker`.

## shadcn/ui foundation

This portal uses **shadcn/ui** (Base UI, `base-nova` style) as the component foundation. **GRIDGO identity always wins** over stock shadcn look.

### Agent skill

The official skill is committed under `.agents/skills/shadcn/` (and symlinked for Claude/Grok via `.claude/skills/`). Before adding or restyling UI:

1. Read `.agents/skills/shadcn/SKILL.md`
2. Run `npx shadcn@latest info` / `docs <component>` as needed
3. Prefer the skill’s composition and form rules (`FieldGroup` + `Field`, no `space-y-*`, semantic tokens only)

### How to add a component

```bash
npx shadcn@latest add <name>
```

- Components land in `src/components/ui/`.
- Do **not** re-theme each file with hard-coded colours. Theme is `src/app/globals.css`.
- After add, skim the file for focus rings / heights that violate the a11y floor (44×44, GRIDGO 2px outline) and align if needed — prefer global CSS over per-file paint.
- Keep GRIDGO-specific components (`StatusChip`, `Logo`, `EmptyState`, `ErrorState`, `LoadingBlock`, `DataTable`) — they encode product rules shadcn does not.

### Token mapping (shadcn ← GRIDGO)

Defined once in `src/app/globals.css`. Stock components consume these with no local overrides.

| shadcn variable | GRIDGO meaning |
|---|---|
| `--background` | canvas |
| `--foreground` | text-primary |
| `--card` / `--popover` | surface |
| `--primary` / `--primary-foreground` | **monochrome accent** (structural fill) — **not yellow** |
| `--secondary` / `--muted` | surface-variant |
| `--muted-foreground` | text-muted |
| `--accent` (shadcn hover surface) | surface-variant |
| `--destructive` | error |
| `--border` / `--input` | outline |
| `--ring` | text-primary (fallback only; focus uses outline) |
| `--radius` | 12px (field); fixed sm/md/lg/xl = 8/12/16/24 |

Light + dark pairs match mobile. System dark uses `prefers-color-scheme`; class `.dark` is also defined for shadcn tooling.

### Button variant → GRIDGO role

| Variant | Role | Yellow? |
|---|---|---|
| **(default) / `outline` / `secondary`** | Neutral outlined control | **No** |
| `primary` | Sole page/panel CTA | **Yes — action-yellow only here** |
| `default` (shadcn filled) | Monochrome structural fill | No |
| `destructive` / `danger` | Error / decline path | No |
| `ghost` / `link` | Quiet / text actions | No (`link` may use brand gold for text links) |

Rules:

1. A bare `<Button>` is **outline**, never yellow.
2. At most **one** `variant="primary"` on a page-level action surface. Dense queues use outline/secondary row actions.
3. Do **not** map CSS `--primary` to action-yellow. That would yellow every stock control that uses `bg-primary`. Yellow is only the Button `primary` variant (and the skip-link / active-nav rail indicator).

### What must never be overridden per-component

- Palette / hex values (edit tokens in `globals.css` only)
- Focus treatment: global 2px `outline` on `--foreground` — do not reintroduce `ring-3` as the only focus signal
- Font stack (Satoshi)
- Touch target floor (min 44×44)
- Status meaning (always `StatusChip` with icon + label + tone)

### Forms, tables, overlays (kit for remaining screens)

| Need | Use |
|---|---|
| Form layout + errors | `Field` / `FieldGroup` / `FieldLabel` + `Input` / `Textarea` / `Select` / `Combobox` (`data-invalid` + `aria-invalid`) |
| Dense queues | `DataTable` (`src/components/ui/data-table.tsx`) — TanStack Table; cards below 768px |
| Modal | `Dialog` |
| Tablet secondary detail | `Sheet` or `Drawer` |
| Tabs / tooltips / toast | `Tabs`, `Tooltip`, `toast` + root `Toaster` |
| Pagination / schedule / search | `Pagination`, `Calendar`, `Command` |
| Loading / empty | `LoadingBlock` / `Skeleton`, `EmptyState` |

Root layout already wraps `TooltipProvider` and `Toaster`.

### DataTable

`src/components/ui/data-table.tsx` runs on **`@tanstack/react-table`** and follows the
captain's own composition (`rxguard/src/components/data-table.tsx`): a column header that
is the sort control, a toolbar, faceted filters with live counts, a column-visibility
menu, and pagination.

Columns are authored as `DataTableColumn<T>` and compiled to TanStack `ColumnDef` by
`toColumnDefs`. That descriptor stays because a GRIDGO queue renders twice — a table on
desktop and labelled cards below 768px — and `header` + `primary` + `hideOnMobile` is the
pairing a bare `ColumnDef` cannot express. `ColumnDef` is re-exported for screens that
need raw TanStack columns.

- `facets` — opt in per screen; values must equal `String(sortValue(row))`.
- `pageSize` (default 10) — the footer only mounts when there is a second page.
- `loading` — skeleton rows that hold the table's layout.
- `empty` — the page's own empty state, used only when there is genuinely no data. A
  filtered-to-nothing table says so separately and offers to clear the filters.
- Row actions are pinned to the trailing edge on desktop, so wide rows never scroll them
  out of reach; on mobile they sit on the card.
- Toolbar controls obey the GRIDGO 44×44 floor rather than shadcn's 32px density.

### Primitive audit (2026-08-09)

Only add a registry primitive when a real screen uses it in the same change.

| Decision | Primitive | Current call site / reason |
|---|---|---|
| Added | `alert-dialog` | Destructive or irreversible confirmations in role changes, verification/suspension, claims and payout release, supplier withdrawal, and job decline. Keep `Dialog` for input tasks such as create/edit forms. |
| Added | `sidebar` | `AppShell` desktop rail and mobile Sheet; it still renders only `navForRole(role)`. |
| Added | `progress` | Supplier capacity shows committed units against declared daily capacity. |
| Added | `chart` | Admin Finance splits each order's client total into supplier earnings, commission and delivery — the reconciliation only Operations and Super Admin may see. (Its original call site, a payment-method mix, died with cash on delivery.) |
| Added | `breadcrumb` | AppShell identifies the parent queue on nested supplier job and Operations QA workspaces. |
| Added | `toggle-group` | Day/week schedule modes and the two-option claim hold choice. |
| Rejected | `avatar` | The portal has no user photos or identity surface; the named account control is sufficient. |
| Rejected | `accordion` / `collapsible` | No current screen has a disclosure hierarchy; Sidebar owns its own collapse behavior. |
| Rejected | `slider` | Capacity and money inputs require exact API values, so a slider would reduce precision. |
| Rejected | `sonner` | This is a Base UI project and already uses the Base `toast` manager and root `Toaster`. |

Do not revisit a rejected primitive unless a new screen supplies a concrete call site.

### Dependency decisions (2026-08-11)

The captain's `yanolint/web` and `rxguard` also carry `@tanstack/react-query` and `sonner`.
Both were evaluated here and deliberately not adopted:

| Decision | Package | Reason |
|---|---|---|
| Adopted | `@tanstack/react-table` | The captain names DataTables specifically and uses this everywhere. Powers `src/components/ui/data-table.tsx`. |
| Declined | `@tanstack/react-query` | Every screen here is one `load()` per mount with an explicit `LoadingBlock` / `ErrorState` / `EmptyState` triad and `ApiError.kind` → recovery-copy mapping. Swapping the data layer touches ~28 pages and the error-copy contract for no user-visible gain while there is no polling, cache invalidation, or shared-query story. Revisit when live refresh or optimistic transitions land. |
| Declined | `sonner` | Already rejected in the primitive audit above and still correct: this is a Base UI project with the Base `toast` manager and a root `Toaster`. Adding sonner means two toast roots. |

## Auth and role boundary

1. Login → `POST /auth/login` → cookies `gridgo_token` + `gridgo_role` + sessionStorage user
2. Middleware: wrong role path → redirect to that role's home; no token → `/login`
3. `RoleGate` re-checks live session via context
4. Logout → clear cookies + storage → `router.replace("/login")` (no back-button re-entry)

Client-rendered credential inputs must initialize empty. Populate demo credentials only through explicit account controls so hydration cannot overwrite typing with a privileged or role-specific default.

**The sign-in page never names an account.** It is public at
`https://gridgo-dash.talasora.com/login`, so a list of addresses there hands anyone who
opens it the account list — super admin included — before they have guessed a password.
Rotating the passwords does not make it safe: the addresses are the disclosure. This holds
for error copy too; "use a demo account ending in @…" is the same leak in a different
place. A failed sign-in says the credentials are wrong, and no more.

Three rules follow, and all three are asserted:

- Account addresses live in exactly one module, `src/app/login/dev-accounts.ts`, behind
  `process.env.NODE_ENV === "production" ? [] : […]`. The compiler substitutes `NODE_ENV`,
  so the list folds to a constant and the literals leave the bundle. A runtime flag or an
  environment variable would not — both still ship the strings to the browser.
  The local password rides in the same object literals, so local sign-in is one tap and
  the credential folds away with the address it belongs to. Write such values **inline**,
  not as a hoisted module constant: a top-level `const` sits outside the discarded branch
  and survives on tree shaking rather than on the guard. Never put a real credential here
  — the guard keeps values out of the bundle, not out of the repository.
- `scripts/assert-no-account-addresses.mjs` greps the emitted client chunks *and* server
  bundle for any `…@gridgo.ph` / `…@gridgo.local` address. It runs as part of
  `npm run build`, so a reintroduction fails the build rather than the deploy.
- `src/app/login/__tests__/account-disclosure.test.ts` holds the same line at review time,
  and `page.test.tsx` asserts the failure copy names no account and no `ApiError.code`.

`@gridgo.local` was the placeholder domain; accounts are `@gridgo.ph` fleet-wide.

The sign-in submit control stays `disabled` until the client has mounted. Before React
attaches `onSubmit`, a click submits the form natively — a GET to `/login` that writes the
password into the address bar and browser history. `src/app/login/__tests__/page.test.tsx`
asserts the server markup renders it disabled.

Suppliers are external partners. Never serve `/ops/*` or `/admin/*` to them — not even as soft-hidden UI.

## API client contract

**Rule:** pages never call `fetch`. Import from `@/lib/api` (or `@/lib/api/client`).

Authoritative API docs live in the separate `gridgo-api` repo (`AGENTS.md`, `README.md`, `PRD.md`). When docs and the running server disagree, **the server wins** — update types here to match observed JSON.

### Local sign-in

The API answers any browser `Origin` that is not in `CORS_ALLOWED_ORIGINS` with `403 origin_not_allowed` and **no** `Access-Control-Allow-Origin`. That is an authorization rule, not a dashboard bug — do not widen production CORS from this repo.

In `next dev`, `getApiBase()` therefore returns `/api/gridgo` in the browser, and `src/app/api/gridgo/[...path]/route.ts` forwards to the configured **loopback** API without `Origin` (the same shape mobile and curl already use). Production builds call `NEXT_PUBLIC_API_URL` directly; the proxy 404s when `NODE_ENV=production` and refuses a non-loopback upstream.

`GET /api/health` still echoes `getConfiguredApiBase()` — the real API origin the bundle was built against — never the proxy prefix.

### Modules

| Module | Use for |
|---|---|
| `src/lib/api/client.ts` | One typed function per endpoint |
| `src/lib/api/types.ts` | Shared shapes (Order, User, Claim, …) |
| `src/lib/api/constraints.ts` | Split-payment and milestone gates, payout-hold helpers, issue-window bounds, plain-language guidance |
| `src/lib/format.ts` | `formatPhp` / dates — money stays in **PHP minor units** through the client; format only at the edge |

### Client coverage (spine)

Auth: `login`, `logout`, `me`.  
Orders/jobs: `listOrders`, `listJobs`, `getOrder`, `createOrder`, `transitionOrder`.  
Credits: `creditBalance`, `grantCredits` (super). Credits are a **grant ledger only** — never a way to pay for an order.  
Payments: `submitPayment` (client), `confirmPayment`, `rejectPayment` (ops/super).  
Milestones: `releaseMilestone` (ops/super).  
Settings: `getSettings`, `updateSettings` (ops/super).  
Escalations: `listEscalations`, `resolveEscalation` (ops/super).  
Files: `getFile`, `getFileDownloadUrl`.  
Users: `listUsers`, `getUser`, `updateUserRole` (super), `setUserVerification` (ops/super).  
Zones: `listZones`, `createZone`, `updateZone`.  
Taxonomy: `getTaxonomy`, create/update category · material · finish.  
Supplier services: `listSupplierServices`, `getSupplierService`, `createSupplierService`, `updateSupplierService`, `submitSupplierService`, `verifySupplierService`, `suspendSupplierService`, `withdrawSupplierService`.  
Matching: `getEligibleSuppliers`.  
Claims: `listClaims`, `getClaim`, `createClaim`, `holdClaim`, `releaseClaim`.  
Issues: `listIssues`, `getIssue`, `reportOrderIssue`, `resolveIssue`.  
Audit: `listAudit`.  
Dispatch: `listDispatchOffers`, `getDispatchLocation`, plus rider helpers for completeness.  
Also: `listNotifications`, `listCatalog`, `health`.

### Errors

API returns `{ error: "snake_case" }` with meaningful HTTP status. The client throws `ApiError`:

| Field | Meaning |
|---|---|
| `status` | HTTP status |
| `code` | `error` string (e.g. `forbidden`, `payout_held`, `pof_required`) |
| `kind` | `unauthorized` · `forbidden` · `not_found` · `conflict` · `validation` · `server` · `unknown` |
| `details` / `detail(key)` | Extra body fields (`maxMinor`, `from`, …) |

Use `isApiError(err)` and branch on `kind` / `code` — **never** string-match human messages. Map codes to plain recovery copy in the page (design addendum).

### Constraints before rejection

Explain these *before* the user hits submit when the screen can know:

- A milestone needs a Proof of Fulfilment, and releases in order → `milestoneReleaseBlocker` (mirrors `409 pof_required` / `milestone_not_reached`)
- An active claim hold blocks every remaining milestone → `order.payoutHold`, `claimBlocksPayout`, `409 payout_held`
- The balance cannot be submitted before the downpayment settles → `canSubmitBalance`
- Payment cannot be asked for before the client was told the final price → `clientWasNotifiedOfPrice`, `409 assignment_notification_required`
- Client issues only in `issue_window_open` → `canReportIssue`

Copy helpers: `PLATFORM_CONSTRAINT_COPY` in `constraints.ts`; Operations error copy in `src/app/ops/_lib/errors.ts`.

### API honesty

Do **not** mock data behind a real-looking screen. Do **not** edit `gridgo-api`.

If a screen still needs a capability the demo API does not expose, show an honest unavailable state and note `needs-decision: missing endpoint …` — do not invent a second client.

## Navigation contract

**Single source:** `src/lib/nav.ts` → `ROLE_NAV` keyed by portal role.

| Role | Surface (hrefs) |
|---|---|
| supplier | `/supplier/jobs`, `catalogue`, `schedule`, `capacity`, `payouts` |
| ops_admin | `/ops/overview`, `qa`, `payments`, `matching`, `approvals`, `dispatch`, `escalations`, `payouts`, `claims`, `recovery`, `schedule`, `settings`, `audit` |
| super_admin | `/admin/overview`, `verification`, `roles`, `catalogue`, `zones`, `settings`, `credits`, `finance`, `audit`, `planning`, `broadcast` |

Two surfaces are mounted for both Operations and Super Admin from **one** implementation, so they can never drift:

| Component | Mounted at |
|---|---|
| `src/components/approvals/SignupApprovals.tsx` | `/ops/approvals`, and the Sign-ups tab of `/admin/verification` |
| `src/components/settings/OperationalSettings.tsx` | `/ops/settings`, `/admin/settings` |

- AppShell renders `navForRole(role)` only. Do **not** maintain separate nav arrays in components.
- Middleware + `RoleGate` still refuse another role’s URL; nav is not a security boundary.
- Yellow is **only** the selected rail indicator (and at most one `Button variant="primary"` on a page). The rail must never become a yellow column.
- `ready: false` → route uses `ComingNext` placeholder (“Coming next” + body from the nav item). Prefer that over a 404.
- When shipping a real page: replace the placeholder `page.tsx`, set `ready: true` on that nav item, keep the same `href`.

Header title: `contextTitleForPath(pathname, role)` (nested job/QA workspaces have special titles).

### App shell

- **One** `SidebarTrigger`, in the page header, left of the title. It is in the same place
  at every width and is what a collapsed rail leaves reachable. `SidebarRail` is the second
  affordance — a drag/click edge, not a duplicate button. Do not add a trigger inside
  `SidebarHeader`.
- `--sidebar-width-icon` is `3.75rem`, not shadcn's `3rem`: GRIDGO's 44×44 control floor
  overrides shadcn's `size-8`, and a 3rem rail clips nav labels mid-word. Labels are
  hidden with `group-data-[collapsible=icon]:hidden` rather than left to width clipping.
- Nav items use `tooltip={item.label}` so the collapsed rail is readable.
- The `Logo` belongs in exactly two places: the sign-in screen, where identity is being
  established — once, in the orientation column that answers "which GRIDGO site is this",
  not also inside the card — and `SidebarHeader`, where it doubles as the home control. It
  is furniture anywhere else. On collapse the wordmark goes and the mark stays.
  **Known limitation:** the mark is a wordmark plus a dot, so what survives collapse is a
  10px dot — legible as a place-holder, weak as identity. A dedicated square glyph would
  serve a collapsing rail properly; that is the captain's call, and the mark was not
  redrawn here.
- Every `NavIconKey` maps to a distinct lucide icon. Two screens sharing a glyph teaches
  nothing; if you add a nav entry, give it an icon no sibling already uses.

## Operational model v2 — what this portal must get right

### Money, and who may see it

Commission secrecy is an **authorization rule**, not a layout preference. The server strips fields per role; the portal must not undo that.

| Figure | Who sees it |
|---|---|
| `supplierPriceMinor` | Operations, Super Admin, and the assigned supplier (its own) |
| `commissionRatePercent` / `commissionMinor` | **Operations and Super Admin only** |
| `subtotalMinor`, `deliveryFeeMinor`, `totalMinor`, `downpaymentMinor`, `balanceMinor` | everyone on the order |

`MoneyBreakdown` is the Operations/Super Admin view and must never be imported into `src/app/supplier/**`. `src/components/orders/__tests__/money-visibility.test.ts` walks the supplier route tree and fails the build if it is, if a commission field is read there, or if cash on delivery reappears.

`totalMinor` **already includes delivery** in v2. Never write `totalMinor + deliveryFeeMinor` — that was the v1 shape and it double-counts.

### Payment is two installments, confirmed by hand

75% downpayment then 25% balance, both digital QR transfers. The client submits a reference; Operations confirms it (`payment_authorized`) or rejects it with a client-visible reason that returns the installment to `not_submitted` so they can resubmit. Rejection reasons are written **for the client to read** — see `PAYMENT_REJECTION_REASONS` in `src/app/ops/_lib/payments.ts`.

The seam is deliberately clean: a payment provider can replace the manual confirmation without redesigning the flow.

### Supplier payout is four milestones

Printing 50%, packaging and QC 15%, delivered 25%, retention 10% — of the **supplier's own price**, not the client total. Each releases only against a Proof of Fulfilment, and any active claim holds all of them.

### Removed by the captain's decision — do not reintroduce

- **Cash on delivery**, everywhere. This is a risk decision about rider cash handling, not a temporary simplification.
- **Paying with Pilot Credits.** Balances and grants remain (`admin/credits`); `POST /credits/authorize` is `410`.
- **The supplier proof approve / request-changes loop.** States `supplier_proof_*` and `awaiting_payment` are never accepted.
- **Flat per-zone delivery fees.** `Zone.deliveryFeeMinor` no longer exists; distance bands in Operational settings are the only authority.

### Settings the captain owns

`issueWindowHours` and `deliveryFeeBands` live in configuration so they change without a release. The shipped band figures (₱25 / ₱50 / ₱75) are **Firstmate's suggestion, not the captain's prices** — the screen says so, and should keep saying so until they set real ones.

## Push broadcasts — the one control that leaves the platform

`/admin/broadcast` is Super Admin only. One press puts a notification on the
lock screen of every registered phone in the audience, and **there is no
unsend**. The screen is built to make sending deliberate rather than fast; if
you touch it, keep these five properties.

- **No audience is pre-selected**, and "Everyone" sits last in the list.
  `AUDIENCE_CHOICES` in `src/app/admin/_lib/broadcasts.ts` owns that order.
- **The device count is read live** from the API before every send, and sending
  is **blocked** while it is unknown. "Send" and "Send to 1,240 phones" are
  different presses; a broadcast whose size nobody can state should not go out.
- **The destination rule is `https` on `talasora.com` or a subdomain of it**,
  no credentials, no port — `validateDestination`. A GRIDGO notification is
  trusted because GRIDGO sent it, so an arbitrary operator-typed URL is a
  phishing message with our name on it. **The API must enforce the same rule.**
  The UI's job is only to never offer what the API will refuse.
- **Recent sends sit beside the compose fields**, and an identical message to
  the same audience inside two hours raises a warning (`findRecentDuplicate`).
- **Delivery is best effort.** "820 of 1,240" is a normal result and must not
  read as failure; zero delivered is not normal and must. `presentDelivery`.

The endpoints (`GET`/`POST /admin/broadcasts`, `GET /admin/broadcasts/audience`)
are an **assumed contract** — see the header comment in `src/lib/api/client.ts`.
Until gridgo-api ships them they 404 and the screen shows an honest unavailable
state. When the server disagrees, the server wins.

## Adding a screen

1. Confirm the API endpoint exists and is authorized for the role (probe with the running API if unsure).
2. Prefer an existing function in `src/lib/api/client.ts`. Add a new function only if the endpoint is missing from the client; keep types in `types.ts`.
3. Map states through `presentOrderState` / action tables — never raw snake_case enums on screen.
4. Put the route under the correct role tree (`src/app/supplier|ops|admin/…`).
5. If the nav entry already exists, reuse its `href` and flip `ready` to `true` in `ROLE_NAV`. If you need a new entry, add it to `ROLE_NAV` only (not a second list in AppShell).
6. Loading → `LoadingBlock`; empty → `EmptyState` (invite the next action); failure → `ErrorState` with recovery from `ApiError.kind` / `code`.
7. Mobile cards below 768; dense queues → `DataTable`; essential row actions free of horizontal scroll.
8. At most **one** yellow primary CTA on the page-level action surface (`Button variant="primary"`). Dense queues use outline/secondary.
9. Compose from `src/components/ui/` — do not hand-roll a second button/input language.
10. Money: minor units in state and client; `formatPhp` only when rendering.

## Accessibility floor

- Visible `:focus-visible` (never `outline: none` without a replacement)
- 44×44 minimum controls
- Logical heading order
- Accessible names on icon-only controls
- `prefers-reduced-motion` respected in CSS
- Status readable in greyscale (icon + label)

## Deployment

Runbook: **`docs/DEPLOYMENT.md`** — environment, first-time install, rollback, and how to
confirm a deploy landed. Read it before changing anything below.

The portal is hosted at **`https://gridgo-dash.talasora.com`** (not `gridgo.talasora.com`,
which is a separate landing site). Merging to `main` builds, publishes, and deploys; a
pull request does neither. `Dockerfile` + `deploy/docker-compose.yml` +
`.github/workflows/deploy.yml` + `GET /api/health` are the four moving parts.

Three facts that are easy to break and expensive to discover:

- **`NEXT_PUBLIC_API_URL` is compiled into the browser bundle at build time.** Supplying it
  as a runtime environment variable does nothing — the portal builds green, boots green,
  and then calls `http://127.0.0.1:8787` from the captain's users' browsers. It travels as
  a Docker build argument, and `scripts/assert-api-url.mjs` greps the emitted client chunks
  to prove it landed. Never "fix" a wrong API URL by adding it to `docker-compose.yml`.
- **The container must be named `gridgo-web`, listen on 3000, and join `gridgo-edge`.** The
  Caddy proxy in `~/gridgo-proxy` on the server resolves that exact name; the network is
  `external` here because Caddy owns it. Renaming any of the three takes the portal off the
  internet.
- **Cloudflare terminates TLS in front of the server in Flexible mode.** The container
  serves plain HTTP. An HTTPS redirect inside the container loops forever.

`/api/health` is liveness for *this process only* and deliberately does not call the GRIDGO
API — otherwise an API outage would mark a healthy portal unhealthy and block shipping the
fix. It echoes the build commit and the baked `apiBase`, which is how a deploy is confirmed.

## Maintaining this file

When you learn something durable about this project that future sessions will need, add it here (or point to the authoritative file). Prefer links over copied detail. Remove stale claims when they stop being true.
