#!/usr/bin/env bash
#
# Deploy squaark to the production server.
#
#   ./deploy.sh                full deploy
#   ./deploy.sh --dry-run      show exactly what would change on the server, touch nothing
#   ./deploy.sh --skip-tests   skip the local typecheck/test gate
#   ./deploy.sh --yes          don't prompt for confirmation
#
# Source is rsync'd to the server and BUILT THERE. That's deliberate: argon2,
# better-sqlite3 and sharp are native modules, so a node_modules built on your
# Mac would not load on a Linux server.
#
# Connection details come from ./.env.deploy (gitignored) or the environment:
#
#   DEPLOY_HOST=your.server.com      (required)
#   DEPLOY_USER=squaark
#   DEPLOY_PATH=/opt/squaark
#   DEPLOY_SERVICE=squaark
#   SSH_KEY=~/.ssh/id_ed25519        (optional, else your ssh-agent/default key)
#
set -euo pipefail

cd "$(dirname "$0")"

# ── Config ───────────────────────────────────────────────────────────────────
# shellcheck disable=SC1091
[ -f .env.deploy ] && source .env.deploy

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-squaark}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/squaark}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-squaark}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"
SSH_KEY="${SSH_KEY:-}"

DRY_RUN=0
SKIP_TESTS=0
ASSUME_YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)    DRY_RUN=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --yes|-y)     ASSUME_YES=1 ;;
    -h|--help)    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)            echo "unknown option: $1 (try --help)" >&2; exit 1 ;;
  esac
  shift
done

# ── Output helpers ───────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; RESET=''
fi
step() { echo; echo "${BOLD}==> $*${RESET}"; }
info() { echo "    $*"; }
warn() { echo "${YELLOW}    ! $*${RESET}"; }
die()  { echo "${RED}==> $*${RESET}" >&2; exit 1; }

[ -n "$DEPLOY_HOST" ] || die "DEPLOY_HOST is not set. Put it in .env.deploy or pass it in the environment."

# Plain strings rather than arrays: macOS ships bash 3.2, where expanding an
# empty array under `set -u` is an error. ${SSH_KEY:+...} yields nothing at all
# when SSH_KEY is unset, so both forms stay safe.
TARGET="$DEPLOY_USER@$DEPLOY_HOST"
SSH_CMD="ssh${SSH_KEY:+ -i $SSH_KEY}"

remote() { ssh ${SSH_KEY:+-i "$SSH_KEY"} "$TARGET" "$@"; }

# ── Pre-flight ───────────────────────────────────────────────────────────────
step "Deploying to ${TARGET}:${DEPLOY_PATH}"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
info "branch:  $BRANCH"
info "commit:  $(git rev-parse --short HEAD 2>/dev/null || echo '?')"

# rsync ships the working tree, not HEAD — uncommitted edits and untracked
# files both go live, so check for either.
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  warn "working tree is dirty; uncommitted/untracked files WILL be deployed"
fi
[ "$BRANCH" = "master" ] || warn "not on master"

if [ "$ASSUME_YES" -eq 0 ] && [ "$DRY_RUN" -eq 0 ]; then
  printf "\n    Continue? [y/N] "
  read -r reply
  case "$reply" in [yY]*) ;; *) die "aborted" ;; esac
fi

# ── Local gate ───────────────────────────────────────────────────────────────
# Catch it here rather than after the server tree has already been overwritten.
if [ "$SKIP_TESTS" -eq 1 ]; then
  warn "skipping typecheck and tests"
else
  step "Typecheck"
  npm run typecheck
  step "Tests"
  npm test
fi

# ── Sync ─────────────────────────────────────────────────────────────────────
# --delete keeps the server identical to your tree, so files deleted in git
# actually disappear on the box.
#
# --delete-excluded is deliberately NOT used. rsync protects excluded paths from
# deletion, and that is the only thing standing between this script and the live
# database, customer uploads, backups and .env. Do not add it.
RSYNC_EXCLUDES=(
  --exclude '.git'
  --exclude '.github'
  --exclude 'node_modules'
  --exclude 'dist'
  --exclude 'data'
  --exclude 'uploads'
  --exclude 'backups'
  --exclude '.env'
  --exclude '.env.deploy'
  --exclude 'tests'
  --exclude '*.db'
  --exclude '*.log'
  --exclude '.DS_Store'
)

if [ "$DRY_RUN" -eq 1 ]; then
  step "Dry run — changes rsync would make on the server"
  rsync -az --delete --itemize-changes --dry-run \
    -e "$SSH_CMD" \
    "${RSYNC_EXCLUDES[@]}" ./ "$TARGET:$DEPLOY_PATH/"
  echo
  info "${DIM}nothing was changed${RESET}"
  exit 0
fi

step "Syncing source"
# --stats rather than --info=stats1: macOS ships openrsync, which reports itself
# as "rsync 2.6.9 compatible" and rejects the newer --info flag.
rsync -az --delete --stats \
  -e "$SSH_CMD" \
  "${RSYNC_EXCLUDES[@]}" ./ "$TARGET:$DEPLOY_PATH/"

# ── Build and restart ────────────────────────────────────────────────────────
step "Building and restarting on the server"
remote "DEPLOY_PATH='$DEPLOY_PATH' DEPLOY_SERVICE='$DEPLOY_SERVICE' bash -euo pipefail -s" <<'REMOTE'
cd "$DEPLOY_PATH"

# Full install first — `npm run build` needs typescript, a devDependency.
# Native modules compile here, against this machine's Node and libc.
echo "    npm ci"
npm ci --no-audit --no-fund

# Migrations run on boot and are not reversible, so snapshot the database before
# the new code can touch it. Uses SQLite's online backup API, safe while the old
# process is still serving.
echo "    backing up database"
npm run db:backup

echo "    building"
npm run build

# dist/ exists and native modules are built; the compiler and test deps are dead
# weight at runtime.
npm prune --omit=dev

echo "    restarting $DEPLOY_SERVICE"
sudo systemctl restart "$DEPLOY_SERVICE"
REMOTE

# ── Verify ───────────────────────────────────────────────────────────────────
# A clean `systemctl restart` is not proof the app came up — it can still exit on
# a bad migration or a missing env var. /health is 200 only when the process is
# up AND the database is reachable.
step "Verifying health"
if remote "DEPLOY_SERVICE='$DEPLOY_SERVICE' HEALTH_URL='$HEALTH_URL' bash -euo pipefail -s" <<'REMOTE'
for i in $(seq 1 15); do
  if curl -fsS --max-time 5 "$HEALTH_URL" > /dev/null 2>&1; then
    echo "    healthy after ${i}s"
    exit 0
  fi
  sleep 1
done
echo "    /health did not return 200 within 15s — last 50 journal lines:" >&2
sudo journalctl -u "$DEPLOY_SERVICE" -n 50 --no-pager >&2
exit 1
REMOTE
then
  echo
  echo "${GREEN}${BOLD}==> Deployed${RESET}"
else
  echo
  die "Deploy finished but the app is NOT healthy. The previous database backup is in $DEPLOY_PATH/backups/."
fi
