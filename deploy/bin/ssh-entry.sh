#!/usr/bin/env bash
# Forced command for the CI deploy key (authorized_keys: command="/opt/brenvio-web/bin/ssh-entry.sh",restrict).
# The deploy user can run exactly these operations and nothing else:
#   ssh brenvio-deploy@host "deploy <tag>" < image.tar.gz
#   ssh brenvio-deploy@host "rollback [<tag>]"
#   ssh brenvio-deploy@host "status"
set -euo pipefail

read -r -a args <<<"${SSH_ORIGINAL_COMMAND:-}"
tag_re='^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'

case "${args[0]:-}" in
  deploy)
    [[ ${#args[@]} -eq 2 && "${args[1]}" =~ $tag_re ]] || { echo "usage: deploy <tag>" >&2; exit 64; }
    exec sudo -n /opt/brenvio-web/bin/remote.sh deploy "${args[1]}" --stdin
    ;;
  rollback)
    if [[ ${#args[@]} -eq 1 ]]; then exec sudo -n /opt/brenvio-web/bin/remote.sh rollback; fi
    [[ ${#args[@]} -eq 2 && "${args[1]}" =~ $tag_re ]] || { echo "usage: rollback [<tag>]" >&2; exit 64; }
    exec sudo -n /opt/brenvio-web/bin/remote.sh rollback "${args[1]}"
    ;;
  status)
    exec sudo -n /opt/brenvio-web/bin/remote.sh status
    ;;
  *)
    echo "allowed commands: deploy <tag> | rollback [<tag>] | status" >&2
    exit 64
    ;;
esac
