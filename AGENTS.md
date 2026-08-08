# AGENTS.md — GRIDGO Web Portal

Guidance for any agent or human picking up this codebase.

## What this is

A single Next.js (App Router) portal for three roles: `supplier`, `ops_admin`, `super_admin`. Shared design system, API client, and auth. The signed-in role decides which route tree exists.

Mobile apps (client / supplier / rider) are separate repos. Do not invent a parallel product identity here.

## Commands

```bash
npm run dev          # http://localhost:3000
npm run build        # production build (must pass before PR)
npm run typecheck
npm run lint
npm test
```

API base: `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8787`).

Demo logins, password `demo`:

- `supplier@gridgo.local`
- `ops@gridgo.local`
- `admin@gridgo.local`

## Layout of the code

| Path | Owns |
|---|---|
| `src/lib/api/client.ts` | Typed HTTP client — **only** place that calls `fetch` for the API |
| `src/lib/api/types.ts` | Response/request types (no `any`) |
| `src/lib/api/constraints.ts` | Server rules the UI can explain *before* rejection (COD cap, holds, issue window) |
| `src/lib/nav.ts` | **Single** role→nav structure (`ROLE_NAV`); AppShell reads this only |
| `src/lib/auth/` | Session cookies, AuthProvider, sign-in/out |
| `src/middleware.ts` | Role-path gate (supplier / ops / admin prefixes) |
| `src/lib/order-state.ts` | Plain-language state labels (no snake_case on screen) |
| `src/lib/supplier-actions.ts` | Valid supplier transitions for current state |
| `src/lib/ops-actions.ts` | Valid ops transitions + queue membership |
| `src/components/ui/` | shadcn/ui primitives + GRIDGO-specific components |
| `src/components/shell/` | App shell, nav rail, RoleGate, `ComingNext` placeholders |
| `src/app/supplier/` | Supplier partner surfaces |
| `src/app/ops/` | Operations surfaces (QA queue + overview, matching, recovery, dispatch, claims, schedule, audit) |
| `src/app/ops/_lib/` | Ops-only pure helpers (overview buckets, matching explainers, location freshness, schedule events) — tests under `_lib/__tests__` |
| `src/app/admin/` | Super Admin surfaces |
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
| Dense queues | `DataTable` (`src/components/ui/data-table.tsx`) — cards below 768px |
| Modal | `Dialog` |
| Tablet secondary detail | `Sheet` or `Drawer` |
| Tabs / tooltips / toast | `Tabs`, `Tooltip`, `toast` + root `Toaster` |
| Pagination / schedule / search | `Pagination`, `Calendar`, `Command` |
| Loading / empty | `LoadingBlock` / `Skeleton`, `EmptyState` |

Root layout already wraps `TooltipProvider` and `Toaster`.

## Auth and role boundary

1. Login → `POST /auth/login` → cookies `gridgo_token` + `gridgo_role` + sessionStorage user
2. Middleware: wrong role path → redirect to that role's home; no token → `/login`
3. `RoleGate` re-checks live session via context
4. Logout → clear cookies + storage → `router.replace("/login")` (no back-button re-entry)

Suppliers are external partners. Never serve `/ops/*` or `/admin/*` to them — not even as soft-hidden UI.

## API client contract

**Rule:** pages never call `fetch`. Import from `@/lib/api` (or `@/lib/api/client`).

Authoritative API docs live in the separate `gridgo-api` repo (`AGENTS.md`, `README.md`, `PRD.md`). When docs and the running server disagree, **the server wins** — update types here to match observed JSON.

### Modules

| Module | Use for |
|---|---|
| `src/lib/api/client.ts` | One typed function per endpoint |
| `src/lib/api/types.ts` | Shared shapes (Order, User, Claim, …) |
| `src/lib/api/constraints.ts` | COD max (`COD_MAX_MINOR` = 150_000), payout-hold helpers, issue-window check, plain-language guidance |
| `src/lib/format.ts` | `formatPhp` / dates — money stays in **PHP minor units** through the client; format only at the edge |

### Client coverage (spine)

Auth: `login`, `logout`, `me`.  
Orders/jobs: `listOrders`, `listJobs`, `getOrder`, `createOrder`, `transitionOrder`.  
Credits: `creditBalance`, `authorizeCredits`, `grantCredits` (super).  
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
| `code` | `error` string (e.g. `forbidden`, `payout_held`, `cod_limit`) |
| `kind` | `unauthorized` · `forbidden` · `not_found` · `conflict` · `validation` · `server` · `unknown` |
| `details` / `detail(key)` | Extra body fields (`maxMinor`, `from`, …) |

Use `isApiError(err)` and branch on `kind` / `code` — **never** string-match human messages. Map codes to plain recovery copy in the page (design addendum).

### Constraints before rejection

Explain these *before* the user hits submit when the screen can know:

- COD total (product + delivery) ≤ ₱1,500 → `isWithinCodLimit` / `COD_MAX_MINOR`
- One active COD order → server `409 cod_one_active`
- Active claim hold blocks `payout_released` → `order.payoutHold`, `claimBlocksPayout`, `409 payout_held`
- Client issues only in `issue_window_open` → `canReportIssue`

Copy helpers: `PLATFORM_CONSTRAINT_COPY` in `constraints.ts`.

### API honesty

Do **not** mock data behind a real-looking screen. Do **not** edit `gridgo-api`.

If a screen still needs a capability the demo API does not expose, show an honest unavailable state and note `needs-decision: missing endpoint …` — do not invent a second client.

## Navigation contract

**Single source:** `src/lib/nav.ts` → `ROLE_NAV` keyed by portal role.

| Role | Surface (hrefs) |
|---|---|
| supplier | `/supplier/jobs`, `catalogue`, `schedule`, `capacity`, `payouts` |
| ops_admin | `/ops/overview`, `qa`, `matching`, `recovery`, `dispatch`, `claims`, `schedule`, `audit` |
| super_admin | `/admin/overview`, `verification`, `roles`, `catalogue`, `zones`, `credits`, `finance`, `audit`, `planning` |

- AppShell renders `navForRole(role)` only. Do **not** maintain separate nav arrays in components.
- Middleware + `RoleGate` still refuse another role’s URL; nav is not a security boundary.
- Yellow is **only** the selected rail indicator (and at most one `Button variant="primary"` on a page). The rail must never become a yellow column.
- `ready: false` → route uses `ComingNext` placeholder (“Coming next” + body from the nav item). Prefer that over a 404.
- When shipping a real page: replace the placeholder `page.tsx`, set `ready: true` on that nav item, keep the same `href`.

Header title: `contextTitleForPath(pathname, role)` (nested job/QA workspaces have special titles).

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

## Maintaining this file

When you learn something durable about this project that future sessions will need, add it here (or point to the authoritative file). Prefer links over copied detail. Remove stale claims when they stop being true.
