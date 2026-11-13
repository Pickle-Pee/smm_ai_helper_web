#!/usr/bin/env bash
# Lightweight monitor, run by brenvio-healthcheck.timer every 5 minutes. Results go to the journal:
#   journalctl -t brenvio-health --since today
# - container health + local HTTP probe (restarts the web container after 2 consecutive failures)
# - public HTTPS probe through the proxy (resolved to 127.0.0.1, so it does not depend on external DNS)
# - certificate expiry (warns when < 14 days left; Caddy renews ~30 days before expiry)
# - memory usage of the brenvio containers
set -uo pipefail

APP_DIR="${BRENVIO_APP_DIR:-/opt/brenvio-web}"
ENV_FILE="$APP_DIR/.env"
STATE_DIR="$APP_DIR/state"
PORT=$(sed -n 's/^BRENVIO_PORT=//p' "$ENV_FILE" | tail -n1); PORT="${PORT:-3100}"
DOMAIN=$(sed -n 's/^BRENVIO_DOMAIN=//p' "$ENV_FILE" | tail -n1)
FAILS_FILE="$STATE_DIR/health_failures"

say() { logger -t brenvio-health -p "user.$1" -- "$2"; [[ -t 1 ]] && echo "[$1] $2"; return 0; }

mkdir -p "$STATE_DIR"

if curl -fsS -m 5 "http://127.0.0.1:$PORT/api/health" >/dev/null; then
  echo 0 >"$FAILS_FILE"
  say info "local ok (127.0.0.1:$PORT)"
else
  fails=$(( $(cat "$FAILS_FILE" 2>/dev/null || echo 0) + 1 ))
  echo "$fails" >"$FAILS_FILE"
  say err "local health check failed ($fails in a row)"
  if (( fails >= 2 )); then
    say warning "restarting brenvio-web container"
    docker compose --project-name brenvio-web --env-file "$ENV_FILE" -f "$APP_DIR/compose.yaml" restart web >/dev/null 2>&1 \
      && say warning "brenvio-web restarted" || say err "restart failed"
    echo 0 >"$FAILS_FILE"
  fi
fi

if [[ -n "$DOMAIN" ]]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" || echo 000)
  [[ "$code" == "200" ]] && say info "https ok ($DOMAIN)" || say err "https check failed for $DOMAIN (HTTP $code)"

  end=$(echo | timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [[ -n "$end" ]]; then
    days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
    (( days < 14 )) && say warning "certificate for $DOMAIN expires in $days days" || say info "certificate valid for $days more days"
  else
    say err "could not read certificate for $DOMAIN"
  fi
fi

mem=$(docker stats --no-stream --format '{{.Name}}={{.MemUsage}}' 2>/dev/null | grep -E '^brenvio-' | tr '\n' ' ')
[[ -n "$mem" ]] && say info "memory: $mem"
exit 0
