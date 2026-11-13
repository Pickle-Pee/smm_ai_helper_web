#!/usr/bin/env bash
# Smoke test for a running Brenvio web instance.
#   scripts/smoke.sh http://127.0.0.1:3000          # container in CI
#   scripts/smoke.sh https://app.24rubridge.ru [expected-version]
# Checks routes, page titles, the preview banner, static assets, health, noindex and security headers.
set -euo pipefail

BASE="${1:?usage: smoke.sh <base-url> [expected-version]}"
BASE="${BASE%/}"
EXPECT_VERSION="${2:-}"
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

ok() { echo "  ok   $*"; }
bad() { echo "  FAIL $*"; fail=1; }

check_page() {
  local path="$1" title="$2" body="$tmp/page.html" code
  code=$(curl -sS -o "$body" -w '%{http_code}' -m 20 "$BASE$path") || code=000
  if [[ "$code" != "200" ]]; then bad "$path -> HTTP $code"; return; fi
  grep -q "<title>$title</title>" "$body" && ok "$path title '$title'" || bad "$path missing title '$title'"
  grep -q "Brenvio Preview" "$body" && ok "$path preview banner" || bad "$path missing preview banner"
}

echo "Smoke test: $BASE"

health=$(curl -fsS -m 10 "$BASE/api/health") || { bad "/api/health unreachable"; health=""; }
if [[ -n "$health" ]]; then
  [[ "$health" == *'"status":"ok"'* ]] && ok "/api/health $health" || bad "/api/health unexpected: $health"
  if [[ -n "$EXPECT_VERSION" ]]; then
    [[ "$health" == *"\"version\":\"$EXPECT_VERSION\""* ]] && ok "version $EXPECT_VERSION" || bad "expected version $EXPECT_VERSION"
  fi
fi

check_page "/" "Рабочий стол · Brenvio"
check_page "/workspace" "AI Workspace · Brenvio"
check_page "/projects" "Проекты · Brenvio"
check_page "/projects/p-little-feet" "Проект · Brenvio"
check_page "/documents" "Документы · Brenvio"
check_page "/settings" "Настройки · Brenvio"

code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$BASE/this-page-does-not-exist") || code=000
[[ "$code" == "404" ]] && ok "unknown route -> 404" || bad "unknown route -> HTTP $code"

curl -fsS -m 10 "$BASE/" -o "$tmp/home.html" || true
asset=$(grep -oE '/_next/static/[^"]+\.(js|css)' "$tmp/home.html" | head -n1 || true)
if [[ -n "$asset" ]]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$BASE$asset") || code=000
  [[ "$code" == "200" ]] && ok "static asset $asset" || bad "static asset $asset -> HTTP $code"
else
  bad "no /_next/static asset referenced in HTML"
fi
grep -q 'name="robots" content="noindex' "$tmp/home.html" && ok "meta robots noindex" || bad "meta robots noindex missing"

robots=$(curl -fsS -m 10 "$BASE/robots.txt" || true)
[[ "$robots" == *"Disallow: /"* ]] && ok "robots.txt disallows all" || bad "robots.txt: $robots"

for path in /manifest.webmanifest /icon.svg /opengraph-image; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$BASE$path") || code=000
  [[ "$code" == "200" ]] && ok "$path" || bad "$path -> HTTP $code"
done

headers=$(curl -sS -D - -o /dev/null -m 10 "$BASE/" | tr -d '\r' | tr 'A-Z' 'a-z')
for h in "x-robots-tag: noindex" "x-content-type-options: nosniff" "x-frame-options: deny" "content-security-policy:" "referrer-policy:"; do
  [[ "$headers" == *"$h"* ]] && ok "header $h" || bad "header '$h' missing"
done
[[ "$headers" == *"x-powered-by"* ]] && bad "x-powered-by header exposed" || ok "no x-powered-by"
if [[ "$BASE" == https://* ]]; then
  [[ "$headers" == *"strict-transport-security:"* ]] && ok "HSTS" || bad "HSTS missing"
fi

if (( fail )); then echo "SMOKE TEST FAILED"; exit 1; fi
echo "SMOKE TEST PASSED"
