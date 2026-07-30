#!/usr/bin/env bash
#
# Overwrite the SERVER's database with your LOCAL one.
#
#   ./deploy-data.sh              push local data -> server (destructive)
#   ./deploy-data.sh --dry-run    show what would happen, change nothing
#   ./deploy-data.sh --yes        skip the typed confirmation
#
# DIRECTION IS LOCAL -> SERVER. This DESTROYS the live database: every order,
# customer and setting created in production since your local copy diverged is
# gone. The server's current database is copied to backups/ first, but restoring
# it is a manual step.
#
# Deliberately separate from ./deploy.sh, which never touches data/ — code
# deploys are routine, this is not.
#
# Config is shared with deploy.sh via ./.env.deploy (gitignored):
#
#   DEPLOY_HOST=your.server.com      (required)
#   DEPLOY_USER=squaark
#   DEPLOY_PATH=/opt/squaark
#   DEPLOY_SERVICE=squaark
#   SSH_KEY=~/.ssh/id_ed25519        (optional)
#   REMOTE_DB=/opt/squaark/data/store.db   (optional, if DATABASE_PATH differs)
#
set -euo pipefail

cd "$(dirname "$0")"

# ── Config ───────────────────────────────────────────────────────────────────
# .env.deploy supplies the connection details, but anything already set in the
# environment wins over it — otherwise `DEPLOY_HOST=staging ./deploy-data.sh`
# would silently overwrite the database on whatever host the file names.
_overrides="$(export -p | grep -E '^declare -x (DEPLOY_[A-Z_]+|SSH_KEY|HEALTH_URL|LOCAL_DB|REMOTE_DB)=' || true)"
# shellcheck disable=SC1091
[ -f .env.deploy ] && source .env.deploy
[ -n "$_overrides" ] && eval "$_overrides"

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-squaark}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/squaark}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-squaark}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"
SSH_KEY="${SSH_KEY:-}"
LOCAL_DB="${LOCAL_DB:-data/store.db}"
REMOTE_DB="${REMOTE_DB:-$DEPLOY_PATH/data/store.db}"

DRY_RUN=0
ASSUME_YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y)  ASSUME_YES=1 ;;
    -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)         echo "unknown option: $1 (try --help)" >&2; exit 1 ;;
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
[ -f "$LOCAL_DB" ]    || die "local database not found at $LOCAL_DB"

# Plain strings, not arrays: macOS bash 3.2 errors on empty array expansion
# under `set -u`.
TARGET="$DEPLOY_USER@$DEPLOY_HOST"
SSH_CMD="ssh${SSH_KEY:+ -i $SSH_KEY}"
remote() { ssh ${SSH_KEY:+-i "$SSH_KEY"} "$TARGET" "$@"; }

STAMP="$(date +%Y%m%d-%H%M%S)"
SNAPSHOT="$(mktemp -t squaark-data)"
trap 'rm -f "$SNAPSHOT"' EXIT

# ── Preflight ────────────────────────────────────────────────────────────────
step "Overwrite server database"
echo "${RED}${BOLD}    LOCAL  $LOCAL_DB${RESET}"
echo "${RED}${BOLD}      ->   $TARGET:$REMOTE_DB${RESET}"
echo

# The local DB is in WAL mode, so store.db on its own is NOT the whole database
# — recent commits sit in store.db-wal. Report both so the sizes aren't
# surprising; the snapshot step below is what actually merges them.
info "local main file:  $(du -h "$LOCAL_DB" | cut -f1)"
for side in wal shm; do
  [ -f "$LOCAL_DB-$side" ] && info "local $side:          $(du -h "$LOCAL_DB-$side" | cut -f1)"
done

step "Server's current database"
if remote "test -f '$REMOTE_DB'" 2>/dev/null; then
  info "$(remote "du -h '$REMOTE_DB' | cut -f1") at $REMOTE_DB"
  info "${DIM}will be copied to $DEPLOY_PATH/backups/pre-data-push-$STAMP.db${RESET}"
else
  warn "no database at $REMOTE_DB yet — nothing to overwrite, this is a first import"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  step "Dry run — would do the following"
  info "1. snapshot $LOCAL_DB (SQLite online backup, merges the WAL)"
  info "2. rsync the snapshot to $TARGET:$REMOTE_DB.incoming"
  info "3. sudo systemctl stop $DEPLOY_SERVICE"
  info "4. copy the server's current db to backups/pre-data-push-$STAMP.db"
  info "5. move the snapshot into place, delete the server's stale -wal/-shm"
  info "6. sudo systemctl start $DEPLOY_SERVICE, then poll $HEALTH_URL"
  echo
  info "${DIM}nothing was changed${RESET}"
  exit 0
fi

# ── Confirm ──────────────────────────────────────────────────────────────────
if [ "$ASSUME_YES" -eq 0 ]; then
  echo
  echo "${RED}    This DESTROYS all production data created since your local copy diverged.${RESET}"
  printf "    Type the hostname (%s) to proceed: " "$DEPLOY_HOST"
  read -r reply
  [ "$reply" = "$DEPLOY_HOST" ] || die "aborted (got '$reply')"
fi

