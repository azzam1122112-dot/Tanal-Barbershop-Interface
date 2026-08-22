#!/usr/bin/env bash
# Atomic Docker Compose production release for TANAL.
set -Eeuo pipefail

readonly DEPLOY_ROOT=/opt/tanal
readonly APP_DIR="$DEPLOY_ROOT/app"
readonly RELEASES_DIR="$DEPLOY_ROOT/releases"
readonly BACKUPS_DIR="$DEPLOY_ROOT/backups"
readonly COMPOSE_FILE="$DEPLOY_ROOT/compose.yaml"
readonly BUILD_ENV_FILE="$DEPLOY_ROOT/env/tanal.env.build"
readonly POSTGRES_CONTAINER=tanal-postgres-1
readonly WEB_CONTAINER=tanal-web-1
readonly HEALTH_URL=http://127.0.0.1:13000/api/health/readiness

TARBALL="${1:-}"
SHA="${2:-}"

if [[ -z "$TARBALL" || -z "$SHA" ]]; then
  echo "usage: $0 <source-tarball> <git-sha>" >&2
  exit 2
fi

[[ $EUID -eq 0 ]] || { echo "must run as root" >&2; exit 2; }
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid source sha" >&2; exit 2; }
[[ -f "$TARBALL" ]] || { echo "tarball not found" >&2; exit 2; }
[[ -f "$COMPOSE_FILE" ]] || { echo "compose file not found" >&2; exit 2; }
[[ -r "$BUILD_ENV_FILE" ]] || { echo "build environment not found" >&2; exit 2; }
docker inspect "$POSTGRES_CONTAINER" "$WEB_CONTAINER" >/dev/null

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STAGE="$RELEASES_DIR/staging-$SHA"
PREVIOUS="$RELEASES_DIR/app-before-$SHA-$STAMP"
BACKUP_TMP="$BACKUPS_DIR/.tanal-before-$SHA-$STAMP.dump.tmp"
BACKUP="$BACKUPS_DIR/tanal-before-$SHA-$STAMP.dump"
CANDIDATE_IMAGE="tanal-web:candidate-$SHA"
ROLLBACK_IMAGE="tanal-web:rollback-$SHA"
CURRENT_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$WEB_CONTAINER")"
BUILD_CONTAINER="tanal-build-${SHA:0:12}"
SWAPPED=0
ACTIVATED=0

cleanup() {
  set +e
  docker rm -f "$BUILD_CONTAINER" >/dev/null 2>&1
  rm -f -- "$BACKUP_TMP" "$TARBALL" "$0"
}

rollback() {
  local line="$1"
  trap - ERR
  set +e
  echo "deployment failed at line $line; restoring the previous release" >&2

  if [[ "$ACTIVATED" -eq 1 ]]; then
    docker tag "$CURRENT_IMAGE_ID" tanal-web:latest
  fi

  if [[ "$SWAPPED" -eq 1 && -d "$PREVIOUS" ]]; then
    rm -rf -- "$APP_DIR"
    mv -- "$PREVIOUS" "$APP_DIR"
  fi

  if [[ "$ACTIVATED" -eq 1 ]]; then
    docker compose -f "$COMPOSE_FILE" up -d --no-deps --no-build --force-recreate web
    for _ in $(seq 1 24); do
      curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null && break
      sleep 5
    done
  fi

  if [[ "$SWAPPED" -eq 1 ]]; then
    echo "previous TANAL release restored" >&2
  else
    echo "current TANAL release was never replaced" >&2
  fi
  [[ -f "$BACKUP" ]] && echo "database backup: $BACKUP" >&2
  exit 1
}

trap cleanup EXIT
trap 'rollback $LINENO' ERR

mkdir -p "$RELEASES_DIR" "$BACKUPS_DIR"
rm -rf -- "$STAGE"
mkdir -p "$STAGE"

# GitHub creates this with git archive. Reject path traversal before extraction
# so even an accidentally replaced archive cannot write outside the stage.
while IFS= read -r entry; do
  case "/$entry/" in
    */../*|//* ) echo "unsafe archive entry" >&2; exit 2 ;;
  esac
done < <(tar -tzf "$TARBALL")

echo "preparing immutable release $SHA"
tar -xzf "$TARBALL" -C "$STAGE"
[[ -f "$STAGE/Dockerfile" ]] || { echo "release Dockerfile missing" >&2; exit 2; }
printf '%s\n' "$SHA" > "$STAGE/.release-sha"

echo "compiling the candidate in an ephemeral container"
(
  trap - ERR
  set -a
  # The root-owned file is shell-compatible and may quote values. Sourcing it
  # strips those quotes; Docker's --env-file parser would keep them literally.
  . "$BUILD_ENV_FILE"
  set +a

  BUILD_ENV_ARGS=()
  while IFS= read -r key; do
    [[ -v "$key" ]] && BUILD_ENV_ARGS+=(--env "$key")
  done < <(
    sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=.*/\2/p' \
      "$BUILD_ENV_FILE"
  )

  docker run --detach --rm \
    --name "$BUILD_CONTAINER" \
    --network host \
    "${BUILD_ENV_ARGS[@]}" \
    --env NODE_ENV=development \
    --env NEXT_TELEMETRY_DISABLED=1 \
    --volume "$STAGE:/app" \
    --workdir /app \
    "$CURRENT_IMAGE_ID" \
    sleep infinity >/dev/null
  docker exec "$BUILD_CONTAINER" sh -ceu '
      export NODE_ENV=development
      npm ci --include=dev --no-audit --no-fund
      npm run prisma:generate
      export NODE_ENV=production
      npm run build
    '
  docker rm -f "$BUILD_CONTAINER" >/dev/null
)

echo "building candidate image while the current release stays online"
docker build \
  --network host \
  --label "org.opencontainers.image.revision=$SHA" \
  --tag "$CANDIDATE_IMAGE" \
  "$STAGE"

echo "backing up PostgreSQL before migrations"
umask 077
docker exec "$POSTGRES_CONTAINER" sh -ceu \
  'pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  > "$BACKUP_TMP"
[[ -s "$BACKUP_TMP" ]] || { echo "database backup is empty" >&2; exit 2; }
docker exec -i "$POSTGRES_CONTAINER" sh -ceu 'pg_restore --list >/dev/null' < "$BACKUP_TMP"
mv -- "$BACKUP_TMP" "$BACKUP"
chmod 600 "$BACKUP"

echo "activating release $SHA"
mv -- "$APP_DIR" "$PREVIOUS"
mv -- "$STAGE" "$APP_DIR"
SWAPPED=1
docker tag "$CURRENT_IMAGE_ID" "$ROLLBACK_IMAGE"
docker tag "$CANDIDATE_IMAGE" tanal-web:latest
ACTIVATED=1
docker compose -f "$COMPOSE_FILE" up -d --no-deps --no-build --force-recreate web

for _ in $(seq 1 36); do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; then
    RUNNING_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$WEB_CONTAINER")"
    CANDIDATE_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$CANDIDATE_IMAGE")"
    [[ "$RUNNING_IMAGE_ID" == "$CANDIDATE_IMAGE_ID" ]] || {
      echo "healthy container is not running the requested image" >&2
      exit 1
    }
    echo "TANAL release $SHA is healthy; backup: $BACKUP"
    exit 0
  fi
  sleep 5
done

echo "new TANAL container did not become healthy" >&2
exit 1
