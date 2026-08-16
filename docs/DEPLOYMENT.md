# Deploying the GRIDGO web portal

The portal is served at **`https://gridgo-dash.talasora.com`** and talks to the API at
**`https://gridgo-api.talasora.com`**.

Every merge to `main` builds a container image, publishes it to this repository's private
GitHub Container Registry, and asks the server to pull and restart. Nothing is deployed by
hand and nothing is built on the server.

| Piece                     | Lives at                                                                     |
| ------------------------- | ---------------------------------------------------------------------------- |
| Production image          | `Dockerfile`                                                                 |
| Server service definition | `deploy/docker-compose.yml` → installed as `~/gridgo/web/docker-compose.yml` |
| Pipeline                  | `.github/workflows/deploy.yml`                                               |
| Health check              | `GET /api/health` (`src/app/api/health/route.ts`)                            |
| Baked public config       | API URL + Clerk publishable key passed as Docker build arguments             |
| API URL assertion         | `scripts/assert-api-url.mjs`                                                 |
| Account-address assertion | `scripts/assert-no-account-addresses.mjs` (runs inside `npm run build`)      |

## How a change reaches users

```
merge to main
  └─ verify      typecheck · lint · test · next build · assert API URL in bundle
     └─ image    docker build → smoke test the built image → push sha-<12> and latest
        └─ deploy  ssh <deploy key> "web"  (token piped on stdin)
           └─ server: docker compose pull && up -d --remove-orphans
              └─ confirm https://gridgo-dash.talasora.com/api/health reports the merged commit
```

Each stage gates the next. A failing test never produces an image; an image that will not
start or answers `/api/health` wrongly is never pushed; a push that the server does not
actually pick up fails the run rather than reporting success.

### Which event does what, and why

| Event                                | Verify                                           | Build | Publish                | Deploy                  |
| ------------------------------------ | ------------------------------------------------ | ----- | ---------------------- | ----------------------- |
| `pull_request` (from a fork)         | yes                                              | yes   | **no**                 | **no**                  |
| `pull_request` (branch in this repo) | — covered by the `push` run on the same commit — |       |                        |                         |
| `push` to `fm/**`                    | yes                                              | yes   | `sha-…` + `branch-…`   | **no**                  |
| `push` to `main`                     | yes                                              | yes   | `sha-…` + **`latest`** | yes                     |
| `workflow_dispatch`                  | yes                                              | yes   | yes                    | only if run from `main` |

**A pull request must not deploy, and must not publish either.** A proposal is not a
decision. The server pulls from this registry, so an image in it is one `docker compose
pull` away from being live — an unreviewed branch has no business putting one there.
GitHub reinforces this: a pull request from a fork gets a read-only token, so it _cannot_
push even if the workflow asked it to. A branch push under `fm/**` does publish, but only
under immutable `sha-` / `branch-` tags; it never moves `latest`, which is the only tag
`~/gridgo/web/docker-compose.yml` names. That is what makes it possible to prove the whole
pipeline before trusting it with the live portal.

## Public browser configuration is baked in

`NEXT_PUBLIC_API_URL` is **inlined by the compiler into the JavaScript the browser
downloads**. It is not read when the container starts. Setting it in `docker-compose.yml`
would change nothing.

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` follows the same build-time rule. It is expected to be
public and connects ClerkJS to the production Clerk instance. Trusted branch builds read it
from the repository secret of the same name and pass it as a Docker build argument. Changing
either public value requires a rebuild.

Untrusted fork pull requests cannot read repository secrets. Their verify-only jobs use a
synthetic `pk_test_…` value and a plainly non-secret `sk_test_…` placeholder so Next.js and
the Dockerfile can exercise the complete build. Those jobs cannot publish or deploy.
Branch pushes, `main`, and manual trusted builds have no fallback: the real
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` repository secrets are required.

Get this wrong and the portal builds green, boots green, passes its health check — and then
every signed-in browser calls `http://127.0.0.1:8787`, the user's own machine. So the value
travels as a Docker **build argument**, and three separate checks assert it against the real
built output rather than against the environment that was meant to supply it:

1. The `builder` stage refuses to build at all if `--build-arg NEXT_PUBLIC_API_URL` is absent.
2. `scripts/assert-api-url.mjs` runs inside the build and greps the emitted client chunks for
   the literal URL. A build with no URL passes `next build` and fails here.
3. The workflow greps the _shipped_ image (not just the build stage), then boots it and
   checks `/api/health` reports the expected `apiBase`.

**To change the API URL** edit `NEXT_PUBLIC_API_URL` under `env:` in
`.github/workflows/deploy.yml` and merge. A rebuild is mandatory; there is no server-side
knob, deliberately, because a knob that appears to work but does nothing is worse than none.

