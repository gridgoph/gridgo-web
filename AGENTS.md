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
| `src/lib/api/` | Typed HTTP client — **only** place that calls `fetch` for the API |
| `src/lib/auth/` | Session cookies, AuthProvider, sign-in/out |
| `src/middleware.ts` | Role-path gate (supplier / ops / admin prefixes) |
| `src/lib/order-state.ts` | Plain-language state labels (no snake_case on screen) |
| `src/lib/supplier-actions.ts` | Valid supplier transitions for current state |
| `src/lib/ops-actions.ts` | Valid ops transitions + queue membership |
| `src/components/ui/` | shadcn/ui primitives + GRIDGO-specific components |
| `src/components/shell/` | App shell, nav rail, RoleGate |
| `src/app/supplier/` | Supplier partner surfaces |
| `src/app/ops/` | Operations surfaces |
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

## API honesty

Do **not** mock data behind a real-looking screen. Do **not** edit `gridgo-api`.

Missing endpoints (as of foundation): verification, roles admin, zones/fees, Pilot Credit grant, supplier service catalogue, user directories. If a screen needs one, omit it or show it as unavailable with an honest reason, and note `needs-decision: missing endpoint …` when blocked.

## Adding a screen

1. Confirm the API endpoint exists and is authorized for the role
2. Add calls only in `src/lib/api/client.ts`
3. Map states through `presentOrderState` / action tables — never raw enums in UI
4. Put the route under the correct role tree; nav items live in `AppShell`
5. Mobile cards below 768; keep essential row actions free of horizontal scroll — prefer `DataTable`
6. One yellow primary max on the page-level action surface (`Button variant="primary"`)
7. Compose from `src/components/ui/` — do not hand-roll a second button/input language

## Accessibility floor

- Visible `:focus-visible` (never `outline: none` without a replacement)
- 44×44 minimum controls
- Logical heading order
- Accessible names on icon-only controls
- `prefers-reduced-motion` respected in CSS
- Status readable in greyscale (icon + label)

## Maintaining this file

When you learn something durable about this project that future sessions will need, add it here (or point to the authoritative file). Prefer links over copied detail. Remove stale claims when they stop being true.
