---
title: "Docker in Production: How I Containerise NestJS and Next.js Services"
date: 2026-04-25
excerpt: "Multi-stage Dockerfiles, image size reduction, BuildKit caching, and the docker-compose workflows I use for local dev across MongoDB, PostgreSQL, and Redis-backed services."
tags: [docker, devops, nestjs, nextjs, containers, production]
---

I containerise everything that ships — NestJS APIs, Next.js apps, Node workers, even the small Cron services. After several years of "why is this image 1.4 GB" and "why does CI take 11 minutes to build," here's the Docker setup I land on and the rationale behind each decision.

This isn't a "what is a container" post. It's the Dockerfile that actually goes to production.

## The NestJS Dockerfile I use

```dockerfile
# syntax=docker/dockerfile:1.7

# ---- Stage 1: deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# ---- Stage 2: build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Stage 3: runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps   --chown=app:app /app/node_modules ./node_modules
COPY --from=build  --chown=app:app /app/dist          ./dist
COPY --from=build  --chown=app:app /app/package.json  ./

USER app
EXPOSE 3000

# Use the JSON form so SIGTERM reaches Node directly
CMD ["node", "dist/main.js"]
```

What's actually going on:

- **`# syntax=docker/dockerfile:1.7`** — opts into BuildKit features (cache mounts, `COPY --link`, etc.). Required for the `--mount=type=cache` line below.
- **Three stages — `deps`, `build`, `runtime`.** The final image only contains what the runtime needs: production node_modules + the compiled `dist/`. No source code, no devDependencies, no `.git`, no junk.
- **`node:20-alpine`** — ~50 MB base vs. ~350 MB for `node:20`. Trade-off: Alpine uses musl libc, which occasionally trips up native modules. If you hit issues, switch to `node:20-slim` (~80 MB, glibc).
- **`--mount=type=cache,target=/root/.npm`** — BuildKit cache mount. npm's cache persists across builds, so the second build is fast even though node_modules isn't cached in the image layer.
- **`npm ci --omit=dev`** in deps stage — skip devDependencies for the runtime image.
- **`npm ci`** (not `npm install`) — uses the lockfile exactly, deterministic.
- **`--chown=app:app` on every COPY** — files arrive owned by the non-root user, no separate `chown -R` layer needed.
- **`USER app`** — last instruction before CMD. Container runs as non-root. If your app is compromised, the attacker isn't `root` inside the container.
- **JSON-array CMD** — so the process gets SIGTERM directly when the orchestrator wants to stop it. With shell form (`CMD node dist/main.js`), Node runs as a child of `/bin/sh`, which doesn't forward signals. Result: 30-second hangs on every deploy while ECS waits for graceful shutdown.

This Dockerfile produces a NestJS image around **120 MB** for a small/medium service. Not the smallest possible, but maintainable.

## The Next.js Dockerfile (standalone output)

Next.js 14+ has a `standalone` output mode that copies only the required `node_modules`. Use it.

```js
// next.config.js
module.exports = {
  output: 'standalone',
};
```

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static

