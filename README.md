# SMM AI Helper — Web

Independent **Next.js + TypeScript** SaaS frontend for [SMM AI Helper](https://github.com/Pickle-Pee/smm_ai_helper).

## Local development

Requirements: Node.js 20.9+ and npm.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Checks:

```bash
npm run lint   # TypeScript type-check
npm test       # Vitest: reducers, selectors, formatting, UI primitives
npm run build
```

## Current features (mock-only)

| Route | Screen |
| --- | --- |
| `/` | Dashboard: AI briefing composer, brands in work, AI results review queue, recent documents |
| `/workspace` | AI Workspace: conversation history, brand selector, marketing scenarios, structured results (metrics, stages, tables, checklists), brand context panel |
| `/projects`, `/projects/[id]` | Projects & brands: grid/table, filters, create/edit business context, work history, brand documents |
| `/documents` | Document Workspace: type tabs, filters, favourites, schematic previews, templates |
| `/settings` | Profile & workspace (local), demo state switcher, clearly locked team/billing/integrations/security |

**Important:** This is a frontend prototype, not a production application. It has no account system, durable storage, payments, or live AI access. Messages typed in the AI Workspace are kept in the current tab and labelled «AI не подключён». The demo project names and document entries are fictional examples.

Settings → «Демо-состояния» switches every section to loading / empty / error states for review.

## Structure

```
app/                 routes (App Router); (app)/layout.tsx wraps pages in the shell and providers
components/ui/       design-system primitives (Button, Badge, Card, Form, Tabs, Dialog, States, …)
components/shell/    sidebar, topbar, mobile tab bar, global search
features/<feature>/  model.ts (pure reducer + selectors, tested), store.tsx (provider), views and components
lib/api/             typed API contracts, mock adapter, ApiProvider (single integration point)
lib/mock/            fictional demo dataset
styles/tokens.css    design tokens
docs/design-system.md  design concept, palette, typography, components
```

## Integration policy

The backend lives in [smm_ai_helper](https://github.com/Pickle-Pee/smm_ai_helper). Access backend functionality only through future authenticated/versioned API contracts. Never ship `BOT_BACKEND_TOKEN`, Telegram actor headers, provider keys, or other service credentials in browser bundles. Replace the mock adapter in `lib/api/provider.tsx` with an HTTP client implementing `ApiClient` — components read data only through feature hooks.

## Project tracking

Product epic: [SaaS Platform #158](https://github.com/Pickle-Pee/smm_ai_helper/issues/158) · Frontend task: [#163](https://github.com/Pickle-Pee/smm_ai_helper/issues/163) · AI Workspace: [#164](https://github.com/Pickle-Pee/smm_ai_helper/issues/164) · Documents: [#167](https://github.com/Pickle-Pee/smm_ai_helper/issues/167) · Design: [#2](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/2).
