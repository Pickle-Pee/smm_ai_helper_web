# SMM AI Helper Web — Agent Instructions

## Product and repository boundaries
- This repository contains only the Next.js + TypeScript SaaS frontend.
- The Python/FastAPI backend and Telegram bot live in https://github.com/Pickle-Pee/smm_ai_helper.
- Never change the backend repository from a frontend task.
- Do not invent backend API contracts: until an authenticated Web API is approved, use mocks behind an adapter.

## Engineering
- Default to accessible, responsive and reusable UI components, not one-off pixel layouts.
- Preserve the SMM AI Helper design language: light canvas, navy navigation, turquoise/purple accents.
- No secret keys or service tokens in client-side code, environment variables prefixed NEXT_PUBLIC_, or generated bundles.
- Never send X-Telegram-User-ID from the browser as proof of identity.
- Keep marketing workspace, projects, documents, and account state separated by features.
- API integrations must use documented typed contracts and tenant-safe authentication.
- Write/update tests for each new behavior, and check build/typecheck before merging.
- No fake success messages for actions which are not implemented; label mock-only behaviors clearly.

## Pull requests
- Use feature branches; do not commit directly to main.
- Verify `npm run lint` and `npm run build`.
- State whether a change is mock-only or connected to production APIs.
- Link related tracking tasks in the backend product epic #158.
