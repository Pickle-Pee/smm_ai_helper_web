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
npm run lint
npm run build
```

## Current features (mock-only)

- Branded responsive dashboard
- AI Workspace with demo chat interactions (no provider calls)
- Projects / brand overview
- Document Workspace catalogue
- Settings placeholder

**Important:** This is a frontend prototype, not a production application. It has no account system, durable storage, payments, or live AI access. The demo project names and document entries are fictional examples.

## Integration policy

The backend lives in [smm_ai_helper](https://github.com/Pickle-Pee/smm_ai_helper). Access backend functionality only through future authenticated/versioned API contracts. Never ship `BOT_BACKEND_TOKEN`, Telegram actor headers, provider keys, or other service credentials in browser bundles. Introduce an API client adapter before replacing mocks.

## Project tracking

Product epic: [SaaS Platform #158](https://github.com/Pickle-Pee/smm_ai_helper/issues/158) · Frontend task: [#163](https://github.com/Pickle-Pee/smm_ai_helper/issues/163) · AI Workspace: [#164](https://github.com/Pickle-Pee/smm_ai_helper/issues/164) · Documents: [#167](https://github.com/Pickle-Pee/smm_ai_helper/issues/167).
