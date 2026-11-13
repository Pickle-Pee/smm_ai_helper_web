#!/usr/bin/env bash
# Brenvio web — server-side deploy / rollback / status.
# Installed as /opt/brenvio-web/bin/remote.sh (root:root 0755). Run as root (directly or via sudo).
#
#   remote.sh deploy <tag>           # image brenvio-web:<tag> must exist locally, or be piped on stdin
#   remote.sh deploy <tag> --stdin   # load a `docker save | gzip` archive from stdin first
#   remote.sh rollback [<tag>]       # previous tag by default
#   remote.sh status
#
# Only touches the `brenvio-web` compose project and `brenvio-web:*` images.
set -euo pipefail

APP_DIR="${BRENVIO_APP_DIR:-/opt/brenvio-web}"
IMAGE="brenvio-web"
PROJECT="brenvio-web"
ENV_FILE="$APP_DIR/.env"
STATE_DIR="$APP_DIR/state"
KEEP_IMAGES=5
HEALTH_TIMEOUT=120

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/lock"
flock -n 9 || { echo "another deploy is running" >&2; exit 75; }

log() { local msg="[$(date -u +%FT%TZ)] $*"; echo "$msg"; echo "$msg" >>"$STATE_DIR/deploy.log"; logger -t brenvio-deploy -- "$*" 2>/dev/null || true; }
die() { log "ERROR: $*"; exit 1; }

valid_tag() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; }
compose() { docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" -f "$APP_DIR/compose.yaml" "$@"; }
current_tag() { sed -n 's/^BRENVIO_TAG=//p' "$ENV_FILE" | tail -n1; }
port() { local p; p=$(sed -n 's/^BRENVIO_PORT=//p' "$ENV_FILE" | tail -n1); echo "${p:-3100}"; }

set_tag() {
  local tag="$1" tmp
  tmp=$(mktemp "$APP_DIR/.env.XXXXXX")
  if grep -q '^BRENVIO_TAG=' "$ENV_FILE"; then
    sed "s/^BRENVIO_TAG=.*/BRENVIO_TAG=$tag/" "$ENV_FILE" >"$tmp"
  else
    cat "$ENV_FILE" >"$tmp"; echo "BRENVIO_TAG=$tag" >>"$tmp"
  fi
  chmod 600 "$tmp"; mv "$tmp" "$ENV_FILE"
}

wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) cid state
  while (( SECONDS < deadline )); do
    cid=$(compose ps -q web 2>/dev/null || true)
    if [[ -n "$cid" ]]; then
      state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)
      if [[ "$state" == "healthy" ]] && curl -fsS -m 5 "http://127.0.0.1:$(port)/api/health" >/dev/null; then
        return 0
      fi
      [[ "$state" == "unhealthy" || "$state" == "exited" ]] && return 1
    fi
    sleep 3
  done
  return 1
}

switch_to() {
  local tag="$1"
  docker image inspect "$IMAGE:$tag" >/dev/null 2>&1 || die "image $IMAGE:$tag not found"
  set_tag "$tag"
  compose up -d --remove-orphans web
  wait_healthy
}

prune_images() {
  local keep_current keep_prev
  keep_current=$(current_tag); keep_prev=$(cat "$STATE_DIR/previous_tag" 2>/dev/null || true)
  docker image ls "$IMAGE" --format '{{.Tag}} {{.CreatedAt}}' | sort -k2 -r | awk '{print $1}' | tail -n +$((KEEP_IMAGES + 1)) |
    while read -r old; do
      [[ "$old" == "$keep_current" || "$old" == "$keep_prev" || -z "$old" ]] && continue
      docker image rm "$IMAGE:$old" >/dev/null 2>&1 && log "pruned old image $IMAGE:$old" || true
    done
}

cmd_deploy() {
  local tag="${1:-}" from_stdin="${2:-}"
  valid_tag "$tag" || die "invalid tag '$tag'"
  if [[ "$from_stdin" == "--stdin" ]]; then
    log "loading image archive for $tag from stdin"
    gzip -dc | docker load >/dev/null || die "docker load failed"
  fi
  docker image inspect "$IMAGE:$tag" >/dev/null 2>&1 || die "image $IMAGE:$tag not present after load"

  local prev; prev=$(current_tag)
  log "deploy $tag (current: ${prev:-none})"
  if switch_to "$tag"; then
    if [[ -n "$prev" && "$prev" != "$tag" ]] && docker image inspect "$IMAGE:$prev" >/dev/null 2>&1; then
      echo "$prev" >"$STATE_DIR/previous_tag"
    fi
    echo "$tag" >"$STATE_DIR/current_tag"
    log "deploy $tag OK"
    prune_images
  else
    log "deploy $tag FAILED health check"
    compose logs --tail 50 web || true
    if [[ -n "$prev" && "$prev" != "$tag" ]] && docker image inspect "$IMAGE:$prev" >/dev/null 2>&1; then
      log "automatic rollback to $prev"
      switch_to "$prev" && log "rollback to $prev OK" || log "rollback to $prev FAILED"
    fi
    exit 1
  fi
}

cmd_rollback() {
  local target="${1:-}"
  [[ -z "$target" ]] && target=$(cat "$STATE_DIR/previous_tag" 2>/dev/null || true)
  [[ -n "$target" ]] || die "no previous tag recorded; pass a tag explicitly (see: remote.sh status)"
  valid_tag "$target" || die "invalid tag '$target'"
  local cur; cur=$(current_tag)
  log "rollback $cur -> $target"
  if switch_to "$target"; then
    echo "$cur" >"$STATE_DIR/previous_tag"
    echo "$target" >"$STATE_DIR/current_tag"
    log "rollback to $target OK"
  else
    die "rollback to $target failed health check"
  fi
}

cmd_status() {
  echo "current: $(current_tag)"
  echo "previous: $(cat "$STATE_DIR/previous_tag" 2>/dev/null || echo none)"
  compose ps
  echo "images:"; docker image ls "$IMAGE" --format '  {{.Tag}}  {{.CreatedSince}}  {{.Size}}'
  echo -n "health: "; curl -fsS -m 5 "http://127.0.0.1:$(port)/api/health" || echo "unreachable"
  echo
}

case "${1:-}" in
  deploy) shift; cmd_deploy "$@" ;;
  rollback) shift; cmd_rollback "$@" ;;
  status) cmd_status ;;
  *) echo "usage: $0 deploy <tag> [--stdin] | rollback [<tag>] | status" >&2; exit 64 ;;
esac
