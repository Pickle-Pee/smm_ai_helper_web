# Brenvio — Web

**Brenvio — AI Marketing Copilot.** Independent **Next.js + TypeScript** SaaS frontend (working brand name; formerly SMM AI Helper). Backend: [smm_ai_helper](https://github.com/Pickle-Pee/smm_ai_helper).

Public preview: https://app.24rubridge.ru (temporary domain, mock-only, `noindex`).

## Local development

Requirements: Node.js 20.9+ and npm.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Checks:

```bash
npm run lint        # TypeScript type-check
npm run check:api   # generated Web API v2 types match docs/api/web-api-v2.openapi.yaml
npm test            # Vitest: reducers, selectors, UI primitives, Web API v2 client/fixtures/recovery
npm run build       # standalone output (.next/standalone)
```

Production image and smoke test:

```bash
docker build --build-arg SITE_URL=https://app.24rubridge.ru --build-arg APP_VERSION=$(git rev-parse --short=12 HEAD) -t brenvio-web:local .
docker run --rm -p 127.0.0.1:3100:3000 --read-only --tmpfs /tmp --tmpfs /app/.next/cache:uid=1001,gid=1001 brenvio-web:local
bash scripts/smoke.sh http://127.0.0.1:3100
```

Build-time settings are listed in `.env.example`; none are secrets. Deployment, updates, rollback and monitoring: **[docs/operations.md](docs/operations.md)**.

## Current features (mock-only)

| Route | Screen |
| --- | --- |
| `/` | Dashboard: AI briefing composer, brands in work, AI results review queue, recent documents |
| `/workspace` | AI Workspace: conversation history, brand selector, marketing scenarios, structured results (metrics, stages, tables, checklists), brand context panel |
| `/projects`, `/projects/[id]` | Projects & brands: grid/table, filters, create/edit business context, work history, brand documents |
| `/documents` | Document Workspace: type tabs, filters, favourites, schematic previews, templates |
| `/settings` | Profile & workspace (local), demo state switcher, «Web API v2 · примеры» (contract walkthrough on test data), clearly locked team/billing/integrations/security |

**Important:** This is a frontend prototype, not a production application. It has no account system, durable storage, payments, or live AI access. Messages typed in the AI Workspace are kept in the current tab and labelled «AI не подключён». The demo project names and document entries are fictional examples.

Settings → «Демо-состояния» switches every section to loading / empty / error states for review.

## Structure

```
app/                 routes (App Router); (app)/layout.tsx wraps pages in the shell and providers
components/ui/       design-system primitives (Button, Badge, Card, Form, Tabs, Dialog, States, …)
components/shell/    sidebar, topbar, mobile tab bar, global search
features/<feature>/  model.ts (pure reducer + selectors, tested), store.tsx (provider), views and components
lib/api/             UI read contracts, mock adapter, ApiProvider (single integration point)
lib/api/generated/   Web API v2 types generated from docs/api/web-api-v2.openapi.yaml (do not edit)
lib/api/v2/          Web API v2: HTTP client (not connected), fixture client, request lifecycle, DTO → UI mappers
lib/mock/            fictional demo dataset
styles/tokens.css    design tokens
docs/api/               Web API v2 contract (C0): OpenAPI, fixtures, decision register, checker
docs/api-client.md      Web API v2 client (F1): mock vs HTTP, generation, tests, switch-on prerequisites
docs/design-system.md  design concept, palette, typography, components
docs/operations.md     deployment, update, rollback, monitoring runbook
deploy/                server compose files, Caddyfile, deploy/rollback/health scripts
scripts/smoke.sh       smoke test used by CI and after deploys
```

## Integration policy

The backend lives in [smm_ai_helper](https://github.com/Pickle-Pee/smm_ai_helper). Access backend functionality only through the authenticated, versioned Web API v2 ([contract](docs/api/README.md), proposed — not implemented in the backend yet). Never ship `BOT_BACKEND_TOKEN`, Telegram actor headers, provider keys, or other service credentials in browser bundles.

**F1 (current): mock-only.** The typed `WebApiV2Client` (same-origin `/api/v2`, cookie session, CSRF, typed errors) is implemented and tested with a fake `fetch`, but the app can only select the fixture transport (`lib/api/v2/mode.ts`): no request goes to `/api/v2`, no AI is called, and any example content is labelled «Пример из тестовых данных». Switching HTTP on is a separate reviewed step with backend, auth, edge and security prerequisites — see **[docs/api-client.md](docs/api-client.md)**.

## Project tracking

Product epic: [SaaS Platform #158](https://github.com/Pickle-Pee/smm_ai_helper/issues/158) · Web API v2: [architecture #6](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/6), [contract #7](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/7), [client F1 #9](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/9) · Frontend task: [#163](https://github.com/Pickle-Pee/smm_ai_helper/issues/163) · AI Workspace: [#164](https://github.com/Pickle-Pee/smm_ai_helper/issues/164) · Documents: [#167](https://github.com/Pickle-Pee/smm_ai_helper/issues/167) · Design: [#2](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/2).
