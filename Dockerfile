# syntax=docker/dockerfile:1
#
# GRIDGO web portal — production image.
#
# Three stages so the shipped layer carries no build toolchain:
#   deps    — the full dependency tree, including devDependencies, because
#             `next build` needs TypeScript, Tailwind and PostCSS.
#   builder — compiles, then proves the API URL landed in the client bundle.
#   runner  — Next.js standalone output only.
#
# Why standalone: `output: "standalone"` (next.config.ts) traces the server
# files this app actually imports and emits them with a pruned `node_modules` —
# 16 packages and 60 MB here, against 560 packages and 712 MB installed. The
# runner copies that and never runs an install of its own, so nothing the build
# needed but the server does not (eslint, vitest, tailwind, the test libraries)
# can reach production. The alternative — `npm ci --omit=dev` in the runner —
# ships every production dependency whether the app imports it or not, and costs
# a second install.
#
# See docs/DEPLOYMENT.md.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci


FROM node:22-alpine AS builder
WORKDIR /app

# The API URL is compiled *into* the JavaScript the browser downloads. It has to
# be known here, at build time — a runtime environment variable is too late.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG GRIDGO_BUILD_SHA=unknown
ARG GRIDGO_BUILD_TIME=unknown
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
ENV NEXT_TELEMETRY_DISABLED=1

RUN test -n "$NEXT_PUBLIC_API_URL" || { \
      echo "Dockerfile: --build-arg NEXT_PUBLIC_API_URL is required." >&2; \
      echo "  Without it the bundle keeps its development fallback and the" >&2; \
      echo "  deployed portal calls http://127.0.0.1:8787 from users' browsers." >&2; \
      exit 1; \
    }
RUN test -n "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" || { \
      echo "Dockerfile: --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required." >&2; \
      exit 1; \
    }

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN --mount=type=secret,id=clerk_secret_key,required=true \
    CLERK_SECRET_KEY="$(cat /run/secrets/clerk_secret_key)" npm run build

# Assert against the real built output, not against the environment we intended.
RUN node scripts/assert-api-url.mjs


FROM node:22-alpine AS runner
WORKDIR /app

ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG GRIDGO_BUILD_SHA=unknown
ARG GRIDGO_BUILD_TIME=unknown

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} \
    GRIDGO_BUILD_SHA=${GRIDGO_BUILD_SHA} \
    GRIDGO_BUILD_TIME=${GRIDGO_BUILD_TIME}

# Own uid/gid rather than the image's built-in `node` user, so the numbers are
# stable and obvious to anyone reading a `docker top`.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Next writes here at runtime; it must exist and be writable by a non-root user.
RUN install -d -o nextjs -g nodejs /app/.next/cache

USER nextjs
EXPOSE 3000

# The proxy reaches the container by name on the `gridgo-edge` network; this
# check is the container's own opinion of itself, used by compose and by any
# operator running `docker ps`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Plain HTTP on purpose. Cloudflare terminates TLS in front of the server in
# Flexible mode, so an in-container HTTPS redirect would loop forever.
CMD ["node", "server.js"]
