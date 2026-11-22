# Brenvio web — эксплуатация

Документ описывает развёртывание, обновление, откат и мониторинг демоверсии и кабинета Brenvio. Кабинет использует действующий Web API для Telegram-сессии, организаций, проектов и брендов. AI Workspace и Документы в кабинете помечены «Скоро».

> Этот репозиторий публичный. Не добавляйте сюда адреса внутренних сервисов, токены, сведения о других проектах на сервере и ключи. Всё секретное хранится только в GitHub Secrets и в `/opt/brenvio-web/.env` на сервере.

## Архитектура

```
Интернет ──:80/:443──▶ Caddy (brenvio-edge, host network, Let's Encrypt)
                          │ reverse_proxy 127.0.0.1:${BRENVIO_PORT}
                          ▼
                     brenvio-web (Next.js standalone, uid 1001, read-only FS)
                     127.0.0.1:${BRENVIO_PORT} → :3000, своя docker-сеть
```

- Приложение и прокси — два отдельных compose-проекта: `brenvio-web` и `brenvio-edge`. Ни один из них не подключается к сетям других проектов на сервере.
- Порт приложения опубликован только на loopback. Наружу открыт только Caddy (80 — ACME и редирект на HTTPS, 443 — сайт). HTTP/3 (UDP 443) отключён.
- Admin API Caddy слушает только `localhost:2019`.
- Домен задаётся одной переменной `BRENVIO_DOMAIN` в `/opt/brenvio-web/.env`.

## Раскладка на сервере

```
/opt/brenvio-web/
├── .env                    # BRENVIO_TAG, BRENVIO_PORT, BRENVIO_DOMAIN (root, 600)
├── compose.yaml            # из deploy/compose.yaml
├── edge/compose.yaml       # из deploy/edge/compose.yaml
├── edge/Caddyfile          # из deploy/edge/Caddyfile
├── bin/remote.sh           # deploy / rollback / status (root)
├── bin/ssh-entry.sh        # forced command для CI-ключа
├── bin/healthcheck.sh      # мониторинг (systemd timer)
└── state/                  # current_tag, previous_tag, deploy.log, lock
```

Docker volumes `brenvio_caddy_data` / `brenvio_caddy_config` хранят сертификаты и ACME-аккаунт. Не удаляйте их: повторный выпуск упирается в лимиты Let's Encrypt.

## Первичная установка (выполняется один раз под root)

```bash
# 1. Код и файлы развёртывания
git clone --depth 1 --branch <ветка> https://github.com/Pickle-Pee/smm_ai_helper_web.git /opt/brenvio-web/src
install -d -m 755 /opt/brenvio-web/bin /opt/brenvio-web/edge
install -d -m 700 /opt/brenvio-web/state
install -m 644 /opt/brenvio-web/src/deploy/compose.yaml /opt/brenvio-web/compose.yaml
install -m 644 /opt/brenvio-web/src/deploy/edge/compose.yaml /opt/brenvio-web/edge/compose.yaml
install -m 644 /opt/brenvio-web/src/deploy/edge/Caddyfile /opt/brenvio-web/edge/Caddyfile
install -m 755 /opt/brenvio-web/src/deploy/bin/*.sh /opt/brenvio-web/bin/
install -m 600 /opt/brenvio-web/src/deploy/env.example /opt/brenvio-web/.env   # затем отредактировать

# 2. Образ (сборка на сервере — только для первого запуска; дальше образы приходят из CI)
cd /opt/brenvio-web/src
TAG=$(git rev-parse --short=12 HEAD)
nice -n 10 docker build --build-arg SITE_URL=https://$DOMAIN --build-arg APP_VERSION=$TAG -t brenvio-web:$TAG .
/opt/brenvio-web/bin/remote.sh deploy $TAG

# 3. Прокси и HTTPS
docker compose -f /opt/brenvio-web/edge/compose.yaml up -d

# 4. Мониторинг
install -m 644 /opt/brenvio-web/src/deploy/systemd/brenvio-healthcheck.* /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now brenvio-healthcheck.timer
```

## Обновление

**Через CI (основной путь).** Мерж в `main` → workflow «Deploy preview»: проверки → сборка образа → smoke-тест контейнера в CI → `docker save | ssh deploy` → health check на сервере → публичный smoke-тест. Повторить вручную: Actions → Deploy preview → Run workflow → `deploy`.

