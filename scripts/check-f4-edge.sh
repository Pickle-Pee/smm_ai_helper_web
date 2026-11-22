#!/usr/bin/env bash
# Anonymous checks through the real FastAPI Web boundary and an HTTPS edge.
# For an isolated listener, set F4_CA_FILE to its test root and F4_CHECK_RATE=true.
set -euo pipefail

base="${1:?usage: check-f4-edge.sh HTTPS_BASE WEB_APP_ORIGIN LOGIN_FLAG (true|false)}"
origin="${2:?pass the configured WEB_APP_ORIGIN}"
login="${3:?pass the current WEB_TELEGRAM_LOGIN_ENABLED}"
[[ "$base" == https://* && "$origin" == https://* ]]
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl_opts=(--silent --show-error --max-time 10)
if [[ -n "${F4_CA_FILE:-}" ]]; then curl_opts+=(--cacert "$F4_CA_FILE"); fi

request() {
  curl "${curl_opts[@]}" -D "$tmp/headers" -o "$tmp/body" -w '%{http_code}' "$@"
}

expect() {
  local status="$1" code="$2" received
  shift 2
  received=$(request "$@")
  if [[ "$received" != "$status" ]] || { [[ -n "$code" ]] && ! grep -q "\"code\":\"$code\"" "$tmp/body"; }; then
    echo "Unexpected response for ${*: -1}: expected $status ${code:-}, received $received" >&2
    return 1
  fi
  echo "$received ${code:-} ${*: -1}"
}

expect 401 unauthenticated "$base/api/v2/me"
grep -qiE '^cache-control: private, no-store' "$tmp/headers"
expect 401 unauthenticated "$base/api/v2/orgs"
expect 401 unauthenticated "$base/api/v2/auth/csrf"
expect 404 "" "$base/internal/identity/web-login-link"
expect 404 "" "$base/api/internal/identity/web-login-confirm"
expect 404 "" "$base/v2/me"
expect 404 "" "$base/api/v2/threads/placeholder/messages"

auth=(-H 'Content-Type: application/json' -d '{}' "$base/api/v2/auth/telegram/challenge")
expect 403 csrf_failed -H 'Origin: https://example.invalid' -H 'Sec-Fetch-Site: cross-site' "${auth[@]}"
expect 403 csrf_failed -H "Origin: $origin" -H 'Sec-Fetch-Site: same-site' "${auth[@]}"
expect 403 csrf_failed "${auth[@]}"
if [[ "$login" == true ]]; then
  expect 422 invalid_request -H "Origin: $origin" -H 'Sec-Fetch-Site: same-origin' "${auth[@]}"
else
  expect 403 feature_disabled -H "Origin: $origin" -H 'Sec-Fetch-Site: same-origin' "${auth[@]}"
fi

expect 204 "" -X POST -H "Origin: $origin" -H 'Sec-Fetch-Site: same-origin' "$base/api/v2/auth/logout"
grep -qiE '^set-cookie: __Host-brenvio_session=.*HttpOnly.*Max-Age=0.*Path=/.*SameSite=lax.*Secure' "$tmp/headers"
if grep -qiE '^set-cookie: .*;[[:space:]]*domain=' "$tmp/headers"; then exit 1; fi

if [[ "${F4_CHECK_RATE:-}" == true ]]; then
  for i in $(seq 1 16); do
    # The apparent client remains the Caddy peer even when a caller changes this header.
    code=$(request -H "X-Brenvio-Client: test-$i" -H "Origin: $origin" -H 'Sec-Fetch-Site: same-origin' "${auth[@]}")
    if [[ "$code" == 429 ]]; then
      grep -qiE '^retry-after: [1-9]' "$tmp/headers"
      grep -q '"code":"rate_limited"' "$tmp/body"
      echo "429 rate_limited through the isolated auth proxy"
      exit 0
    fi
  done
  echo "Expected auth rate limit in the isolated edge" >&2
  exit 1
fi
