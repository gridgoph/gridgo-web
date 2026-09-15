# GRIDGO Web Portal

One Next.js application serving three role-gated experiences against the GRIDGO API:

| Role             | Home              |
| ---------------- | ----------------- |
| Supplier partner | `/supplier/jobs`  |
| Operations       | `/ops/orders`     |
| Super Admin      | `/admin/overview` |

Clerk authenticates the person; Postgres memberships returned by the GRIDGO API authorize
each role tree. The public sign-in screen names no account and offers no sign-up.

## Prerequisites

- Node 20.9+
- GRIDGO API at `http://127.0.0.1:8787` (or set `NEXT_PUBLIC_API_URL`). `npm run dev` reaches it through same-origin `/api/gridgo` so the browser never CORS-hits the API.
- Clerk publishable and secret keys for the same Clerk instance used by the API

## Setup

```bash
npm install
cp .env.example .env.local
# Fill NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and server-only CLERK_SECRET_KEY.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command             | Purpose                 |
| ------------------- | ----------------------- |
| `npm run dev`       | Dev server (Turbopack)  |
| `npm run build`     | Production build        |
| `npm start`         | Serve production build  |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint`      | ESLint                  |
| `npm test`          | Vitest unit tests       |
| `npm run format`    | Prettier write          |

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
- **Auth** via Clerk Google/email-password sessions; Clerk JWTs are sent as API bearer tokens
- **Role gate** via fixed `/auth/me/supplier|ops|admin` projections in `RoleGate`; Postgres
  memberships, never Clerk claims, decide which tree is reachable
- **Screens in this foundation**
  - Supplier: job inbox + order workspace (`GET /jobs`, `POST /orders/:id/transition`)
  - Operations: order queue and workspace for payment confirmations and QA, shared
    sign-up and service-line approvals, and rider locations under Field → Riders.
    Riders appear only while sharing location on an active trip; the list shows the last
    ping and links to the order. Location updates preserve map zoom, pan, and open popups.
  - Super Admin: platform overview from live orders + credit balances, with order and
    pickup-escalation workspaces reachable from the inbox

The header bell opens the **Desk** inbox. Its connection status and refresh behavior are
described in [Live resource updates](docs/REALTIME_UPDATES.md).

## Design rules (binding)

See `AGENTS.md` and the design requirements document. Critical web rules:

- Yellow budget: one page-level primary + at most one action-required chip in the first viewport — **no yellow row grids**
- Status = icon + label + colour (readable in greyscale)
- Breakpoints: 360–767 / 768–1023 / 1024–1439 / 1440+
- Table rows become labelled cards below 768px
- Visible focus, keyboard nav, WCAG 2.2 AA

## Auth notes

Opening a protected path while signed out sends the visitor through Clerk sign-in, then
returns them to that same path and query on the public portal host.

Sign-out waits for Clerk to end the session before clearing the portal identity, then keeps
the browser on `/login`. If `/login` ever sees a leftover signed-in session, it offers Log
out instead of sending that session home; protected routes require a new sign-in after a
successful logout.
