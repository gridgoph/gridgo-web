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
| `src/components/shell/` | App shell, nav rail, RoleGate |
| `src/app/supplier/` | Supplier partner surfaces |
| `src/app/ops/` | Operations surfaces |
| `src/app/admin/` | Super Admin surfaces |
| `src/app/globals.css` | Design tokens (must match mobile) |

## Design tokens

Ported from `gridgo-client/constants/theme.ts` and `global.css`.

- **No new hex values.** Add tokens only if they exist in the mobile source of truth.
- Yellow (`action-yellow`) is a finite budget: one primary CTA per screen/panel; dense queues must not become yellow grids.
- Status is never colour alone — use `StatusChip` (icon + label).
- Spacing base 4px; radii field 12 / card 16 / pill 999.
- Breakpoints: mobile &lt;768, tablet 768–1023, desktop 1024–1439, wide 1440+.

Binding UX copy/interaction rules: `/home/kali/firstmate/data/gridgo-design-addendum.md` and the design requirements document under `gridgo-tinker`.

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
5. Mobile cards below 768; keep essential row actions free of horizontal scroll
6. One yellow primary max on the page-level action surface

## Accessibility floor

- Visible `:focus-visible` (never `outline: none` without a replacement)
- 44×44 minimum controls
- Logical heading order
- Accessible names on icon-only controls
- `prefers-reduced-motion` respected in CSS

## Maintaining this file

When you learn something durable about this project that future sessions will need, add it here (or point to the authoritative file). Prefer links over copied detail. Remove stale claims when they stop being true.