`CLERK_SECRET_KEY` is different: it is server-only and must never be in a build argument,
image layer, browser variable, or repository file. BuildKit mounts it transiently while
Next builds, and `scripts/assert-no-clerk-secrets.mjs` scans the complete `.next` output.
At runtime Compose reads it from the server's gitignored `~/gridgo/web/.env`.

## The sign-in page must ship no account addresses

The same "assert against the built output" reasoning applies to a second thing that is
invisible until it is public. `/login` is reachable without a session, so any account
address rendered there — or merely present in a chunk behind a runtime flag — publishes the
account list to anyone who opens it.

`scripts/assert-no-account-addresses.mjs` greps the client chunks and the server bundle for
`…@gridgo.ph` / `…@gridgo.local` and the official Clerk supplier Gmail. It runs as part of
`npm run build`, so both the workflow's verify job and the Docker `builder` stage get it
for free — no separate step to forget.

The portal no longer carries local credential pickers. Clerk owns Google and email/password
sign-in, and the emitted-build assertion is the backstop against account disclosure. See
**Auth and role boundary** in `AGENTS.md`.

## What the environment needs

The portal needs the production Clerk keys from the same Clerk instance used by
`gridgo-api`:

| Variable                               | Where                                                                                    | Purpose                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`    | GitHub repository secret for trusted builds; Docker build argument                       | Public production ClerkJS configuration baked into the browser bundle                                |
| `CLERK_SECRET_KEY`                     | GitHub repository secret for trusted build/smoke; server `~/gridgo/web/.env` for runtime | Server-only production Clerk middleware token verification                                           |
| `GRIDGO_WEB_CLERK_RUNTIME_PROVISIONED` | GitHub `production` environment variable                                                 | Fail-closed operator attestation that the host has the current Compose file and runtime Clerk secret |

Never prefix the secret with `NEXT_PUBLIC_`, print it, or place it in Compose source.

**On the server** (`~` is the deploy user's home):

- Docker Engine with the Compose plugin.
- `~/gridgo/bin/deploy.sh` — the only command the CI key may run. It accepts exactly `api`
  or `web`, reads a registry token from stdin, `docker compose pull`, `up -d
--remove-orphans`, then logs out of the registry.
- `~/gridgo/web/docker-compose.yml` — a copy of `deploy/docker-compose.yml` from this repo.
- The `gridgo-edge` Docker network, created and owned by the Caddy project in
  `~/gridgo-proxy`. Our compose file joins it as `external`, so `docker compose down` here
  can never delete the network the API and the landing site also sit on.
- Caddy routing `gridgo-dash.talasora.com` → `gridgo-web:3000`. The container **must** be
  named `gridgo-web`; renaming it takes the portal off the internet.

**In this repository** (already present; do not recreate):

| Secret                              | Used for                                                            |
| ----------------------------------- | ------------------------------------------------------------------- |
| `DEPLOY_SSH_KEY`                    | private key pinned to `deploy.sh` in the server's `authorized_keys` |
| `DEPLOY_HOST`, `DEPLOY_USER`        | where to connect                                                    |
| `DEPLOY_KNOWN_HOSTS`                | the server's host key                                               |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | production Clerk publishable key used at build time                 |
| `CLERK_SECRET_KEY`                  | production Clerk secret used transiently for build/smoke            |

The `production` environment also has a non-secret
`GRIDGO_WEB_CLERK_RUNTIME_PROVISIONED` variable. The deploy job accepts only the exact value
`true`; an absent or different value stops before SSH. Set it only after the host checks in
the next section pass.

Host key checking stays **on** (`StrictHostKeyChecking=yes` against `DEPLOY_KNOWN_HOSTS`).
Accepting an unknown key would let anyone able to intercept the connection collect the deploy
key.

Registry authentication uses the workflow run's own `GITHUB_TOKEN`, piped to `deploy.sh` on
stdin. It expires when the run ends, so no long-lived registry credential sits on the server.

### TLS

Cloudflare terminates TLS **in front of** the server, in Flexible mode. Caddy and the
container both serve plain HTTP. Do not add certificates, TLS, or an HTTPS redirect inside
the container — behind Flexible mode a redirect to HTTPS returns to Cloudflare, which
forwards it as HTTP again, forever.

## First-time server installation

The current host must be upgraded before the first Clerk-only deployment. Until that is
complete, leave `GRIDGO_WEB_CLERK_RUNTIME_PROVISIONED` absent from the GitHub `production`
environment so the workflow cannot replace the working container with an image that lacks
its required runtime secret.

`deploy.sh` refuses with exit 65 (`web is not provisioned yet`) while that file is missing.
Once, as the deploy user:

```bash
mkdir -p ~/gridgo/web
# copy deploy/docker-compose.yml from this repository to ~/gridgo/web/docker-compose.yml
cd ~/gridgo/web
umask 077
printf 'CLERK_SECRET_KEY=%s\n' '<production Clerk secret>' > .env
docker compose config --quiet
docker compose config --images        # must print ghcr.io/gridgoph/gridgo-web:latest
```

After both checks succeed against the installed file, set the GitHub `production`
environment variable `GRIDGO_WEB_CLERK_RUNTIME_PROVISIONED=true`, then merge to `main` and
let the pipeline do the first deploy. The variable is only an attestation and never contains
the Clerk secret. Remove it before any future Compose or Clerk-runtime migration, then
restore it only after the installed host configuration has been verified again.

Do not `docker compose up` by hand first: the image is private, and CI is what supplies the
pull credential — by design, nothing durable authenticates this host to the registry. A
manual pull failing with `unauthorized` before the first CI publish is the expected, correct
state, not a fault. The image entry command and Compose interpolation both reject a missing
`CLERK_SECRET_KEY`, while the workflow attestation prevents an unprovisioned host from
reaching that crash instead of taking the portal offline.

**Keep the installed copy in step with `deploy/docker-compose.yml`.** Nothing synchronises
them; CI never writes to the server. After changing the compose file in this repository, an
operator must copy it across, or the server keeps running the old definition while the repo
suggests otherwise.

## Confirming a deploy actually succeeded

The pipeline already does this and fails the run if it cannot — `/api/health` reports the
commit the image was built from, so an old container answering is indistinguishable from no
deploy at all:

```bash
curl -s https://gridgo-dash.talasora.com/api/health
# {"ok":true,"service":"gridgo-web","apiBase":"https://gridgo-api.talasora.com",
#  "commit":"<the merged commit sha>","builtAt":"2026-08-11T00:38:09Z"}
```

Check, in order:

1. `ok` is `true` and `commit` matches the commit you expect. A stale `commit` means the
   restart did not take the new image.
2. `apiBase` is `https://gridgo-api.talasora.com`. Anything else — especially
   `http://127.0.0.1:8787` — means the image was built without the build argument.
