#!/usr/bin/env bash
#
# Deploy fotofoto na Raspberry Pi. Uruchamiany NA PI, nie z laptopa.
#
#   ./scripts/deploy.sh            # najnowszy tag
#   ./scripts/deploy.sh v0.3.0     # konkretny tag
#
# Jeśli healthcheck nie przejdzie, skrypt sam cofa się na poprzedni commit.

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/fotofoto/app}"
SERVICE="${SERVICE:-fotofoto}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/healthz}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-30}"

cd "$APP_DIR"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m!! %s\033[0m\n' "$*" >&2; }

wait_for_health() {
  local deadline=$(( SECONDS + HEALTH_TIMEOUT ))
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

say "pobieram zmiany"
git fetch --tags --prune origin

# Celowo bez `git tag | head -1`: przy `set -o pipefail` head zamyka potok,
# git dostaje SIGPIPE i cały skrypt przewraca się na kodzie 141.
REF="${1:-$(git for-each-ref --sort=-v:refname --format='%(refname:short)' --count=1 refs/tags)}"
if [[ -z "$REF" ]]; then
  fail "brak tagów w repo — podaj ref jawnie: ./scripts/deploy.sh <tag>"
  exit 1
fi

# Zapamiętujemy DOKŁADNY commit, nie nazwę gałęzi — do niego wracamy przy awarii.
PREVIOUS="$(git rev-parse HEAD)"
say "wdrażam $REF (obecnie: $(git rev-parse --short HEAD))"

git checkout --quiet --force "$REF"
npm ci --omit=dev

# Migracje PRZED restartem: o błędzie schematu chcemy wiedzieć,
# zanim ubijemy działającą aplikację.
say "migracje"
node scripts/migrate.js

say "restart usługi"
sudo systemctl restart "$SERVICE"

if wait_for_health; then
  say "deploy ok — $REF"
  curl -fsS "$HEALTH_URL"; echo
  exit 0
fi

fail "healthcheck nie przeszedł w ${HEALTH_TIMEOUT}s — cofam na ${PREVIOUS:0:7}"
git checkout --quiet --force "$PREVIOUS"
npm ci --omit=dev
sudo systemctl restart "$SERVICE"

if wait_for_health; then
  fail "cofnięto do ${PREVIOUS:0:7}. Aplikacja działa na poprzedniej wersji."
else
  fail "rollback też nie wstał. Sprawdź: journalctl -u $SERVICE -n 50 --no-pager"
fi
exit 1