# ── Snapshot ─────────────────────────────────────────────────────────────────
# Never rsync store.db/-wal/-shm as three loose files: they'd arrive at slightly
# different moments and a torn WAL against a half-copied main file is a corrupt
# database. SQLite's online backup API writes one internally consistent file
# with the WAL already folded in, so exactly one file needs to move.
step "Snapshotting local database"
npm run db:backup -- "$SNAPSHOT"
[ -s "$SNAPSHOT" ] || die "snapshot is empty — aborting before touching the server"

# ── Ship it ──────────────────────────────────────────────────────────────────
# Staged next to the real file so the final step is a rename within the same
# filesystem, which is atomic — no window where store.db is half-written.
step "Uploading snapshot"
rsync -az --stats -e "$SSH_CMD" "$SNAPSHOT" "$TARGET:$REMOTE_DB.incoming"

step "Swapping in on the server"
remote "DEPLOY_PATH='$DEPLOY_PATH' DEPLOY_SERVICE='$DEPLOY_SERVICE' REMOTE_DB='$REMOTE_DB' STAMP='$STAMP' bash -euo pipefail -s" <<'REMOTE'
# Already root means sudo is redundant, and lean server images often don't ship
# it at all. Only reach for it when we actually need it.
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

# Stop first. Overwriting the file under a running process leaves it holding a
# deleted inode and its own stale WAL — the classic way to corrupt SQLite.
echo "    stopping $DEPLOY_SERVICE"
$SUDO systemctl stop "$DEPLOY_SERVICE"

mkdir -p "$DEPLOY_PATH/backups"
if [ -f "$REMOTE_DB" ]; then
  BACKUP="$DEPLOY_PATH/backups/pre-data-push-$STAMP.db"
  echo "    backing up current database -> $BACKUP"
  cp -p "$REMOTE_DB" "$BACKUP"
  # The old WAL may hold commits not yet in the main file, so keep it alongside
  # the backup — without it the backup is missing the most recent writes.
  for side in wal shm; do
    [ -f "$REMOTE_DB-$side" ] && cp -p "$REMOTE_DB-$side" "$BACKUP-$side"
  done
fi

echo "    installing new database"
mv "$REMOTE_DB.incoming" "$REMOTE_DB"

# rsync -a preserved the snapshot's local uid/gid/mode, and mktemp creates files
# as 0600 — so without this the database arrives owned by your laptop account
# and unreadable to the service, which then dies with SQLITE_CANTOPEN. Match the
# data directory's owner, which is the account systemd runs the app as.
# Read the owner from the unit, not off the filesystem — the filesystem is what a
# bad deploy corrupts, so it can't be the source of truth.
SVC_USER="$(systemctl show "$DEPLOY_SERVICE" -p User --value)"
SVC_GROUP="$(systemctl show "$DEPLOY_SERVICE" -p Group --value)"
[ -n "$SVC_USER" ]  || SVC_USER=root
[ -n "$SVC_GROUP" ] || SVC_GROUP="$SVC_USER"
echo "    setting owner to $SVC_USER:$SVC_GROUP"
chown "$SVC_USER:$SVC_GROUP" "$REMOTE_DB"
chmod 600 "$REMOTE_DB"

# Critical: the old -wal/-shm belong to the database we just replaced. Leaving
# them would have SQLite replay another database's log over this one. They must
# also go because SQLite chowns new sidecars to match the main file's owner —
# stale ones keep the pre-chown identity and break WAL mode.
rm -f "$REMOTE_DB-wal" "$REMOTE_DB-shm"

# Repeated fast failures trip systemd's start-rate limit, after which it refuses
# to start at all until the counter is cleared.
$SUDO systemctl reset-failed "$DEPLOY_SERVICE" 2>/dev/null || true

echo "    starting $DEPLOY_SERVICE"
$SUDO systemctl start "$DEPLOY_SERVICE"
REMOTE

# ── Verify ───────────────────────────────────────────────────────────────────
# Migrations run on boot, so the new file gets upgraded here if it was older
# than the deployed code. /health is 200 only once the DB is actually readable.
step "Verifying health"
if remote "DEPLOY_SERVICE='$DEPLOY_SERVICE' HEALTH_URL='$HEALTH_URL' bash -euo pipefail -s" <<'REMOTE'
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

for i in $(seq 1 20); do
  if curl -fsS --max-time 5 "$HEALTH_URL" > /dev/null 2>&1; then
    echo "    healthy after ${i}s"
    exit 0
  fi
  sleep 1
done
echo "    /health did not return 200 within 20s — last 50 journal lines:" >&2
$SUDO journalctl -u "$DEPLOY_SERVICE" -n 50 --no-pager >&2
exit 1
REMOTE
then
  echo
  echo "${GREEN}${BOLD}==> Database replaced${RESET}"
  info "${DIM}previous database: $DEPLOY_PATH/backups/pre-data-push-$STAMP.db${RESET}"
else
  echo
  echo "${RED}${BOLD}==> The app is NOT healthy after replacing the database.${RESET}" >&2
  echo "${RED}    Roll back with:${RESET}" >&2
  echo "      ssh $TARGET 'sudo systemctl stop $DEPLOY_SERVICE" >&2
  echo "        && cp -p $DEPLOY_PATH/backups/pre-data-push-$STAMP.db $REMOTE_DB" >&2
  echo "        && rm -f $REMOTE_DB-wal $REMOTE_DB-shm" >&2
  echo "        && sudo systemctl start $DEPLOY_SERVICE'" >&2
  exit 1
fi
