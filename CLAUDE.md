# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

moSend (useSend) is an open-source email infrastructure platform — a self-hostable alternative to SendGrid/Mailgun. It handles transactional email, campaigns, contact management, domains, webhooks, and analytics.

## Commands

### Development
```bash
pnpm dx        # Full dev setup: install + docker compose up + migrations
pnpm dev       # Start dev server (requires dx to have been run first)
pnpm d         # dx + dev combined
```

### Testing
```bash
pnpm test:web          # Run all web tests
pnpm test:web:unit     # Unit tests only
pnpm test:web:trpc     # tRPC endpoint tests
pnpm test:web:api      # Public API tests
pnpm test:web:integration  # Integration tests (requires DB/Redis)
```

Tests live in `apps/web` and use **Vitest** with separate config files per category:
- `vitest.unit.config.ts`, `vitest.trpc.config.ts`, `vitest.api.config.ts`, `vitest.integration.config.ts`

### Database
```bash
pnpm db:generate       # Regenerate Prisma client after schema changes
pnpm db:migrate-dev    # Create and run a new migration
pnpm db:push           # Push schema without migration (dev only)
pnpm db:studio         # Open Prisma Studio UI
```

### Code Quality
```bash
pnpm lint              # ESLint across all packages
pnpm format            # Prettier formatting
```

### Build
```bash
pnpm build             # Build all packages via Turbo
```

## Architecture

### Monorepo Structure
- **`apps/web`** — Main Next.js 15 app (dashboard + API). The primary focus of most work.
- **`apps/marketing`** — Landing page (Next.js, port 3001)
- **`apps/smtp-server`** — Standalone SMTP server
- **`apps/docs`** — Documentation (Mintlify)
- **`packages/email-editor`** — Custom Tiptap-based visual email editor
- **`packages/sdk`** — TypeScript SDK for the public REST API
- **`packages/ui`** — Shared shadcn/ui + custom components
- **`packages/lib`** — Shared utilities

### `apps/web` Internal Structure

**Backend (`src/server/`):**
- `api/routers/` — 21 tRPC routers (one per domain: email, domain, campaign, contacts, webhook, etc.)
- `service/` — 30+ service classes with business logic (called by routers and jobs)
- `public-api/` — Hono-based REST API with OpenAPI docs (consumed by SDK and external callers)
- `jobs/` — BullMQ job handlers for async processing (email sending, webhooks, etc.)
- `auth.ts` — NextAuth configuration (GitHub, Google, Email providers)

**Frontend (`src/`):**
- `app/` — Next.js App Router pages and layouts
- `components/` — React components
- `trpc/` — tRPC client setup

**Database:**
- `prisma/schema.prisma` — Single schema with 30+ models: User, Team, Domain, Email, Campaign, Contact, Webhook, etc.

### Key Technical Decisions
- **tRPC** for internal client-server communication; **Hono** for the public REST API
- **BullMQ + Redis** for async job processing (email sending, webhook delivery)
- **AWS SES** for email delivery, **S3** for file storage, **SNS** for webhook notifications
- **Prisma** with PostgreSQL; all DB access goes through the Prisma client
- **NextAuth** with Prisma adapter; sessions include custom fields (isBetaUser, isAdmin, isWaitlisted)
- **TailwindCSS v4** with shadcn/ui components
- **jsx-email** renders the email editor output to HTML

### Adding New Features
- New tRPC endpoints: add router in `src/server/api/routers/`, register in `src/server/api/root.ts`
- New public API endpoints: add to `src/server/public-api/`
- New background jobs: add handler in `src/server/jobs/`, register with BullMQ queue
- Schema changes: edit `prisma/schema.prisma`, then run `pnpm db:migrate-dev` + `pnpm db:generate`

## Code Style

- Never install libraries without asking first
- Focus on readability over performance
- Leave no TODOs or placeholders — implement fully or don't add at all
- Use TypeScript strict mode; no `any` unless genuinely unavoidable
- Validate with **Zod** at system boundaries (API inputs, external data)