3. The portal itself answers: `curl -s -o /dev/null -w '%{http_code}\n'
https://gridgo-dash.talasora.com/login` → `200`.

On the server:

```bash
cd ~/gridgo/web
docker compose ps          # gridgo-web must be Up and (healthy)
docker compose logs --tail 50 web
```

`/api/health` is deliberately **local only** — it does not call the GRIDGO API. A health
check that failed during an API outage would mark a working portal unhealthy and block
shipping a fix at exactly the wrong moment. API reachability is
`https://gridgo-api.talasora.com/health`.

## Rollback

Every successful build leaves an immutable `sha-<12 chars>` tag in the registry, so rolling
back is pinning the tag the compose file resolves. `image:` reads
`${GRIDGO_WEB_TAG:-latest}`, and Compose reads `.env` from the compose directory.

On the server, as the deploy user:

```bash
cd ~/gridgo/web
sed -i '/^GRIDGO_WEB_TAG=/d' .env
echo 'GRIDGO_WEB_TAG=sha-0123456789ab' >> .env     # a known-good tag
docker compose pull && docker compose up -d --wait
curl -s https://gridgo-dash.talasora.com/api/health   # commit must be the older one
```

Find the tag to roll back to under **Packages → gridgo-web** on the repository, or from the
"Resolve image name and tags" step of the run that shipped the version you want.

While `.env` pins a tag, **CI deploys stop having any effect** — `deploy.sh` pulls and
restarts, but the pinned tag never moves. That is the point during an incident, and a trap
afterwards. To hand control back:

```bash
cd ~/gridgo/web
sed -i '/^GRIDGO_WEB_TAG=/d' .env
docker compose pull && docker compose up -d --wait
```

If the registry pull itself fails (`no basic auth credentials`), the server is not logged
in — that credential is supplied per-run by CI and removed on exit, by design. Re-run the
workflow rather than storing a token on the box.

Rolling forward from a bad commit is usually better than pinning: revert on `main` and let
the pipeline ship it. Pinning is for when `main` cannot be fixed quickly enough.

## Related

- API deployment and its CORS allowlist: `docs/DEPLOYMENT.md` in `gridgo-api`. The API must
  allow `https://gridgo-dash.talasora.com` as a browser origin, or the portal will load and
  then fail every call.
- Design and product rules for anything user-facing: `AGENTS.md`.
