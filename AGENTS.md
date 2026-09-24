# AGENTS.md — GRIDGO Web Portal

Guidance for any agent or human picking up this codebase.

## What this is

A single Next.js (App Router) portal for three roles: `supplier`, `ops_admin`, `super_admin`. Shared design system, API client, and auth. Database memberships decide which route trees a signed-in identity may use, including multiple trees for a multi-membership identity.

Mobile apps (client / supplier / rider) are separate repos. Do not invent a parallel product identity here.

**Operations is a required participant in the order flow, not an observer.** A client's 75% downpayment waits for a person here to confirm the money arrived; until they do, the order physically cannot progress. That confirmation lives on the shared order workspace; see [inbox destinations](docs/REALTIME_UPDATES.md#inbox-destinations).

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
`next dev` does **not** let the browser CORS-hit that origin — see Local API proxy.

Authentication is Clerk-only. Local and production portal identities must already have a
database `supplier`, `ops_admin`, or `super_admin` membership; the portal never creates a
privileged account.

## Layout of the code

| Path                                    | Owns                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/api/client.ts`                 | Typed HTTP client — **only** place pages call `fetch` for ordinary JSON                                                                                                                                                                                                                                                                                            |
| `src/lib/api/notifications.ts`          | Inbox list/mark/delete plus Clerk-bearer SSE (`fetch` + `ReadableStream`; never `EventSource`, never JWT on the query string)                                                                                                                                                                                                                                      |
| `src/lib/live/`                         | One stream per signed-in tab (`LiveProvider`), coalesced page refetch (`useLiveReload`), and `notificationHref` (role-safe inbox destinations — Super Admin never lands on `/ops/*`)                                                                                                                                                                               |
| `src/lib/live/notificationSound.ts`     | The Desk chime (legacy `notification_user.mp3`): coalescing, autoplay priming, per-browser on/off preference; see `docs/REALTIME_UPDATES.md`                                                                                                                                                                                                                       |
| `src/lib/live/desktopAlerts.ts`        | Opt-in desktop alerts (with `public/desk-alerts-sw.js`): permission states, the Desk prompt and footer switch, toast dedupe, role filter, click routing through the service worker; see `docs/REALTIME_UPDATES.md#desktop-alerts`. Closed-browser delivery would need Web Push (API change) |
| `src/app/api/gridgo/[...path]/route.ts` | Local-dev same-origin proxy to a loopback API (strips `Origin`)                                                                                                                                                                                                                                                                                                    |
| `src/lib/api/types.ts`                  | Response/request types (no `any`)                                                                                                                                                                                                                                                                                                                                  |
| `src/lib/api/constraints.ts`            | Server rules the UI can explain _before_ rejection (payment/milestone gates, holds, issue window)                                                                                                                                                                                                                                                                  |
| `src/lib/nav.ts`                        | **Single** role→nav structure (`ROLE_NAV_GROUPS` + flattened `ROLE_NAV`); AppShell reads this only                                                                                                                                                                                                                                                                 |
| `src/lib/auth/`                         | Clerk token bridge, `/auth/me` identity context, portal-membership landing, public login-return URL                                                                                                                                                                                                                                                                |
| `src/middleware.ts`                     | Clerk-session check only; never role authorization; delegates public-origin reconstruction to `publicRequestUrl`                                                                                                                                                                                                                                                   |
| `src/lib/order-state.ts`                | Plain-language state labels (no snake_case on screen)                                                                                                                                                                                                                                                                                                              |
| `src/lib/supplier-actions.ts`           | Valid supplier transitions for current state                                                                                                                                                                                                                                                                                                                       |
| `src/lib/listings.ts`                   | Shop board listings. Tarpaulin (`tarpaulins_outdoor_banners`) requires `printerMaxWidthFeet` (integer feet, 1–20); other families omit/null. Distinct from `minimumWidthMilli`.                                                                                                                                                                                    |
| `src/lib/ops-actions.ts`                | Valid ops transitions + queue membership                                                                                                                                                                                                                                                                                                                           |
| `src/components/ui/`                    | shadcn/ui primitives + GRIDGO-specific components                                                                                                                                                                                                                                                                                                                  |
| `src/components/shell/`                 | App shell, nav rail, RoleGate, `ComingNext` placeholders                                                                                                                                                                                                                                                                                                           |
| `src/lib/theme.ts`                      | Portal theme choice: `resolveTheme` (explicit `.light`/`.dark` class, else device), `applyTheme`, and the pre-paint boot script; `ThemeToggle` in the header is its only control                                                                                                                                                                                   |
| `src/app/supplier/`                     | Supplier partner surfaces                                                                                                                                                                                                                                                                                                                                          |
| `src/app/ops/`                          | Operations surfaces — overview, **orders** (payment confirmations + QA on the workspace), sign-up approvals, dispatch, **riders**, **pickup escalations**, **milestone payouts**, claims, recovery, schedule, settings, audit                                                                                                                                      |
| `src/app/ops/_lib/`                     | Ops-only pure helpers (payment queue, overview buckets, matching explainers, location freshness, schedule events, error copy) — tests under `_lib/__tests__`                                                                                                                                                                                                       |
| `src/components/riders/`                | Live rider map shared by Operations and Super Admin: `RiderLiveView` (page body), `RiderMap` (Leaflet from CDN on OpenStreetMap tiles toned to the theme in CSS: greys in light, inverted in dark; vehicle pins, pickup/drop-off pins, road route in theme colours), `useRiderRoutes` (one road route per rider, refreshed after 40 m of movement), `VehicleGlyph` |
| `src/lib/vehicle.ts`                    | The five rider vehicle types as plain-language labels and one glyph set (lucide path data; motorcycle and van drawn on the same grid) used by map pins, the dispatch board and the roster                                                                                                                                                                          |
| `src/lib/osrm.ts`                       | Road routes from the public OSRM demo (keyless, rate-limited, no SLA) with a straight-line fallback that never invents a travel time; the one sanctioned non-API `fetch` besides the SSE stream                                                                                                                                                                    |
| `src/components/orders/`                | Order-shaped views: `OrderWorkspace` (ops + Super Admin inbox), `MoneyBreakdown` (ops/super **only**), `PaymentSummary`, `MilestoneList`, `OrderMeta`, `Timeline`                                                                                                                                                                                                  |
| `src/app/admin/`                        | Super Admin surfaces — including `broadcast`, the push megaphone                                                                                                                                                                                                                                                                                                   |
| `src/app/admin/_lib/broadcasts.ts`      | Announcement rules: audience order/copy, lock-screen budget, session resend check, reach reading                                                                                                                                                                                                                                                                   |
| `src/app/admin/catalogue/_components/DangerZone.tsx` | The one delete on the chart editors (category + print job): typed-code confirmation, then the API's `409 catalog_entry_in_use` / `catalog_entry_shipped` breakdown with "Hide from new listings" (`active:false`) as the fallback. Copy rules in `_lib/danger.ts`; contract in `gridgo-api/docs/TAXONOMY_API.md` § Delete. Build-shipped entries can never be hard-deleted: the seed appends them back. |
| `src/app/globals.css`                   | Design tokens + shadcn semantic CSS variables                                                                                                                                                                                                                                                                                                                      |
| `components.json`                       | shadcn CLI config (style: `base-nova`, Base UI)                                                                                                                                                                                                                                                                                                                    |
| `.agents/skills/shadcn/`                | Committed shadcn agent skill — use it for UI work                                                                                                                                                                                                                                                                                                                  |

## Design tokens

Ported from `gridgo-client/constants/theme.ts` and `global.css`.

- **No new hex values.** Add tokens only if they exist in the mobile source of truth.
- Yellow (`action-yellow`) is a finite budget: one primary CTA per screen/panel; dense queues must not become yellow grids.
- Status is never colour alone — use `StatusChip` (icon + label).
- `tailwind-merge` reads the type-scale utilities (`text-h3`, `text-body`, `text-caption`, `text-nav`, …) as text _colours_, so inside any `cn()`-merged primitive (`Badge`, `PopoverTitle`, `SheetTitle`, descriptions) a type utility silently drops the real colour class, or the colour drops the size. Keep type and colour classes off merged primitives (wrap the text in a plain `span`, or set the family inline) — this is why the Desk bell count once rendered as a blank dot.
- Spacing base 4px; radii field 12 / card 16 / pill 999.
- Breakpoints: mobile &lt;768, tablet 768–1023, desktop 1024–1439, wide 1440+.
  **All five must stay declared in ascending order in the `@theme` block of `globals.css`.**
  Tailwind v4 emits breakpoint media queries in theme-declaration order, not numeric
  order — leaving `sm`/`2xl` at their defaults while redefining `md`/`lg`/`xl` puts the
  `sm` block last, and `sm:` then silently beats `lg:` and `xl:` at every width above
  640px. That flattens every responsive step on any element that uses both.
- Face: **Instrument Sans** (`--font-sans` / `--font-bold` / …). Never reintroduce Geist,
  Satoshi, or the shadcn default stack.
  Self-hosted from **one variable file** (`wght` 400–700) in `public/fonts`, in two
  subsets. **Both are required**: the peso sign (₱ U+20B1) is latin-ext, and this portal
  is mostly money — ship only the latin file and every price silently falls back to
  system-ui mid-sentence.
  The four family tokens are **pinned-weight aliases** over that one file
  (`InstrumentSans-Regular` 400 / `-Medium` 500 / `-Bold` 700 / `-Black` 700). They exist
  because a CSS custom property carries only the family, not the weight, and ~65 call
  sites select their weight by family name. A single-value `font-weight` descriptor pins
  the variable axis for that face, so a call site never names a weight. Add a role by
  adding an alias, not by changing call sites.
  Instrument Sans stops at **700**, so `--font-black` and `--font-brand` are no longer a
  distinct step from `--font-bold` — the former Satoshi Black (900) has no equivalent.

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

| shadcn variable                      | GRIDGO meaning                                           |
| ------------------------------------ | -------------------------------------------------------- |
| `--background`                       | canvas                                                   |
| `--foreground`                       | text-primary                                             |
| `--card` / `--popover`               | surface                                                  |
| `--primary` / `--primary-foreground` | **monochrome accent** (structural fill) — **not yellow** |
| `--secondary` / `--muted`            | surface-variant                                          |
| `--muted-foreground`                 | text-muted                                               |
| `--accent` (shadcn hover surface)    | surface-variant                                          |
| `--destructive`                      | error                                                    |
| `--border` / `--input`               | outline                                                  |
| `--ring`                             | text-primary (fallback only; focus uses outline)         |
| `--radius`                           | 12px (field); fixed sm/md/lg/xl = 8/12/16/24             |

Light + dark pairs match mobile. With no explicit choice the device preference applies through `prefers-color-scheme`; the header `ThemeToggle` (left of the bell) sets a `.light` or `.dark` class on `<html>` and remembers it per browser in `localStorage` (`src/lib/theme.ts`, boot script inlined by `src/app/layout.tsx` so a remembered choice never flashes). `.light` wins over a dark device preference; `.dark` is also what shadcn tooling expects.

### Button variant → GRIDGO role

| Variant                                 | Role                       | Yellow?                                       |
| --------------------------------------- | -------------------------- | --------------------------------------------- |
| **(default) / `outline` / `secondary`** | Neutral outlined control   | **No**                                        |
| `primary`                               | Sole page/panel CTA        | **Yes — action-yellow only here**             |
| `default` (shadcn filled)               | Monochrome structural fill | No                                            |
| `destructive` / `danger`                | Error / decline path       | No                                            |
| `ghost` / `link`                        | Quiet / text actions       | No (`link` may use brand gold for text links) |

Rules:

1. A bare `<Button>` is **outline**, never yellow.
2. At most **one** `variant="primary"` on a page-level action surface. Dense queues use outline/secondary row actions.
3. Do **not** map CSS `--primary` to action-yellow. That would yellow every stock control that uses `bg-primary`. Yellow is only the Button `primary` variant (and the skip-link / active-nav rail indicator).

### What must never be overridden per-component

- Palette / hex values (edit tokens in `globals.css` only)
- Focus treatment: global 2px `outline` on `--foreground` — do not reintroduce `ring-3` as the only focus signal
- Font stack (Instrument Sans, via the `--font-*` aliases)
- Touch target floor (min 44×44)
- Status meaning (always `StatusChip` with icon + label + tone)

### Forms, tables, overlays (kit for remaining screens)

| Need                           | Use                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Form layout + errors           | `Field` / `FieldGroup` / `FieldLabel` + `Input` / `Textarea` / `Select` / `Combobox` (`data-invalid` + `aria-invalid`) |
| Dense queues                   | `DataTable` (`src/components/ui/data-table.tsx`) — TanStack Table; cards below 768px                                   |
| Modal                          | `Dialog`                                                                                                               |
| Tablet secondary detail        | `Sheet` or `Drawer`                                                                                                    |
| Tabs / tooltips / toast        | `Tabs`, `Tooltip`, `toast` + root `Toaster`                                                                            |
| Pagination / schedule / search | `Pagination`, `Calendar`, `Command`                                                                                    |
| Loading / empty                | `LoadingBlock` / `Skeleton`, `EmptyState`                                                                              |

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
  out of reach; on mobile they sit on the card. Author them with `DataTableRowAction`
  (icon + tooltip, `aria-label` is the verb). The Actions column is centered; desktop
  is icon-only, mobile cards show the verb so the control is never a mystery glyph.
- Toolbar controls obey the GRIDGO 44×44 floor rather than shadcn's 32px density.

### Primitive audit (2026-08-09)

Only add a registry primitive when a real screen uses it in the same change.

| Decision | Primitive      | Current call site / reason                                                                                                                                                                                                                                                                       |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Added    | `alert-dialog` | Destructive or irreversible confirmations in role changes, verification/suspension, claims and payout release, supplier withdrawal, and job decline. Keep `Dialog` for input tasks such as create/edit forms.                                                                                    |
| Added    | `sidebar`      | `AppShell` desktop rail and mobile Sheet; it still renders only `navGroupsForRole(role)`.                                                                                                                                                                                                        |
| Added    | `progress`     | Supplier capacity shows committed units against declared daily capacity.                                                                                                                                                                                                                         |
| Added    | `chart`        | Admin Finance splits each order's client total into supplier earnings, commission and delivery — the reconciliation only Operations and Super Admin may see. (Its original call site, a payment-method mix, died with cash on delivery.) Also the supplier dashboard's two single-series charts. |
| Added    | `breadcrumb`   | AppShell identifies the parent queue on nested supplier job and Operations QA workspaces.                                                                                                                                                                                                        |
| Added    | `toggle-group` | Day/week schedule modes and the two-option claim hold choice.                                                                                                                                                                                                                                    |
| Added    | `collapsible`  | Each labeled rail group is a collapsible parent row (sidebar-07 pattern, the captain's request 2026-09-24). Whole-rail icon collapse (`Sidebar collapsible="icon"`) stays; in the icon rail a group opens as a `DropdownMenu` flyout instead.                                                  |
| Rejected | `avatar`       | The portal has no user photos or identity surface; the named account control is sufficient.                                                                                                                                                                                                      |
| Rejected | `accordion`    | Rail groups open independently (several may be open), which is `Collapsible` per group, not an accordion.                                                                                                                                                                                         |
| Rejected | `slider`       | Capacity and money inputs require exact API values, so a slider would reduce precision.                                                                                                                                                                                                          |
| Rejected | `sonner`       | This is a Base UI project and already uses the Base `toast` manager and root `Toaster`.                                                                                                                                                                                                          |

Do not revisit a rejected primitive unless a new screen supplies a concrete call site.

### Dependency decisions (2026-08-11)

The captain's `yanolint/web` and `rxguard` also carry `@tanstack/react-query` and `sonner`.
Both were evaluated here and deliberately not adopted:

| Decision | Package                 | Reason                                                                                                                                                                                                            |
| -------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adopted  | `@tanstack/react-table` | The captain names DataTables specifically and uses this everywhere. Powers `src/components/ui/data-table.tsx`.                                                                                                    |
| Declined | `@tanstack/react-query` | Not adopted. The current refresh and reconciliation contract is in [Live resource updates](docs/REALTIME_UPDATES.md); preserve the existing `ApiError.kind` → recovery-copy mapping if revisiting the data layer. |
| Declined | `sonner`                | Already rejected in the primitive audit above and still correct: this is a Base UI project with the Base `toast` manager and a root `Toaster`. Adding sonner means two toast roots.                               |

## Auth and role boundary

1. Clerk owns sign-in, Google/password recovery, session cookies, JWT refresh, and logout.
2. Middleware requires only a signed Clerk session for `/`, `/supplier/*`, `/ops/*`, and
   `/admin/*`; it never reads a role or authorization claim. A signed-out bounce uses
   `publicRequestUrl` so its login return cannot expose a container-only origin. The
   reverse-proxy and production-fallback contract is owned by `docs/DEPLOYMENT.md`.
3. `AuthProvider` loads `GET /auth/me` for identity and the complete database membership
   list. The root uses that list only to choose a stable initial portal workspace.
4. Every role layout calls its fixed projection through `RoleGate`:
   `/auth/me/supplier`, `/auth/me/ops`, or `/auth/me/admin`. Only a successful projection
   mounts the page tree. Clerk claims/metadata, the legacy `user.role`, app state, and route
   parameters never grant access. A multi-membership identity may use every projection it
   has.
5. `RoleGate` revalidates its fixed projection on every in-tree navigation. It keeps an
   already-authorized tree visible while refreshing, then removes access on a definitive
   denial so membership changes take effect without a reload.
6. An authenticated but unmapped identity, or one with no portal membership, gets the
   access-not-assigned screen and can sign out to use another account.

`/login` never offers sign-up: `SignIn` uses `withSignUp={false}` and
`transferable={false}`. There is no sign-up route or role selector. The public
page still never names an account; `scripts/assert-no-account-addresses.mjs` checks the
emitted client and server output, and the login tests enforce sign-in-only behavior.

Log out must end the Clerk session first
(`await clerk.signOut({ redirectUrl: "/login" })`) and only then clear portal
identity. `ClerkProvider` sets `afterSignOutUrl="/login"`. `/login` mounts
`<SignIn fallbackRedirectUrl="/" />` only while signed out — a leftover session
must stay on `/login`, not bounce home.

Clerk's rotating JWT is attached as `Authorization: Bearer …` by the API client. Never copy
it into a GRIDGO cookie or session storage. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is public;
`CLERK_SECRET_KEY` is server-only and must never use a `NEXT_PUBLIC_` prefix.
`scripts/assert-no-clerk-secrets.mjs` scans the complete `.next` build output. Exact build
and runtime placement belongs to `docs/DEPLOYMENT.md`.

Suppliers are external partners. Never serve `/ops/*` or `/admin/*` to them — not even as soft-hidden UI.

## API client contract

**Rule:** pages never call `fetch`. Import from `@/lib/api` (or `@/lib/api/client`). The live inbox stream is the one exception, and it lives in `src/lib/api/notifications.ts` — never `EventSource`, never a JWT on the query string. Pages subscribe through `useLiveReload`.

Authoritative API docs live in the separate `gridgo-api` repo (`AGENTS.md`, `README.md`, `PRD.md`). When docs and the running server disagree, **the server wins** — update types here to match observed JSON.

### Local API proxy

The API answers any browser `Origin` that is not in `CORS_ALLOWED_ORIGINS` with `403 origin_not_allowed` and **no** `Access-Control-Allow-Origin`. That is an authorization rule, not a dashboard bug — do not widen production CORS from this repo.

In `next dev`, `getApiBase()` therefore returns `/api/gridgo` in the browser, and `src/app/api/gridgo/[...path]/route.ts` forwards to the configured **loopback** API without `Origin` (the same shape mobile and curl already use). Production builds call `NEXT_PUBLIC_API_URL` directly; the proxy 404s when `NODE_ENV=production` and refuses a non-loopback upstream.

`GET /api/health` still echoes `getConfiguredApiBase()` — the real API origin the bundle was built against — never the proxy prefix.

### Modules

| Module                       | Use for                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/api/client.ts`      | One typed function per endpoint                                                                      |
| `src/lib/api/types.ts`       | Shared shapes (Order, User, Claim, …)                                                                |
| `src/lib/api/constraints.ts` | Split-payment and milestone gates, payout-hold helpers, issue-window bounds, plain-language guidance |
| `src/lib/format.ts`          | `formatPhp` / dates — money stays in **PHP minor units** through the client; format only at the edge |

### Client coverage (spine)

Auth: `getAuthMe`, `getPortalRoleProjection`.
Orders/jobs: `listOrders`, `listJobs`, `getOrder`, `createOrder`, `transitionOrder`.  
Credits: `creditBalance`, `grantCredits` (super). Credits are a **grant ledger only** — never a way to pay for an order.  
Payments: `submitPayment` (client), `confirmPayment`, `rejectPayment` (ops/super).  
Milestones: `releaseMilestone`, `uploadPayoutReceipt` + `releaseMilestoneWithReceipt` (ops/super; the wallet receipt screenshot and reference land on the released share).  
Settings: `getSettings`, `updateSettings` (ops/super).  
Escalations: `listEscalations`, `resolveEscalation` (ops/super).  
Files: `getFile`, `getFileDownloadUrl`.  
Payout account (where a shop gets paid): `getMyPayoutAccount`, `updateMyPayoutAccount`, `removeMyPayoutAccount`, `uploadPayoutQr` (supplier), `getSupplierPayoutAccount` (ops/super). Operations also reads it as `order.supplierPayoutAccount`.  
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

| Field                     | Meaning                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `status`                  | HTTP status                                                                                   |
| `code`                    | `error` string (e.g. `forbidden`, `payout_held`, `pof_required`)                              |
| `kind`                    | `unauthorized` · `forbidden` · `not_found` · `conflict` · `validation` · `server` · `unknown` |
| `details` / `detail(key)` | Extra body fields (`maxMinor`, `from`, …)                                                     |

Use `isApiError(err)` and branch on `kind` / `code` — **never** string-match human messages. Map codes to plain recovery copy in the page (design addendum).

### Constraints before rejection

Explain these _before_ the user hits submit when the screen can know:

- A milestone needs a Proof of Fulfilment, and releases in order → `milestoneReleaseBlocker` (mirrors `409 pof_required` / `milestone_not_reached`)
- An active claim hold blocks every remaining milestone → `order.payoutHold`, `claimBlocksPayout`, `409 payout_held`
- The balance cannot be submitted before the downpayment settles → `canSubmitBalance`
- Payment cannot be asked for before the client was told the final price → `clientWasNotifiedOfPrice`, `409 assignment_notification_required`
- Client issues only in `issue_window_open` → `canReportIssue`

Copy helpers: `PLATFORM_CONSTRAINT_COPY` in `constraints.ts`; Operations error copy in `src/app/ops/_lib/errors.ts`.

### API honesty

Do **not** mock data behind a real-looking screen. Do **not** edit `gridgo-api`.

If a screen still needs a capability the GRIDGO API does not expose, show an honest unavailable state and note `needs-decision: missing endpoint …` — do not invent a second client.

## Navigation contract

**Single source:** `src/lib/nav.ts` → `ROLE_NAV_GROUPS` (rail sections) and flattened `ROLE_NAV` (items). Overview / Jobs stay top-level as plain rows; every labeled group (Queue / Field / Money / System for ops; People / Catalog / Money / System for admin; Shop / Money for suppliers) is a collapsible parent row — group `icon` + label + chevron — with its pages as indented sub-rows on a guide line. The group holding the current page opens itself; other groups remember the person's choice, and the whole-rail fold is remembered too (`src/components/shell/rail-state.ts`, localStorage). In the icon rail a group opens its pages in a flyout. While Queue is folded the Orders count sits on the Queue row (a dot on the icon rail); the count is read once per rail. Screenshots: `docs/screenshots/sidebar/`.

| Role        | Surface (hrefs)                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| supplier    | `/supplier/dashboard`, `jobs`, `catalogue`, `schedule`, `capacity`, `payouts`, `payout-account`                                                |
| ops_admin   | `/ops/overview`, `orders`, `approvals`, `dispatch`, `riders`, `escalations`, `schedule`, `payouts`, `claims`, `recovery`, `settings`, `audit`  |
| super_admin | `/admin/overview`, `riders`, `verification`, `roles`, `catalogue`, `zones`, `credits`, `finance`, `settings`, `audit`, `planning`, `broadcast` |

For inbox destinations outside the rail and their role boundaries, see [Live resource updates](docs/REALTIME_UPDATES.md#inbox-destinations).

The following shared surfaces mount one implementation for Operations and Super Admin:

| Component                                         | Mounted at                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `src/components/orders/OrderWorkspace.tsx`        | `/ops/orders/:id` and `/admin/orders/:id`                             |
| `src/components/approvals/SignupApprovals.tsx`    | `/ops/approvals`, and the Sign-ups tab of `/admin/verification`       |
| `src/components/approvals/ServiceLines.tsx`       | Service-lines tab of `/ops/approvals` and `/admin/verification`       |
| `src/components/settings/OperationalSettings.tsx` | `/ops/settings`, `/admin/settings`                                    |
| `src/components/riders/RiderLiveView.tsx`         | `/ops/riders`, `/admin/riders` (orders open in the caller's own tree) |

- AppShell renders `navGroupsForRole(role)` only. Do **not** maintain separate nav arrays in components.
- Middleware authenticates only; `RoleGate` refuses a role URL through its fixed database
  projection. Nav is not a security boundary.
- Yellow on the rail is the **selected item’s text and icon** only — no left bar, no yellow pill or yellow fill. The active row also keeps the default sidebar-accent wash (same quiet highlight hover uses). Do not force `data-active:bg-transparent`. Elsewhere, yellow is at most one `Button variant="primary"` on a page. The rail must never become a yellow column.
- `ready: false` → route uses `ComingNext` placeholder (“Coming next” + body from the nav item). Prefer that over a 404.
- When shipping a real page: replace the placeholder `page.tsx`, set `ready: true` on that nav item, keep the same `href`.

Header title: `contextTitleForPath(pathname, role)` (nested job/QA workspaces have special titles).

### App shell

- **One** `SidebarTrigger`, in the page header, left of the title. It is in the same place
  at every width and is what a collapsed rail leaves reachable. `SidebarRail` is the second
  affordance — a drag/click edge, not a duplicate button. Do not add a trigger inside
  `SidebarHeader`. Header padding is tight (`pl-1.5 pr-3`, `h-14`) so the trigger sits
  next to the rail instead of in a wide gutter.
- Account chrome lives in `SidebarFooter` as shadcn/UAGC `NavUser`: a
  `SidebarMenuButton` trigger (initials, `user.name`, `roleLabel(role)`, chevron)
  that opens a `DropdownMenu` (identity header, Settings, Log out). The header
  has no account control. Settings links to `/ops/settings` or `/admin/settings`
  and is omitted for suppliers — do not invent Billing, My Account, or a
  profile page. Wrap every `DropdownMenuLabel` in `DropdownMenuGroup`.
- Signed-in main column uses `p-3 md:px-4 md:py-3`. Do not reintroduce `xl:px-8 xl:py-8`.
  Workspace/detail pages use a packed `lg:grid-cols-2` (not `xl:` — desktop is 1024px).
- `--sidebar-width-icon` is `3.75rem`, not shadcn's `3rem`: GRIDGO's 44×44 control floor
  overrides shadcn's `size-8`, and a 3rem rail clips nav labels mid-word. Labels are
  hidden with `group-data-[collapsible=icon]:hidden` rather than left to width clipping.
- Nav items use `tooltip={item.label}` so the collapsed rail is readable. Sub-rows
  (`menu-sub-button`) sit under the same 44px floor as rail rows in `globals.css`.
- The `Logo` belongs in exactly two places: the sign-in screen, where identity is being
  established — once, in the orientation column that answers "which GRIDGO site is this",
  not also inside the card — and `SidebarHeader`, where it doubles as the home control. It
  is furniture anywhere else. On collapse the wordmark goes and the mark stays.
  The mark is the landing 3×3 grid (`src/components/ui/Logo.tsx`): top-right
  `--color-brand-logo`, center-right and bottom-right `--color-brand-logo-muted`,
  other six `currentColor` so they invert with `--foreground`.
- Every `NavIconKey` maps to a distinct lucide icon. Two screens sharing a glyph teaches
  nothing; if you add a nav entry, give it an icon no sibling already uses.

## Operational model v2 — what this portal must get right

### Money, and who may see it

Commission secrecy is an **authorization rule**, not a layout preference. The server strips fields per role; the portal must not undo that.

| Figure                                                                                | Who sees it                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `supplierPriceMinor`                                                                  | Operations, Super Admin, and the assigned supplier (its own) |
| `commissionRatePercent` / `commissionMinor`                                           | **Operations and Super Admin only**                          |
| `subtotalMinor`, `deliveryFeeMinor`, `totalMinor`, `downpaymentMinor`, `balanceMinor` | everyone on the order                                        |
| `riderCommissionBps` / `riderPayoutMinor` / `platformDeliveryShareMinor`              | Operations, Super Admin and the rider — never the client     |

`MoneyBreakdown` is the Operations/Super Admin view and must never be imported into `src/app/supplier/**`. `src/components/orders/__tests__/money-visibility.test.ts` walks the supplier route tree and fails the build if it is, if a commission field is read there, or if cash on delivery reappears.

`deliveryFeeMinor` is the **gross** fee; the rider keeps `riderCommissionBps` of it (default 8,500 = 85%, half-up) and GRIDGO the remainder. The rate is snapshotted per order, so the settings control (`RiderDeliveryShare` in Operational settings) only moves new orders. Read the split through `orderDeliverySplit` (`src/lib/delivery-split.ts`), which returns null against an API without the fields so screens fall back to the gross fee. Contract: "Rider delivery split" in the API doc.

`totalMinor` **already includes delivery** in v2. Never write `totalMinor + deliveryFeeMinor` — that was the v1 shape and it double-counts.

### Payment is two installments, confirmed by hand

75% downpayment then 25% balance, both digital QR transfers. The client submits a reference; Operations confirms it (`payment_authorized`) or rejects it with a client-visible reason that returns the installment to `not_submitted` so they can resubmit. Rejection reasons are written **for the client to read** — see `PAYMENT_REJECTION_REASONS` in `src/app/ops/_lib/payments.ts`.

The seam is deliberately clean: a payment provider can replace the manual confirmation without redesigning the flow.

### Supplier payout is four milestones

Printing 50%, packaging and QC 15%, delivered 25%, retention 10% — of the **supplier's own price**, not the client total. Each releases only against a Proof of Fulfilment, and any active claim holds all of them.

Releasing a share is a person scanning the shop's own receiving QR (GCash / Maya / bank) with a wallet app. That plate and its words live on the shop's payout account (`SupplierPayoutAccount`; contract "Supplier payout account" in the API doc). Operations reads it as `order.supplierPayoutAccount` and sees it on `/ops/payouts/:id` and inside `ReleaseMilestoneDialog` (`src/components/orders/PayoutDestination.tsx`). A supplier sets it on `/supplier/payout-account` (`SupplierPayoutSettings`) or in the supplier app. The plate is always drawn on white, even in the dark theme, because a wallet camera reads dark-on-light; it is private to that shop and Operations and never appears on a client-facing surface.

### Removed by the captain's decision — do not reintroduce

- **Cash on delivery**, everywhere. This is a risk decision about rider cash handling, not a temporary simplification.
- **Paying with Pilot Credits.** Balances and grants remain (`admin/credits`); `POST /credits/authorize` is `410`.
- **The supplier proof approve / request-changes loop.** States `supplier_proof_*` and `awaiting_payment` are never accepted.
- **Flat per-zone delivery fees.** `Zone.deliveryFeeMinor` no longer exists; distance bands in Operational settings are the only authority.

### Settings the captain owns

`issueWindowHours` and `deliveryFeeBands` live in configuration so they change without a release. The shipped band figures (₱25 / ₱50 / ₱75) are **Firstmate's suggestion, not the captain's prices** — the screen says so, and should keep saying so until they set real ones.

## Push broadcasts — the one control that leaves the platform

`/admin/broadcast` is Super Admin only in this portal. The API also authorises
`ops_admin`; **do not open the megaphone to Operations here.** One press puts a
notification on lock screens, and **there is no unsend**. Live contract is
`POST /announcements` in `gridgo-api/docs/OPERATIONAL_MODEL_V2_API.md`
(Platform announcements). If you touch this screen, keep these properties.

- **No audience is pre-selected**, and "Everyone" sits last.
  `AUDIENCE_CHOICES` in `src/app/admin/_lib/broadcasts.ts` owns that order.
  Audiences are `everyone | clients | suppliers | riders | ops`. Labels stay
  plain language (customers, print shops, riders, operations).
- **`everyone` is the stranger channel.** It is the only audience that also
  reaches never-signed-in / signed-out phones. Say that before send.
  Confirmation restates audience and wording; for Everyone it restates the
  stranger reach. No generic "Are you sure?"
- **No destination URL.** Unclaimed push `data` is exactly `{type:"announcement"}`.
  A tap opens the app. If the download page is mentioned, it is operator copy
  ("tell them to open the app"), not a payload.
- **No pre-send audience-count route and no GET list.** Do not call
  `/admin/broadcasts`. Session-local last send is the resend guard
  (`findRecentDuplicate`). After send, show `notifiedUsers` and
  `unclaimedDevices`. A zero-zero result is a broken send; a partial count is
  normal (`presentAnnouncementReach`).
- Title ≤ 120, body ≤ 500. The lock-screen preview is the press check.

Client: `postAnnouncement` in `src/lib/api/client.ts`. Types: `Announcement`.

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

`/api/health` is liveness for _this process only_ and deliberately does not call the GRIDGO
API — otherwise an API outage would mark a healthy portal unhealthy and block shipping the
fix. It echoes the build commit and the baked `apiBase`, which is how a deploy is confirmed.

## Maintaining this file

When you learn something durable about this project that future sessions will need, add it here (or point to the authoritative file). Prefer links over copied detail. Remove stale claims when they stop being true.
