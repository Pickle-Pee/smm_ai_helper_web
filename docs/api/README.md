# Brenvio Web API v2 — контракт (C0, черновик)

> **Статус: PROPOSED.** Ни один маршрут `/v2` в backend сегодня не существует. Этот каталог — только
> документация, OpenAPI и JSON-примеры. Код backend и frontend, миграции, Docker, CI и production не менялись.
>
> Основание: аудит [#6](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/6)
> ([Addendum 1](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/6#issuecomment-6857772261),
> [Addendum 2](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/6#issuecomment-6858230970),
> [финальное ревью](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/6#issuecomment-6860263535)),
> задача [#7](https://github.com/Pickle-Pee/smm_ai_helper_web/issues/7), эпик
> [smm_ai_helper#158](https://github.com/Pickle-Pee/smm_ai_helper/issues/158).
> База сверки: backend `master` = [`76b6c1b`](https://github.com/Pickle-Pee/smm_ai_helper/tree/76b6c1b),
> frontend `main` = [`4e2d6e3`](https://github.com/Pickle-Pee/smm_ai_helper_web/tree/4e2d6e3).

## 1. Состав

| Файл | Что это |
|---|---|
| [`web-api-v2.openapi.yaml`](web-api-v2.openapi.yaml) | OpenAPI 3.1: 28 операций, 97 схем, каталог ошибок (`x-error-catalog`) |
| [`fixtures/`](fixtures/) | 59 JSON-примеров: ответы, ошибки, запросы, golden-негативы; реестр — [`fixtures/index.json`](fixtures/index.json) |
| [`decision-register.md`](decision-register.md) | Реестр решений D1–D18, три замечания финального ревью, решения C0 и открытые вопросы |

Метки в спецификации:

| Метка | Где | Значение |
|---|---|---|
| `x-status: existing` | схемы | дословная проекция DTO, существующего в backend `@76b6c1b`; файл-источник — в `x-source`. Здесь не редактируется |
| `x-status: proposed` | операции, схемы | новое в Web API v2; цель внутренней технической беты |
| `x-status: future` | операции, схемы | спроектировано, за feature flag, в бету не входит (веб-чат) |
| `x-status: deferred` | операции, схемы | форма намеренно не зафиксирована (детали legacy-истории) |

Существующие DTO: `BusinessContext`, `MarketSource`, `Confirmation`, `ConfirmationCandidate`, `OwnedSiteResult`,
`Finding`, `SourceSummary`, `Findings`, `Post`, `StrategySection`, `Strategy`, `Experiment`, `Experiments`,
`Calculation*`, `DirectResponse`, `ModuleResponse`, `NeedsInputResponse`, `RunStatus`, `Coverage`, `PublicFailure`,
`RunResponse` ([api_contracts.py](https://github.com/Pickle-Pee/smm_ai_helper/blob/76b6c1b/app/marketing_copilot/api_contracts.py));
`MentorSection`, `MentorExplanation`, `MentorQuestion`, `MentorAnswer`, `MentorTurn`, `MentorHistory`
([mentor_contracts.py](https://github.com/Pickle-Pee/smm_ai_helper/blob/76b6c1b/app/marketing_copilot/mentor_contracts.py)).
Всё остальное — новое.

## 2. Архитектура (C-lite)

```mermaid
flowchart LR
  subgraph Browser
    UI[Brenvio UI - Next.js client]
  end
  subgraph Host[Shared VPS]
    CADDY[Caddy edge :443]
    WEB[brenvio-web Next.js 127.0.0.1:3100 - только UI, без секретов]
    subgraph BE[smm_ai_helper]
      V2["/v2 Web API - cookie-сессия, CSRF, TenantAccess (PROPOSED)"]
      LEG["/copilot /projects /chat /internal - bot token (EXISTING)"]
      CORE[AI Core: CopilotAPI, ExecutionStore, GraphRunReader, CaseMentorService]
      WT[(web: users, sessions, orgs, projects, project_brands, threads, messages, snapshots)]
      CT[(core: marketing_runs, jobs, artifacts, brand_profiles)]
      WK[worker]
      BOT[Telegram bot - long polling]
    end
  end
  UI -->|HTML/JS| CADDY --> WEB
  UI -->|same-origin /api/v2/*| CADDY -->|rewrite в /v2/*| V2
  BOT -->|Bearer + X-Telegram-User-ID| LEG
  V2 --> WT
  V2 -->|owner = principal.user_id| CORE
  LEG -->|telegram_id -> user_id| CORE
  CORE --> CT
  WK --> CT
```

- **Next.js** отвечает только за интерфейс. Он не проксирует данные, не хранит токенов и не содержит логики Marketing Copilot.
- **FastAPI `/v2`** владеет сессиями, пользователями, организациями, проектами, брендами, тредами, сообщениями, правами
  доступа, вызовом Copilot/Orchestrator и сохранением результатов.
- **AI Core не меняется по смыслу**: остаётся user-scoped, владелец исполнения — `User.id`. Второго AI backend нет.
- Оба входа (бот и web) сходятся на `User.id` до вызова ядра; ядро не знает, откуда пришёл запрос.

## 3. Маршрутизация через Caddy

| Публичный URL (браузер) | Внутри | Кто обслуживает |
|---|---|---|
| `https://app.<domain>/api/v2/*` | `127.0.0.1:8000/v2/*` | FastAPI Web API v2 |
| `https://app.<domain>/*` (остальное) | `127.0.0.1:3100` | Next.js |
| `/copilot/*`, `/projects/*`, `/chat/*`, `/internal/*` и прочие legacy-пути | — | **наружу не публикуются** |

В OpenAPI пути записаны в нативном виде FastAPI (`/v2/...`), а `servers[0].url = /api`, поэтому публичный адрес
получается как `/api` + `/v2/...`. Нативные и edge-пути не смешиваются.

Предлагаемый блок Caddy (**F4, не входит в C0, не применён**):

```caddyfile
handle /api/v2/* {
	uri strip_prefix /api
	request_body {
		max_size 256KB
	}
	reverse_proxy 127.0.0.1:8000 {
		transport http {
			response_header_timeout 330s
		}
	}
}
```

Требования к маршруту: явный allowlist одного префикса; лимит тела (DTO-бюджет запроса — 128 KiB); таймаут больше
`GRAPH_TIMEOUT_SECONDS` (сейчас 300 с), потому что DIRECT и одиночный модуль выполняются внутри HTTP-запроса.
Ответы edge (413, 502, 504) могут быть не JSON — клиент обрабатывает их как `temporarily_unavailable`.
До F4 требуется подтверждение фактической prod-топологии (OQ-4).

## 4. Trust boundaries

| Зона | Учётные данные | Доверие | Что запрещено |
|---|---|---|---|
| Браузер | cookie `__Host-brenvio_session` + `X-CSRF-Token` | нулевое: principal определяется только сессией | `BOT_BACKEND_TOKEN`, `X-Telegram-User-ID`, ключи OpenAI, любые сервисные токены — ни в бандле, ни в `NEXT_PUBLIC_*`, ни в запросах |
| Next.js-контейнер | нет | не имеет доступа к данным | хранить секреты, ходить в backend от имени пользователя |
| `/v2` (web trust zone) | сессия | проверяет членство и роль на каждом запросе, без кэша прав | принимать bot-токен; принимать владельца из DTO |
| Legacy-маршруты (bot trust zone) | `BOT_BACKEND_TOKEN` + `X-Telegram-User-ID` | доверенный бот | принимать web-сессию; публиковаться через edge |
| AI Core | вызывается только сервисами backend | владелец = `User.id`, переданный сервером | авторизовать по членству в организации |

Почему нельзя передать bot-токен в браузер: `require_actor`
([security.py](https://github.com/Pickle-Pee/smm_ai_helper/blob/76b6c1b/app/security.py#L25)) доверяет заголовку
`X-Telegram-User-ID`, поэтому токен вместе с *любым* ID даёт доступ к данным *любого* пользователя.

Правила данных, пересекающих границу в браузер:

- Только allowlist-DTO. Поле `debug` из `ChatMessageResponse`, сырой `run.error`, внутренние claim/evidence ID, receipt ID,
  `status_url` ядра и Telegram ID в ответах `/v2` отсутствуют.
- Ошибки не повторяют введённые значения и не содержат свободного текста.
- Чужой и несуществующий ресурс неразличимы (`404 not_found`).

## 5. Аутентификация

### 5.1 Вход через одноразовую ссылку Telegram (internal beta — единственный способ)

```mermaid
sequenceDiagram
  autonumber
  actor U as Пользователь
  participant B as Bot
  participant V as FastAPI
  participant UI as Brenvio UI
  U->>B: «Открыть Brenvio»
  B->>V: POST /internal/identity/web-login-link (bot auth, не через edge)
  V-->>B: одноразовая ссылка, TTL 10 мин, в БД только hash
  B-->>U: https://app…/auth/telegram#t=<token>
  U->>UI: открывает ссылку
  UI->>V: POST /api/v2/auth/telegram/exchange {token}
  V-->>UI: 200 AuthSession + Set-Cookie __Host-brenvio_session
  UI->>V: GET /api/v2/me, /orgs, /orgs/{org}/projects
```

- Токен в **фрагменте** URL: не попадает в логи прокси и в `Referer`. Страница сразу убирает его из адресной строки.
- Неизвестный, истёкший и использованный токен неразличимы: `401 login_token_invalid`.
- Сессия создаётся на **тот же `users.id`**, что использует бот: данные не копируются и не сливаются.
- При первом входе создаются personal-организация и personal-проект; legacy-профиль Telegram, если он есть,
  однократно копируется в `project_brands` (см. §8).

Companion-контракт бота (**proposed, вне OpenAPI**: другая trust-зона, в сгенерированный браузерный клиент попадать не должен):

| | |
|---|---|
| Метод и путь | `POST /internal/identity/web-login-link` |
| Аутентификация | существующий `require_actor` (bot token + `X-Telegram-User-ID`); через edge не маршрутизируется |
| Запрос | пустое тело; пользователь — сам actor (ссылку можно получить только для себя) |
| Ответ | `{"url": "https://app.<domain>/auth/telegram#t=<token>", "expires_at": "<RFC 3339>"}` |
| Ошибки | существующие `401`/`503` bot-зоны; rate limit на пользователя |

### 5.2 Сессия и CSRF

- Cookie `__Host-brenvio_session`: случайные 256 бит, `HttpOnly; Secure; SameSite=Lax; Path=/`, без `Domain`.
  В `web_sessions` хранится только `sha256(token)`. Предлагаемые сроки: idle 7 дней, absolute 30 дней (OQ-7).
- На каждом небезопасном методе (`POST`, `PATCH`, `DELETE`) обязательны `X-CSRF-Token` и same-origin
  `Origin` / `Sec-Fetch-Site`. Токен привязан к сессии, выдаётся в `AuthSession.csrf_token` и `GET /v2/auth/csrf`.
  Клиент держит его в памяти; после `403 csrf_failed` запрашивает заново и повторяет запрос.
- CORS отсутствует: API только same-origin.
- `POST /v2/auth/logout` отзывает сессию; идемпотентен. Выход не отменяет выполняющуюся AI-работу.

### 5.3 Что отложено

Email magic link / OTP (`WEB_EMAIL_LOGIN_ENABLED`, B2e), OIDC, привязка Telegram к web-only аккаунту и merge аккаунтов
в спецификацию не входят. Схема данных к ним готова: `users.telegram_id` nullable,
`external_identities.provider ∈ {telegram, email, oidc:*}`. Web-only пользователь никогда не получает вымышленный Telegram ID.

## 6. Модель данных (proposed)

```mermaid
erDiagram
  users ||--o{ external_identities : has
  users ||--o{ web_sessions : has
  users ||--o{ memberships : has
  organizations ||--o{ memberships : has
  organizations ||--o{ projects : owns
  projects ||--|| project_brands : "exactly one"
  projects ||--o{ workspace_threads : has
  workspace_threads ||--o{ thread_messages : "ordered by seq"
  thread_messages ||--o| result_snapshots : "immutable result"
  users ||--o| brand_profiles : "legacy Telegram, без изменений"
  thread_messages }o--o| marketing_runs : "core_ref, запись ядра принадлежит автору"
```

| Таблица | Назначение | Ключевые поля | В API |
|---|---|---|---|
| `users` (existing, меняется только nullable) | единый principal обоих каналов | `id`, `telegram_id` → **nullable** | `User`, `UserRef` |
| `external_identities` | способы входа | `user_id`, `provider`, `subject`, `verified_at`; `UNIQUE(provider, subject)` | `Identity` (без subject) |
| `web_sessions` | браузерные сессии | `user_id`, `token_hash`, `expires_at`, `revoked_at` | `SessionInfo` |
| `organizations` | граница тенанта | `id`, `kind ∈ {personal, team}`, `name`, `deleted_at` | `Organization` |
| `memberships` | членство и роль | `(org_id, user_id)`, `role`, **`version`**, **`revoked_at`** | `OrganizationMembership` (version не отдаётся) |
| `projects` | SaaS-проект; принадлежит организации | `id`, `org_id`, `name`, `status`, `color`, `version`, `deleted_at` | `Project` |
| `project_brands` | **отдельная таблица**, ровно одна строка на проект | `project_id` (PK, FK cascade), `org_id`, поля бренда, `extra_json`, `version`, `updated_by`, `imported_from_brand_profile_id` (без FK), `imported_at` | `ProjectBrand` |
| `workspace_threads` | проектный контейнер запросов | `id`, `org_id`, `project_id`, `created_by`, `kind`, `title`, `last_seq`, слот in-flight, `deleted_at` | `Thread` |
| `thread_messages` | запрос (ревизия) и ответ | `thread_id`, `org_id`, `project_id`, `seq`, `role`, `created_by`, `request_key`, `revision`, принятый запрос, `payload_sha256`, `state`, `core_kind`, `core_ref`; `UNIQUE(thread_id, seq)`, `UNIQUE(created_by, request_key, revision, role)` | `UserMessage`, `AssistantMessage` |
| `result_snapshots` | неизменяемый результат | `message_id` (UNIQUE), `org_id`, `project_id`, `envelope_version`, `schema_version`, `result_kind`, `payload`, `payload_sha256`, `writer_version`, provenance | `ResultSnapshot` |

Вспомогательные (в API не видны): `auth_tokens` (одноразовые токены входа), `web_chat_context` (future, B9).

Инварианты:

- `brand_profiles`, `UNIQUE(user_id)`, `User.brand_profile` и `BrandProfileService` **не меняются**; таблицей пользуется только Telegram.
  Web никогда не пишет в `brand_profiles`.
- `marketing_runs`, `jobs`, `orchestration_plans`, `marketing_artifacts`, `conversations`, `messages` не меняются.
- `org_id` / `project_id` денормализованы в сообщениях и snapshots: каждый запрос фильтруется одним условием по тенанту.
  Перенос проекта между организациями не поддерживается.
- Миграции — только expand, от фактического head `master` после стека Codex #174 (D17, OQ-5).

## 7. Роли, владение и безопасность

### 7.1 Кто есть кто

| Вопрос | Ответ контракта |
|---|---|
| **Кто автор AI-запроса** | `principal.user_id` сессии, сохранённый в `thread_messages.created_by`. В DTO нет поля владельца — подставить чужого невозможно |
| **Кто владелец исполнения в ядре** | тот же `User.id`: receipt, graph run, артефакты и mentor-компаньон принадлежат автору (как сегодня) |
| **Кому принадлежит проект** | организации (`projects.org_id`), а не создателю. Уход участника проект не затрагивает |
| **Кто видит результат** | любой активный участник организации проекта (роль `viewer` и выше) — через проектное сообщение и snapshot, а не через запись ядра |
| **Кто запускает новые запросы** | участник с ролью `editor` или `owner`; ядро вызывается только от его собственного имени |
| **Кто отвечает на уточнение, задаёт вопрос наставнику** | только автор запроса |

Совместный доступ возникает **только** в web-слое: `thread_messages.project_id → projects.org_id → memberships`.
Ни один запрос `/v2` не авторизует по `marketing_runs.user_id` коллеги.

### 7.2 Матрица доступа

| Действие | viewer | editor | owner | Не участник |
|---|---|---|---|---|
| Читать проекты, бренд, треды, сообщения, snapshots, объяснение и историю наставника | ✅ | ✅ | ✅ | 404 |
| Создавать и редактировать проект и бренд, создавать тред | 403 | ✅ | ✅ | 404 |
| Отправлять AI-запрос | 403 | ✅ | ✅ | 404 |
| Отвечать на `NEEDS_INPUT`, восстанавливать запрос по `request_key`, создавать объяснение и спрашивать наставника | автор | автор | автор | 404 |
| «Убрать тред из проекта» | 403 | автор треда | ✅ | 404 |
| Импорт Telegram-бренда | — | — | owner **personal**-организации | 404 |
| Личная Telegram-история | только сам пользователь (`/v2/me/telegram-history`) | | | |

Правило кодов: ресурс не виден → `404 not_found`; ресурс виден, но роли или авторства недостаточно → `403 forbidden`.
Addendum 1 предлагал 404 и для второго случая — это вынесено на подтверждение (C0-1).
Во внутренней бете (personal-организация, роль `owner`) `403 forbidden` практически не возникает.

### 7.3 Делегированное чтение и повторная проверка

Незавершённый workflow, открытый другим участником, читается так:

1. `TenantAccess` проверяет членство по web-таблицам и запоминает `membership_version`.
2. Делегированное чтение `GraphRunReader.get_for_owner(owner = message.created_by, run_id = message.core_ref)`:
   owner-фильтр ридера сохраняется, владелец берётся из проверенной проектной привязки, а не из запроса.
3. **Повторная проверка** `membership_version` и `revoked_at IS NULL` непосредственно перед формированием ответа.
   Если членство изменилось — payload отбрасывается, ответ `404`.

Формулировка гарантии (замечание 2 финального ревью): *доступ проверяется непосредственно перед формированием ответа;
все последующие запросы отклоняются.* Это **не** линеаризуемая гарантия: отзыв, зафиксированный после шага 3, может
совпасть по времени с доставкой этого одного ответа. Строгая атомарность потребовала бы отдельного протокола блокировок,
которого в контракте нет.

Receipt ядра (`ExecutionStore.get`) читается только для автора: он не является проектным материалом.
Для остальных участников до материализации показывается состояние с `next_action: wait_for_author`.

### 7.4 Отзыв доступа

- Отзыв или понижение роли увеличивает `memberships.version`; прав никто не кэширует, поэтому следующий запрос получает 404/403.
- Понижение `editor → viewer` до claim ядра: запрос отклоняется, ядро не вызывается.
- Отзыв после claim: run продолжается и остаётся записью ядра автора; бывший участник через проект его не видит.
- Материалы, созданные бывшим участником в проекте, остаются проектными.
- Повторное приглашение создаёт новый `membership_version`.

Тесты O-T1…O-T5 и T1…T10 из аудита сохраняются, с реалистичными утверждениями о конкурентности.

### 7.5 Почему Telegram-история остаётся личной

Она создана пользователем лично, вне какой-либо организации, и содержит его переписку с ботом. Поэтому:
единственная точка доступа — `/v2/me/telegram-history`, только для самого пользователя и только при наличии
Telegram-identity; параметров организации или проекта у неё нет; в org-эндпоинтах она не появляется ни для владельца,
ни для коллег. Поштучный импорт элемента в проект — явное будущее действие владельца (B11), в C0 не входит.

### 7.6 Примеры ошибок доступа

| Ситуация | Ответ | Фикстура |
|---|---|---|
| Проект другой организации | `404 not_found` | [`errors/not-found-foreign-project.404.json`](fixtures/errors/not-found-foreign-project.404.json) |
| Тред другой организации | `404 not_found` | [`errors/not-found-foreign-thread.404.json`](fixtures/errors/not-found-foreign-thread.404.json) |
| Попытка получить чужой AI-run (через сообщение или `request_key`) | `404 not_found` | [`errors/not-found-foreign-run.404.json`](fixtures/errors/not-found-foreign-run.404.json) |
| viewer отправляет запрос | `403 forbidden`, ядро не вызвано | [`errors/forbidden.403.json`](fixtures/errors/forbidden.403.json) |

Три тела `404` идентичны с точностью до `request_id` — и идентичны ответу на несуществующий id.
`run_id` ядра не является адресом в `/v2`: эндпоинта, принимающего его, нет.

## 8. Бренд проекта и Telegram BrandProfile

- `ProjectBrand` повторяет имена и типы полей `BrandProfile` (`brand_name`, `product_description`, `audience`, `tone`,
  `goals`, `channels`), поэтому существующие чистые функции `to_context` и `brand_entries` работают через адаптер без правок ядра.
- `extra` — allowlist. Часть ключей (`customer_job_or_need`, `relevant_alternative`, `product_truth`, `existing_proof`,
  `geography`, `economics`) существующий `brand_entries`
  ([http_context.py](https://github.com/Pickle-Pee/smm_ai_helper/blob/76b6c1b/app/marketing_copilot/http_context.py#L36))
  уже передаёт в ядро как brand-слой; `industry`, `usp`, `competitors` — описательные поля UI, в модель сегодня не попадают.
- **Импорт — копирование, а не синхронизация.** `POST /v2/projects/{id}/brand/import-telegram` копирует личный legacy-профиль
  в personal-проект с provenance `imported_from`. После этого записи независимы: правки в боте не появляются в web-проекте,
  правки в web никогда не пишутся в Telegram. В UI это должно быть сказано прямо: единое AI-ядро не означает единого хранилища бренда.
- **Открытый продуктовый вопрос (OQ-1):** ручная повторная синхронизация («импортировать снова») не согласована.
  До решения повторный импорт закрыт флагом `WEB_BRAND_REIMPORT_ENABLED` (`403 feature_disabled`),
  а `permissions.can_import_telegram_brand` становится `false` после первого импорта.

## 9. Обработка ошибок

Единственное тело ошибки — `ErrorResponse`: `schema_version`, `kind: "ERROR"`, `code`, `request_id`,
опционально `retry_after_seconds` и `owned_site`. Текст показывает UI по `code`. Полный каталог с HTTP-статусом и
политикой повтора — `x-error-catalog` в спецификации; у каждой операции перечислены её коды (`x-error-codes`).

| HTTP | Коды | Что делает клиент |
|---|---|---|
| 401 | `unauthenticated`, `login_token_invalid` | экран входа |
| 403 | `csrf_failed`, `forbidden`, `feature_disabled` | новый CSRF-токен и повтор / показать причину |
| 404 | `not_found`, `mentor_explanation_missing` | «не найдено» |
| 409 | `request_conflict`, `revision_conflict`, `thread_busy`, `stale_project`, `idempotency_conflict`, `confirmation_changed`, `confirmation_unavailable`, `telegram_identity_required`, `import_source_missing`, `mentor_not_applicable`, `result_not_ready`, `result_format_unsupported`, `stale_thread` (future) | по коду, без автоматического повтора (кроме `thread_busy`, `result_not_ready`) |
| 410 | `result_gone` | «результат недоступен»; новый запрос — только по явному действию |
| 413 / 422 | `payload_too_large`, `invalid_request`, `invalid_confirmation` | исправить запрос |
| 429 | `rate_limited`, `quota_exceeded` | подождать `Retry-After`; лимиты проверяются **до** обращения к ядру |
| 503 | `temporarily_unavailable`, `result_corrupted`, `result_unreadable` | восстановление по ключу / сообщение о сбое |

Существующие коды ядра сохраняют смысл: `request_conflict`, `confirmation_changed`, `confirmation_unavailable`,
`invalid_confirmation`, `invalid_request`, `not_found`, `temporarily_unavailable`. Не выходят на `/v2`:
`stale_context` (контекст Telegram-чата; web всегда передаёт `context_version = None`) и `execution_invalid`
(после него receipt ядра становится `ambiguous`, что `/v2` показывает как состояние, а не ошибку).

## 10. Идемпотентность и восстановление

Цель: обновление страницы, двойной клик, вторая вкладка и обрыв сети **не вызывают** повторной генерации.
Exactly-once для внешней модели **не обещается**.

1. **Генерация `request_key` на клиенте.** `w-` + UUIDv7 (`^w-<uuid v7>$`). Префикс отделяет web-ключи от ключей бота
   (`tg:<actor>:<chat>:<message>`); ключ удовлетворяет существующему паттерну ядра и живёт в пространстве автора.
   Ключи не переиспользуются никогда, в том числе после истечения receipt.
2. **Сохранение до отправки.** До `POST` клиент записывает в IndexedDB `{thread_id, request_key, revision, payload}`.
   Запись удаляется только после получения долговременного состояния.
3. **Повтор после сетевой ошибки.** Обрыв, таймаут, 502/504 или `503`: клиент вызывает
   `GET /v2/threads/{thread_id}/requests/{request_key}`.
   `404` — сервер запрос не сохранил: отправить тот же запрос тем же ключом.
   `200` — следовать `next_action`. Повторный `POST` с тем же ключом, ревизией и payload всегда безопасен: это replay.
4. **`NEEDS_INPUT`: ключ сохраняется, ревизия меняется.** Ответ на уточнение — тот же `request_key`, `revision + 1`,
   тот же `message`, дополненный payload (контекст, подтверждение). Это существующий контракт ядра: только receipt
   в состоянии `needs_input` принимает изменённый payload
   ([execution_store.py](https://github.com/Pickle-Pee/smm_ai_helper/blob/76b6c1b/app/marketing_copilot/execution_store.py#L95)).
   Ядро при этом **перезаписывает** receipt, поэтому snapshot вопроса создаётся web-слоем сразу.
   Каждая ревизия — отдельная пара сообщений; `is_latest_revision` показывает актуальную.
5. **`409 request_conflict`.** Тот же ключ и ревизия с другим payload либо ключ, использованный в другом треде.
   Клиент payload под ключом не меняет; UI сообщает, что запрос уже отправлен в другом виде. Новая задача — новый ключ.
   `409 revision_conflict` — ревизия не следующая за `needs_input` или изменён `message`.
6. **`503` и неизвестный результат.** `503 temporarily_unavailable` означает «исход пока не определён», а не «ничего не
   произошло»: клиент восстанавливается по ключу (п. 3) и **не создаёт новый ключ**. Если ядро зафиксировало неизвестный
   исход, состояние становится `ambiguous` (HTTP 200): автоповтора нет, результат «неизвестен». Кнопка «Отправить заново»
   создаёт **новый** ключ и предупреждает, что генерация может повториться.
7. **Polling асинхронных задач.** `202` + `state: running` → `GET /v2/messages/{id}` с интервалом `poll_after_ms`
   (2 с → 5 с → 10 с), пока `next_action == "poll"`. SSE и стриминга нет. После перезагрузки или с другого устройства
   клиент находит выполняющийся запрос через `Thread.in_flight`.
8. **Сохранение окончательного результата.** Терминальное состояние ядра материализуется в неизменяемый snapshot
   идемпотентной вставкой: синхронные результаты — в ответе `POST`, workflow — при первом чтении после завершения и фоновым
   sweeper в API-процессе. Транзакции web и ядра не объединяются; во время вызова модели транзакции не удерживаются.
9. **Открытие старого треда после удаления receipt.** `GET /v2/threads/{id}/messages` читает только web-таблицы и snapshots.
   Receipt ядра удаляется через 30 дней — на историю это не влияет. Если snapshot создать не успели, состояние `expired`;
   результат **не регенерируется**.

### 10.1 Состояния и действия

| `state` | Откуда | Snapshot | `next_action` автора |
|---|---|---|---|
| `pending` | сообщение сохранено, admission ядра не подтверждён | нет | `resubmit_same_key` |
| `running` | ядро приняло запрос (синхронный вызов или граф) | нет | `poll` |
| `needs_input` | `NEEDS_INPUT` | `NEEDS_INPUT` | `answer_clarification` |
| `completed` | `DIRECT_RESULT`, `MODULE_RESULT`, run `COMPLETED` | да | `none` |
| `completed_with_limitations` | run `COMPLETED_WITH_LIMITATIONS` | `RUN` | `none` |
| `blocked` / `failed` | run `BLOCKED` / `FAILED` | `RUN` с `PublicFailure` | `start_new_request` |
| `ambiguous` | исход после admission неизвестен | нет | `start_new_request` |
| `expired` | receipt истёк до материализации либо запрос не был принят в окне admission | нет | `start_new_request` |
| `unsupported` | ядро вернуло `CONVERSATION`, веб-чат выключен | `UNSUPPORTED` | `none` |

`next_action` вычисляет сервер; клиент не воспроизводит автомат состояний. Не-автор вместо действий автора получает
`wait_for_author`.

### 10.2 Точки отказа

| Где сбой | Что в БД | Восстановление без повторного вызова модели |
|---|---|---|
| до записи сообщения | ничего | `getRequestByKey` → 404 → тот же запрос тем же ключом |
| между записью сообщения и claim ядра | `pending`, receipt нет | `next_action: resubmit_same_key`; одну генерацию гарантирует claim ядра |
| между claim и завершением | receipt `running` | `running` → polling |
| ядро завершилось, snapshot не записан | receipt `completed` / `needs_input` | чтение автором: replay из `ExecutionStore.get` без модели → идемпотентная материализация |
| ядро зафиксировало `ambiguous` | receipt `ambiguous` | состояние `ambiguous`; новый ключ только по явному действию |
| workflow терминален, snapshot нет | run терминален | ленивая материализация при чтении + sweeper |
| receipt удалён (30 дней) до материализации | receipt нет | `expired`, без регенерации; graph runs не истекают |
| двойной клик, две вкладки | — | уникальность `(created_by, request_key, revision, role)` + claim ядра; второй ответ — replay |
| другой запрос в том же треде | слот треда занят | `409 thread_busy` |

Замечание для backend (C0-7): через публичные методы `ExecutionStore` состояния `running` и `ambiguous` неразличимы
(оба → 503). Нужен read-only `peek` состояния receipt в ядре (по согласованию с Codex) либо вывод по времени:
синхронное исполнение ограничено `GRAPH_TIMEOUT_SECONDS`, receipt без терминала дольше этого окна считается `ambiguous`.

## 11. Долговременное хранение

Receipt ядра хранится 30 дней и активно удаляется; историей он быть не может. Долговременная история — неизменяемые snapshots.

### 11.1 Конверт

| Поле | Смысл |
|---|---|
| `envelope_version` | формат самого конверта (`1`) |
| `schema_version` | контракт `payload` **на момент записи**: `copilot_api.v1`, `web_api.v2` (для `UNSUPPORTED`), `web_chat.v1` (future) |
| `result_kind` | `DIRECT_RESULT`, `MODULE_RESULT`, `NEEDS_INPUT`, `RUN`, `UNSUPPORTED`, `CHAT_REPLY` (future) |
| `writer_version` | сборка backend, записавшая строку |
| `payload_sha256` | `sha256` канонического JSON сохранённого payload |
| `provenance` | `source_kind`, `run_id`, `request_key`, `revision`, `created_by`, `source_completed_at`, `materialized_at` |
| `payload` | ровно тот allowlist-DTO, который прошёл валидацию при записи |

Канонический JSON (совпадает с существующим `canonical()` в
[serialization.py](https://github.com/Pickle-Pee/smm_ai_helper/blob/76b6c1b/app/orchestration_runtime/serialization.py#L51)):
`json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)` → UTF-8 → `sha256` → hex.

### 11.2 Путь чтения: целостность отдельно от совместимости

| Шаг | Проверка | При сбое | Код | `result_status` |
|---|---|---|---|---|
| 1. Целостность | пересчитать `sha256(canonical(payload))` | **повреждение данных**: алерт, карантин, не регенерировать | `503 result_corrupted` | `corrupted` |
| 2. Формат | найти декодер по `(schema_version, result_kind)` | **несовместимость формата**, данные целы | `409 result_format_unsupported` | `format_unsupported` |
| 3. Декодер и upcasters | замороженный декодер + цепочка `v1 → v2 → …` | **дефект кода**, данные не трогаются | `503 result_unreadable` | `unreadable` |

- **Версионированные декодеры** — замороженные копии DTO на момент версии (например,
  `app/saas/history/contracts/copilot_api_v1.py`); после выпуска не редактируются. Старый snapshot никогда не
  валидируется живым DTO: изменение лимита или enum в `copilot_api.v1` иначе сделало бы корректные данные «невалидными».
- **Upcasters** — чистые функции между версиями до текущего представления; применённая цепочка видна в `decoded_with`.
- **Drift-тест** в web-слое: JSON Schema живого `copilot_api.v1` сравнивается с закреплённым хэшем замороженной копии.
  Падение означает: ввести новую `schema_version`, upcaster и фикстуры. PR Codex он не блокирует.
- В списке сообщений нечитаемый snapshot не роняет страницу: `result_status` + `result: null`.

### 11.3 Хранение и удаление (на подпись: D12, D13, D18)

- Snapshots и треды хранятся, пока существуют проект и организация, **не дольше** «срок беты + 90 дней». Бессрочное хранение не обещается.
- **«Убрать из проекта»** (`DELETE /v2/threads/{id}`): soft delete web-строк, hard purge через 30 дней, остаётся tombstone без содержимого.
- **«Стереть исходные AI-данные»** — другое действие, в контракте его **нет**: записи ядра (graph runs, артефакты, mentor)
  принадлежат автору и этим вызовом не удаляются. Нужен `CoreErasureService` (B12, по согласованию с Codex).
  До него и до политики бэкапов (D18) ни API, ни UI не обещают полного удаления.
- Неизменяемость: только INSERT; триггер запрещает UPDATE/DELETE вне purge-процедуры. Триггер с `SET LOCAL app.purge`
  — **соглашение о целостности, а не граница авторизации**: право на purge должно обеспечиваться ограниченной ролью БД
  (замечание 3 ревью, OQ-11).

## 12. Web Chat (future, B9/F7)

Во внутренней технической бете свободного диалога нет: ядро возвращает существующую делегацию
`CONVERSATION` (`delegate: legacy_chat`), web-слой **не** вызывает Telegram-чат и сохраняет честный `UNSUPPORTED`.
Публичный запуск Marketing Copilot без полноценного веб-чата не планируется: B9/F7 — release gate.

Контракт резервирует (`POST /v2/threads/{id}/chat-messages`, `x-status: future`), без изменения Telegram-логики:

| Требование | Решение |
|---|---|
| Отдельный web chat scope | ключ памяти `web:t:<thread_id>` вне пространства `tg:<id>`; `/chat/message`, `ChatExecutionService`, `conversations`, `messages` для web не используются |
| Отдельный receipt | `web_chat_execution.v1` в web-слое: claim до вызова модели, `ambiguous` при неизвестном исходе, running-claim не перехватывается |
| Последовательное выполнение в треде | receipt по ключу дедуплицирует только **тот же** запрос. Два разных сообщения сериализуются единственным in-flight слотом треда и `expected_last_seq` (`409 thread_busy`, `409 stale_thread`); SQL-транзакция на время вызова модели не удерживается |
| Защита от дублирования памяти | реплика пользователя, ответ и обновления контекста буферизуются и фиксируются в одной транзакции со snapshot ответа; `ambiguous` и ошибка не оставляют в памяти ничего |
| Ограничения использования модели | ввод ≤ 4000 символов, ограничение выходных токенов, суточные лимиты на пользователя и организацию, проверяемые **до** claim (`429 quota_exceeded`); изображения отключены |
| Feature flag | `WEB_CHAT_ENABLED`; пока выключен — `403 feature_disabled`, `Features.web_chat = false` |

`WebChatReply` (`web_chat.v1`) — черновик: только `reply` и `follow_up_question`. `debug` и `image` не отдаются;
нетипизированный legacy-список `actions` не переносится, пока B9 не определит типизированную форму.

## 13. Совместимость Telegram и Web

| Аспект | Telegram | Web | Пересечение |
|---|---|---|---|
| Principal | `telegram_id → users.id` | сессия `→ users.id` | один `users.id` |
| Ключи идемпотентности | `tg:<actor>:<chat>:<message>` | `w-<uuid v7>` | не пересекаются |
| Бренд | `brand_profiles` (1 на пользователя) | `project_brands` (1 на проект) | однократная копия при импорте |
| История | `ProjectHistoryService`, приватная | треды и snapshots проекта | только чтение своей истории в `/v2/me/telegram-history` |
| Контекст чата | `ActiveProjectBinding`, `context_version` | не используется (`None`) | нет |
| Свободный диалог | `/chat/message`, `tg:<id>` | future, `web:t:<thread>` | нет |
| Доставка | outbox → бот | polling | нет |

Регрессия Telegram — обязательное условие каждого backend-PR: ожидания существующих тестов не меняются.
Web-сессия на legacy-маршрутах и bot-токен на `/v2` дают 401.

## 14. Матрица возможностей

| Возможность | Internal technical beta | Публичный запуск | Флаг в `Me.features` |
|---|---|---|---|
| Стратегия, конкуренты/позиционирование, расчёт | ✅ | ✅ | `copilot_requests` |
| Уточнения, история, повторное открытие | ✅ | ✅ | — |
| Наставник | ✅ (спрашивает автор, читают участники) | ✅ | `mentor` |
| Личная Telegram-история | ✅ только себе, список | ✅ | `telegram_history` |
| Свободный веб-чат | ⛔ честный `UNSUPPORTED` | ✅ после гейтов G1–G7 | `web_chat` |
| Командные организации | ⛔ | после B10 | `team_organizations` |
| Вход по email | ⛔ | после B2e | `email_login` |
| Повторный импорт бренда | ⛔ до решения OQ-1 | по решению | `brand_reimport` |
| Изображения | ⛔ | ⛔ до отдельного решения | — |
| Сценарии `content-plan`, `audience`, `ad-copy` | ⛔ «Скоро» | по мере появления исполняемых сценариев | — |
| Документы | ⛔ mock | DOC-эпики #167–#170 | `documents` (всегда `false`) |

Сценарии в UI — это шаблоны текста запроса; поля «сценарий» в API нет, режим исполнения выбирает ядро.

## 15. Фикстуры

Все значения вымышлены; токены — заглушки. Payload Copilot и наставника собраны через **реальные** DTO backend `@76b6c1b`
и совпадают с тем, что они сериализуют. Значения внутри (тексты стратегии, `topic` находок) иллюстративны.

| Сценарий | Файл |
|---|---|
| Успешный вход | `responses/auth-exchange.200.json` |
| Текущий пользователь | `responses/me.200.json` |
| Организация и проекты | `responses/orgs.200.json`, `responses/projects-list.200.json`, `responses/project.200.json` |
| Brand Context | `responses/project-brand.200.json`, `responses/project-brand-imported.200.json` |
| Созданный тред | `responses/thread-created.201.json` |
| Успешный AI-результат | `responses/message-direct-result.200.json`, `responses/message-module-result.200.json` |
| Уточнение NEEDS_INPUT | `responses/message-needs-input.200.json` → `requests/submit-positioning.rev2.json` → `responses/message-clarification-completed.200.json` |
| Запущенный workflow | `responses/message-workflow-started.202.json` |
| Выполняющийся workflow | `responses/message-workflow-running.200.json` |
| Завершённая стратегия | `responses/message-strategy-completed.200.json` |
| Ошибка генерации | `responses/message-run-failed.200.json`, `responses/message-run-blocked.200.json` |
| Ambiguous execution | `responses/message-ambiguous.200.json` |
| Expired receipt | `responses/message-expired.200.json` |
| Сохранённый snapshot | `responses/result-snapshot-run.200.json` |
| Восстановление истории | `responses/thread-messages-reopen.200.json`, `responses/message-pending-resubmit.200.json` |
| Ошибка доступа | `errors/not-found-foreign-*.404.json`, `errors/forbidden.403.json` |
| Неподдерживаемый сценарий | `responses/message-unsupported.200.json` |
| Golden-негативы декодера | `golden/snapshot-corrupted-hash.json`, `golden/snapshot-unknown-schema-version.json` |

`fixtures/index.json` связывает каждый файл с `operation_id`, HTTP-статусом и схемой; те же файлы подключены в OpenAPI
как `examples.externalValue`.

## 16. Как проверять реализацию по контракту

| Проверка | Кто | Как |
|---|---|---|
| Спецификация валидна | оба | линтер OpenAPI 3.1 в CI соответствующего репозитория |
| Backend отдаёт то, что описано | Codex | `openapi.json` только для `/v2` как артефакт CI + сравнение с этим файлом; ответы тестов валидируются по схемам |
| Frontend использует то, что описано | Claude | типы генерируются из YAML (`lib/api/generated/`), drift-проверка в CI; mock-адаптер отдаёт файлы из `fixtures/` |
| Фикстуры не расходятся со схемами | оба | каждый файл из `index.json` валидируется по своей `schema` |
| Snapshots читаемы | Codex | golden-тесты: `responses/result-snapshot-run.200.json` декодируется; два файла `golden/` дают `result_corrupted` и `result_format_unsupported` |
| Идемпотентность | Codex | fake provider со счётчиком: replay, двойной клик, reload → 0 дополнительных вызовов |
| Изоляция тенантов | Codex | T1–T10 и O-T1–O-T5 из аудита |

Что проверено в рамках C0 — в описании PR. Новые зависимости не устанавливались; в CI этого репозитория проверки
контракта пока не добавлены (это часть F1).

## 17. Версионирование и эволюция

- Версия API — в пути (`/v2`). Версия конверта ответа — `schema_version: "web_api.v2"`.
  Вложенные DTO ядра сохраняют собственную `schema_version` (`copilot_api.v1`, `case_mentor.v1`, …).
- Версия документа — `info.version` (`2.0.0-draft.N` до подписания, далее SemVer).
- **Совместимые** изменения: новая операция, новое необязательное поле ответа, новый код ошибки с описанием в каталоге,
  новое значение `result_kind` вместе с декодером. Клиент обязан терпеть неизвестные коды `NeedsInputResponse.code`.
- **Несовместимые** изменения (удаление или переименование поля, смена типа, смена смысла кода) — только `/v3`.
- Изменение DTO ядра не меняет старые snapshots: вводится новая `schema_version` + декодер + upcaster.

| Этап | Что добавляется | Статус в этом документе |
|---|---|---|
| Internal technical beta | auth по Telegram-ссылке, personal-организация, проекты и бренды, Copilot-треды, snapshots, наставник, своя Telegram-история | `proposed` |
| B2e | email-вход (`/v2/auth/email/*`) | не описан |
| B9 / F7 | веб-чат | `future` |
| B10 | командные организации, `/v2/orgs/{org}/members`, приглашения, отзыв | не описан |
| B11 | детали legacy-истории, поштучный импорт в проект | `deferred` |
| B12 | стирание данных ядра | не описан |
| Позже | SSE поверх того же чтения с fallback на polling; accept-then-poll для одиночного модуля; документы | не описан |

## 18. Что нужно от backend сверх аудита

Контракт опирается на небольшие аддитивные изменения ядра (все — по согласованию с Codex, поведение Telegram неизменно):

| Изменение | Зачем | PR |
|---|---|---|
| `CopilotAPI.execute_for_owner(owner_id, brand_entries, payload)` — выделение из `execute` | вызвать ядро от `User.id` с брендом проекта | B3a |
| owner-id варианты `GraphRunReader.get/recent` | делегированное чтение | B3c |
| owner-id вариант `CaseMentorService._source` | наставник для web | B3b |
| owner-id вариант `ProjectHistoryService` | личная Telegram-история | B11 |
| read-only `peek` состояния receipt (или вывод по времени) | различать `running` и `ambiguous` | новое, C0-7 |

Web-слой (`/v2`, web-таблицы, материализация, декодеры) — новые модули; существующие таблицы ядра не меняются.