**Вручную на сервере:**

```bash
cd /opt/brenvio-web/src && git fetch origin && git checkout <commit>
TAG=$(git rev-parse --short=12 HEAD)
nice -n 10 docker build --build-arg SITE_URL=https://$(sed -n 's/^BRENVIO_DOMAIN=//p' ../.env) --build-arg APP_VERSION=$TAG -t brenvio-web:$TAG .
/opt/brenvio-web/bin/remote.sh deploy $TAG
```

`remote.sh deploy` переключает тег в `.env`, пересоздаёт только контейнер `brenvio-web`, ждёт `healthy` и ответ `/api/health`. Если проверка не прошла, **автоматически возвращает предыдущий тег**. Хранятся последние 5 образов `brenvio-web:*`, другие образы не трогаются.

## Включение кабинета F4

1. Развернуть страницу `/auth/telegram` и подтвердить её доступность через канонический HTTPS origin. На backend должны быть `WEB_API_ENABLED=true`, `WEB_TELEGRAM_LOGIN_ENABLED=false` и корректный `WEB_APP_ORIGIN`.
2. Проверить Caddy и nginx в изолированных экземплярах на loopback. `scripts/check-f4-edge.sh HTTPS_BASE WEB_APP_ORIGIN false` проверяет непубличные маршруты, анонимные ответы, origin и удаление cookie. Для тестового CA передать `F4_CA_FILE`. Для проверки ограничения частоты на изолированном экземпляре передать `F4_CHECK_RATE=true`.
3. Установить `deploy/edge/compose.yaml` и `deploy/edge/login-throttle.conf` в каталог edge. Запустить только `login-throttle`. Caddy направляет оба этапа входа через nginx на loopback 8101 и проксирует остальные операции из [таблицы F4](api/f4-integration-audit.md) напрямую на loopback 8000. Caddy подставляет адрес TCP-клиента для rate limit. Логи доступа к Web API выключены на обоих прокси.
4. Сохранить предыдущий Caddyfile и валидировать новый конфиг перед reload. Активный Caddyfile монтируется как файл. При замене через rename контейнер продолжит видеть старый inode, поэтому выполнить reload из файла-кандидата внутри контейнера и записать подтверждённую конфигурацию в файл на хосте с сохранением inode. Повторить `check-f4-edge.sh` на публичном HTTPS. Для закрытой демоверсии с Basic auth использовать отдельный hostname, поскольку Web API отклоняет заголовок Authorization.
5. В GitHub задать переменную `CABINET_ENABLED=true` для новой сборки. Smoke-тест в режиме кабинета проверяет редирект анонимного браузера, страницу входа, статические ресурсы, HSTS и публичный ответ `/api/v2/me`. Новая сборка должна иметь новый тег для безопасного отката.
6. После проверок HTTPS и origin разрешить `WEB_TELEGRAM_LOGIN_ENABLED` для backend и Telegram bot в действующей конфигурации их релиза. Повторить `check-f4-edge.sh` с аргументом `true`. В Chrome пройти Telegram → challenge → подтверждение → exchange → кабинет → проект и бренд → обновление → выход → повторный вход.

При откате сначала выключить выдачу и подтверждение новых ссылок на backend и в боте. Публичные маршруты сессии оставить доступными для выхода и отзыва. Frontend откатывается предыдущим тегом через `remote.sh rollback`. Отключение Web API после отзыва сессий и возврат Caddyfile выполнять отдельно от отката приложения.

## Откат

```bash
/opt/brenvio-web/bin/remote.sh status            # текущий, предыдущий тег и доступные образы
/opt/brenvio-web/bin/remote.sh rollback          # на предыдущий релиз
/opt/brenvio-web/bin/remote.sh rollback <tag>    # на конкретный тег из списка
```

Из GitHub: Actions → Deploy preview → Run workflow → `rollback` (пустой тег = предыдущий релиз).

## Мониторинг

- Docker healthcheck (`/api/health` каждые 30 с) и `restart: unless-stopped`.
- `brenvio-healthcheck.timer` каждые 5 минут проверяет локальный и HTTPS-ответ, срок сертификата (< 14 дней — предупреждение) и память контейнеров. После 2 провалов подряд перезапускает контейнер приложения.
  ```bash
  journalctl -t brenvio-health --since today
  journalctl -t brenvio-deploy
  ```
