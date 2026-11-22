# F4-01 — сверка Web API и production

Срез от 22 ноября 2026. Frontend main — `0dfd7a167b61439d680c615f087004ffd36b0060`, публичный `/api/health` сообщил `e68621c1ddb3`. Backend master и метка запущенного backend-образа — `b96771436eaf8eb304c31a36982e0a40da80bd55`.

Сверены [OpenAPI](web-api-v2.openapi.yaml), [браузерная сессия B2.0](b2-0-web-session-contract.md), [маршруты сессии](https://github.com/Pickle-Pee/smm_ai_helper/blob/b96771436eaf8eb304c31a36982e0a40da80bd55/app/routers/web_sessions.py), [маршруты проектов](https://github.com/Pickle-Pee/smm_ai_helper/blob/b96771436eaf8eb304c31a36982e0a40da80bd55/app/routers/web_projects.py) и их Pydantic DTO.

| FastAPI | WebApiV2Client в начале F4 | Frontend и поведение |
| --- | --- | --- |
| POST /v2/auth/telegram/challenge | Метод отсутствует | `/auth/telegram`: одноразовый token в JSON, `TelegramBrowserChallenge` и временная cookie. Повторная попытка требует свежей ссылки. |
| POST /v2/auth/telegram/exchange | Метод есть | В личном чате бота команда `/confirm <code>`, затем exchange с тем же token и attempt cookie. Возвращает `AuthSession` и заменяет cookie сессии. Invalid, expired, consumed и unconfirmed объединены в 401 `login_token_invalid`. |
| GET /v2/auth/csrf | Метод есть | Токен в памяти, восстановление после reload. |
| POST /v2/auth/logout | Метод есть | С валидной сессией требует CSRF; ответ 204 удаляет cookie. Вызов без сессии идемпотентен. |
| GET /v2/me | Метод есть | Имя, identities без Telegram ID, memberships, сроки сессии и features. 401 переводит из кабинета на вход. |
| GET /v2/orgs | Метод есть | `OrganizationList.items` содержит только активные memberships и их роли. |
| GET /v2/orgs/{org_id}/projects | Метод есть | Обзор и Проекты: cursor, limit до 50, необязательный status. Чужая организация — 404. |
| POST /v2/orgs/{org_id}/projects | Метод отсутствует | Editor/owner, необязательный UUID Idempotency-Key. 201, при повторе того же запроса 200, при несовпадении 409. |
| GET /v2/projects/{project_id} | Метод есть | Страница проекта, вложенный бренд, роль и permissions; чужой проект — 404. |
| PATCH /v2/projects/{project_id} | Метод отсутствует | Editor/owner, имя, статус или цвет, `expected_version` проекта. Устаревшая версия — 409 `stale_project`. |
| GET /v2/projects/{project_id}/brand | Метод есть | Отдельная версия бренда, поля, автор и источник импорта. |
| PATCH /v2/projects/{project_id}/brand | Метод отсутствует | Editor/owner, `expected_version` бренда. Поддерживаются частичные изменения, включая очистку полей. |
| POST /v2/projects/{project_id}/brand/import-telegram | Метод отсутствует | Owner личной организации, версия бренда и `confirm_overwrite: true`. Сервер копирует профиль один раз. Повтор — 403 `feature_disabled`, отсутствие исходника — 409 `import_source_missing`. |

Схемы успешных ответов совпадают по используемым полям. Backend выполняет однократное наполнение первого личного проекта при первом exchange. Повторный вход оставляет веб-данные как есть. Возможность ручного импорта определяется `Project.permissions.can_import_telegram_brand`; повторный импорт в проверенной сборке выключен сервером.

Cookie обеих стадий имеют `Secure; HttpOnly; SameSite=Lax; Path=/` без Domain. Backend проверяет фактические Origin и Sec-Fetch-Site до любой записи и затем сверяет CSRF для защищённых записей. Ошибки используют `schema_version`, `kind: ERROR`, `code`, `request_id`; ответы приватные и не кэшируются. Контракт описывает 429 для публичного ограничения частоты, но проверенный FastAPI middleware и текущий Caddy такого ограничения для challenge/exchange не обеспечивают.

Caddy работает в host network отдельным Compose-проектом. Frontend слушает loopback на 3100, backend на 8000. На этом срезе запрос `http://127.0.0.1:8000/v2/me` без cookie возвращал 401, а публичный `https://app.24rubridge.ru/api/v2/me` — 404. Публичное правило должно охватывать только операции из таблицы, удалить префикс `/api` и передать исходные заголовки браузера. `/internal/*` остаётся закрытым. Деплой сайта и обновление конфигурации edge выполняются отдельно.

Трекинг: [SaaS Platform #158](https://github.com/Pickle-Pee/smm_ai_helper/issues/158) · [Frontend #163](https://github.com/Pickle-Pee/smm_ai_helper/issues/163).