USER app
EXPOSE 3000
CMD ["node", "server.js"]
```

This typically produces a **~150 MB** Next.js image. Without standalone output, you're looking at 400+ MB because the entire `node_modules` directory comes along.

## .dockerignore is the file that actually matters

Half of "my Docker build is slow" complaints are a missing `.dockerignore`. Without it, Docker sends your entire repo (including `node_modules`, `.git`, `.next`) as build context to the daemon. Every. Single. Build.

My baseline `.dockerignore`:

```gitignore
node_modules
.next
dist
build
coverage
.git
.github
.gitignore
.env*
!.env.example
*.log
README.md
docs/
.vscode
.idea
.DS_Store
Dockerfile
.dockerignore
```

After adding this to a repo that didn't have it, I've watched build context drop from 480 MB to 8 MB and build time drop from 90s to 12s. It's the single highest-leverage Docker change.

## Local development with docker-compose

For HousingCart-style stacks, I keep a `docker-compose.dev.yml` that spins up dependencies (MongoDB, PostgreSQL, Redis) but runs the app natively for fast HMR:

```yaml
# docker-compose.dev.yml
services:
  mongo:
    image: mongo:7
    ports: ["27017:27017"]
    volumes: ["mongo-data:/data/db"]
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 5

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    ports: ["5432:5432"]
    volumes: ["pg-data:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  mongo-data:
  pg-data:
```

`docker compose -f docker-compose.dev.yml up -d` and you've got a clean dev stack. New team member onboards in 5 minutes instead of 5 hours.

Critical detail: **named volumes** (`mongo-data`, `pg-data`), not bind mounts. Bind mounts share file ownership with the host and break on Linux/Mac differences. Named volumes are isolated, fast, and `docker compose down -v` wipes them cleanly.

The healthchecks matter when you have services that depend on each other. With Compose v2:

```yaml
  api:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
```

The API container won't start until Postgres is ready to accept connections. No more "the migration runs before Postgres is up" race conditions.

## Build args vs env vars — the difference that bites people

```dockerfile
ARG NPM_TOKEN          # build-time only, available during build
ENV NODE_ENV=production # baked into the image, available at runtime
```

- `ARG` is build-time. Available during `docker build`. Gone at runtime.
- `ENV` is runtime. Baked into the image. Available when the container runs.

**Never use `ENV` for secrets.** They're visible in `docker history` and to anyone who pulls the image. Use BuildKit secrets for build-time secrets:

```dockerfile
# syntax=docker/dockerfile:1.7
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN=$(cat /run/secrets/npm_token) \
    npm ci
```

```bash
docker build --secret id=npm_token,env=NPM_TOKEN .
```

The secret never lands in any layer.

## Caching strategy: order your Dockerfile correctly

Docker caches each layer. Cache invalidation cascades — change line 5 and lines 6-50 all rebuild.

The pattern:

1. Copy package files first
2. Run install (this layer survives every code change)
3. Copy source code last
4. Build

```dockerfile
COPY package.json package-lock.json ./    # changes rarely
RUN npm ci                                # cached unless lockfile changed
COPY . .                                  # changes every commit
RUN npm run build                         # re-runs every commit
```

If you `COPY . .` before `npm ci`, you invalidate the install layer on every single source change. Build time goes from 20 seconds to 2 minutes.

## Logging and observability

Containers should log to stdout/stderr. Period. Not to files inside the container — they'll be lost when the container restarts.

NestJS does this by default. For Next.js, your `console.log` works. For Node workers, use Pino:

```js
const logger = require('pino')({ level: process.env.LOG_LEVEL || 'info' });
logger.info({ orderId: 123 }, 'order placed');
```

The orchestrator (ECS, Kubernetes) picks up stdout and ships it to CloudWatch / Loki / wherever. Structured JSON logs are searchable — plain text isn't.

## Healthchecks are not optional

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1
```

Or expose a `/health` endpoint in NestJS:

```typescript
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
```

ALB target group health checks, ECS deployment health checks, and Kubernetes readiness probes all hit this endpoint. If it doesn't exist, the orchestrator can't tell when your container is ready vs. broken.

For richer checks, NestJS has `@nestjs/terminus` which can verify DB connections, Redis, external dependencies. Use it.

## Image size reduction checklist

If your image is >200 MB and you can't explain why, run through this:

1. ✅ Multi-stage build separating build deps from runtime deps?
2. ✅ Using `alpine` or `slim` base?
3. ✅ `.dockerignore` excluding `node_modules`, `.git`, `dist`?
4. ✅ `npm ci --omit=dev` for the runtime stage?
5. ✅ Removed dev tools (curl, git, build tools) from runtime?
6. ✅ Combined RUN steps to reduce layers (each `RUN` is a layer)?
7. ✅ For Next.js, `output: 'standalone'` set?

`dive` is the tool I use to audit image layers:

```bash
brew install dive
dive myapp:latest
```

It shows which layer added what and where to trim.

## docker run flags I actually use

```bash
docker run \
  --rm \                        # auto-remove on exit
  -d \                          # detached
  --name myapp \                # so you can docker logs it by name
  -p 3000:3000 \                # publish port
  --env-file .env \             # bulk env vars
  --memory 512m \                # cap memory
  --cpus 1 \                    # cap CPU
  --restart unless-stopped \    # auto-restart on crash
  --read-only \                 # immutable filesystem (security)
  --tmpfs /tmp \                # writable tmpfs for the few places that need it
  myapp:latest
```

`--read-only` + `--tmpfs /tmp` is a security posture I default to in production — if the container is compromised, the attacker can't write to the filesystem.

## What I don't do

- **No `latest` tag in production.** Every deploy uses the commit SHA. `latest` is mutable and untraceable.
- **No root user in the final image.** USER app, every time.
- **No Docker-in-Docker for builds.** Use GitHub Actions' BuildKit support or AWS CodeBuild. DinD is a security and complexity tax.
- **No "fat" base images.** `node:20` instead of `node:20-alpine` only if I've hit a specific musl problem.
- **No Compose in production.** Compose is a dev tool. For prod, use ECS / EKS / Nomad.

---

The Dockerfile is one of the highest-leverage files in your repo. A bad one slows every PR, eats every deploy, and bloats every storage bill. A good one fades into the background and lets you ship.

*Containerising a Node service for production? I architect ECS / EKS deployments end-to-end — [start a project](/#contact).*