- Логи контейнеров ротируются (json-file, 3 × 10 МБ):
  ```bash
  docker compose -p brenvio-web logs --tail 100 web
  docker compose -f /opt/brenvio-web/edge/compose.yaml logs --tail 100 caddy
  ```
- Лимиты: приложение 384 МБ RAM / 1 CPU, Caddy 128 МБ / 0.5 CPU.
- Внешних уведомлений пока нет. Следующий шаг — внешний uptime-монитор на `https://<домен>/api/health` (UptimeRobot / Healthchecks / Telegram-алерт).

## Сертификаты

Caddy выпускает и продлевает сертификат Let's Encrypt автоматически (примерно за 30 дней до истечения), для этого нужны входящие 80 и 443. Проверка:

```bash
echo | openssl s_client -connect 127.0.0.1:443 -servername $DOMAIN 2>/dev/null | openssl x509 -noout -dates -issuer
```

## Смена домена

1. Добавить A-запись нового домена на IP сервера. Старую не удалять до переключения.
2. В `/opt/brenvio-web/.env` изменить `BRENVIO_DOMAIN`, затем `docker compose -f /opt/brenvio-web/edge/compose.yaml up -d --force-recreate`. Сертификат выпустится автоматически.
3. В GitHub изменить переменную `SITE_URL` и пересобрать (`SITE_URL` влияет на Open Graph и canonical-ссылки).

## Закрытый доступ (basic auth)

```bash
docker run --rm caddy:2.10-alpine caddy hash-password --plaintext '<пароль>'
```

Добавить в `.env` `BRENVIO_BASIC_AUTH_USER=<логин>` и `BRENVIO_BASIC_AUTH_HASH=<хэш>`. Раскомментировать блок `basic_auth` в `edge/Caddyfile` и пересоздать Caddy. Пароль в открытом виде нигде не хранить.

## CI/CD setup

Workflow `deploy.yml` выключен, пока переменная репозитория `DEPLOY_ENABLED` не равна `true`.

1. На сервере (root) — отдельный пользователь с минимальными правами:
   ```bash
   useradd --system --create-home --shell /bin/bash brenvio-deploy && passwd -l brenvio-deploy
   install -d -m 700 -o brenvio-deploy -g brenvio-deploy /home/brenvio-deploy/.ssh
   # публичный ключ CI с принудительной командой:
   echo 'command="/opt/brenvio-web/bin/ssh-entry.sh",restrict ssh-ed25519 AAAA... brenvio-ci' > /home/brenvio-deploy/.ssh/authorized_keys
   chown brenvio-deploy: /home/brenvio-deploy/.ssh/authorized_keys && chmod 600 /home/brenvio-deploy/.ssh/authorized_keys
   echo 'brenvio-deploy ALL=(root) NOPASSWD: /opt/brenvio-web/bin/remote.sh' > /etc/sudoers.d/brenvio-deploy
   chmod 440 /etc/sudoers.d/brenvio-deploy && visudo -cf /etc/sudoers.d/brenvio-deploy
   ```
   Пользователь не входит в группу `docker`, не имеет пароля и интерактивной оболочки по ключу. Он может только вызвать `deploy <tag>`, `rollback [<tag>]` и `status`.
2. GitHub → Settings → Secrets and variables → Actions:
   - Secrets: `DEPLOY_SSH_KEY` (приватный ключ), `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan -p <port> <host>`).
   - Variables: `DEPLOY_ENABLED=true`, `SITE_URL=https://<домен>`, при нестандартном порте — `DEPLOY_PORT`.
3. Environment `production`: при необходимости добавить required reviewers для ручного подтверждения каждого деплоя.

## Безопасность

- Секретов во frontend нет. Переменные `NEXT_PUBLIC_*` не используются. Токены backend и заголовки идентификации Telegram во frontend запрещены (см. AGENTS.md).
- Заголовки: CSP (только `'self'`), HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Robots-Tag: noindex`. Заголовок `X-Powered-By` отключён.
- Индексация выключена: meta robots, `robots.txt` (`Disallow: /`) и заголовок. Включается только явным `ALLOW_INDEXING=true` при сборке.
- Контейнер: non-root, read-only FS, `cap_drop: ALL`, `no-new-privileges`, лимиты памяти, CPU и PID.
- `/api/health` возвращает только `status` и версию сборки.
