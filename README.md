# GRIDGO Web Portal

One Next.js application serving three role-gated experiences against the GRIDGO demo API:

| Role | Local account | Home |
|---|---|---|
| Supplier partner | `supplier@gridgo.ph` | `/supplier/jobs` |
| Operations | `ops@gridgo.ph` | `/ops/qa` |
| Super Admin | `admin@gridgo.ph` | `/admin/overview` |

Those are the local demo API's accounts; ask Operations for the password. The
deployed portal's accounts are not these, and the sign-in page names none of
them — see [Auth and role boundary](AGENTS.md#auth-and-role-boundary).

Running `npm run dev`, the sign-in card offers a row of buttons that fill the
email field with the addresses above. That convenience is compiled out of a
production build; `npm run build` asserts it.

## Prerequisites

- Node 20+
- Demo API at `http://127.0.0.1:8787` (or set `NEXT_PUBLIC_API_URL`)

## Setup

```bash
npm install
cp .env.example .env.local   # optional; default is already 127.0.0.1:8787
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run format` | Prettier write |

## Deployment

Hosted at **`https://gridgo-dash.talasora.com`**. Merging to `main` builds a container
image, publishes it, and restarts the service on the captain's server; a pull request does
neither. Runbook — environment, rollback, and how to confirm a deploy landed — is
**[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**.

`NEXT_PUBLIC_API_URL` is compiled into the browser bundle, so the deployed API URL is a
Docker **build** argument, never a runtime environment variable. `docs/DEPLOYMENT.md`
explains why and what asserts it.

## Architecture

- **App Router** with TypeScript strict and Tailwind v4
- **Design tokens** ported from `gridgo-client` (`theme.ts` / `global.css`) — same hex values, no inventions
- **Typed API client** in `src/lib/api` — pages never call `fetch` directly
- **Auth** via `POST /auth/login` → bearer token cookies + `GET /auth/me`
- **Role gate** in middleware + `RoleGate` layout — one place decides which tree is reachable
- **Screens in this foundation**
  - Supplier: job inbox + order workspace (`GET /jobs`, `POST /orders/:id/transition`)
  - Operations: QA / action queue + workspace
  - Super Admin: platform overview from live orders + credit balances

## Known API gaps (not faked)

These have no demo endpoints — screens for them are omitted or called out as unavailable:

- Supplier verification, role management, zones/fees config
- Pilot Credit granting
- Supplier service catalogue (blueprint in progress)
- Platform user directories (supplier/rider lists) — overview derives IDs from orders

## Design rules (binding)

See `AGENTS.md` and the design requirements document. Critical web rules:

- Yellow budget: one page-level primary + at most one action-required chip in the first viewport — **no yellow row grids**
- Status = icon + label + colour (readable in greyscale)
- Breakpoints: 360–767 / 768–1023 / 1024–1439 / 1440+
- Table rows become labelled cards below 768px
- Visible focus, keyboard nav, WCAG 2.2 AA

## Auth notes

Sign-out uses `router.replace("/login")` and clears session cookies so the browser back button cannot re-enter a protected shell with a live token.
