#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health/readiness}"
readonly STATE_DIR="${STATE_DIRECTORY:-/var/lib/tanal-monitor}"
readonly LAST_ALERT_FILE="$STATE_DIR/last-alert-at"
readonly COOLDOWN="${MONITOR_ALERT_COOLDOWN_SECONDS:-1800}"

if curl --fail --silent --show-error --max-time 10 "$HEALTH_URL" >/dev/null; then
  exit 0
fi

logger --priority daemon.crit --tag xmansx-monitor "XMANSX readiness check failed"

: "${RESEND_API_KEY:?RESEND_API_KEY is required for health alerts}"
: "${MONITOR_ALERT_EMAIL:?MONITOR_ALERT_EMAIL is required for health alerts}"
: "${MONITOR_EMAIL_FROM:?MONITOR_EMAIL_FROM is required for health alerts}"
[[ "$COOLDOWN" =~ ^[0-9]+$ ]] || { echo "MONITOR_ALERT_COOLDOWN_SECONDS is invalid" >&2; exit 1; }

mkdir -p -- "$STATE_DIR"
now="$(date +%s)"
last=0
if [[ -r "$LAST_ALERT_FILE" ]]; then
  read -r last < "$LAST_ALERT_FILE" || last=0
fi
if [[ "$last" =~ ^[0-9]+$ ]] && (( now - last < COOLDOWN )); then
  exit 1
fi

host="$(hostname -s | tr -cd '[:alnum:]._-')"
window="$(( now / COOLDOWN ))"
payload="$(
  ALERT_HOST="$host" ALERT_TO="$MONITOR_ALERT_EMAIL" ALERT_FROM="$MONITOR_EMAIL_FROM" \
    node -e '
      process.stdout.write(JSON.stringify({
        from: process.env.ALERT_FROM,
        to: [process.env.ALERT_TO],
        subject: "XMANSX: فشل فحص جاهزية الإنتاج",
        text: `فشل /api/health/readiness على المضيف ${process.env.ALERT_HOST}. راجع journalctl -u tanal.service وtanal-healthcheck.service.`,
        tags: [{ name: "message_type", value: "production_health_alert" }],
      }));
    '
)"

curl --fail --silent --show-error --max-time 15 \
  --request POST 'https://api.resend.com/emails' \
  --header "Authorization: Bearer $RESEND_API_KEY" \
  --header 'Content-Type: application/json' \
  --header "Idempotency-Key: xmansx-health-$host-$window" \
  --data "$payload" >/dev/null

printf '%s\n' "$now" > "$LAST_ALERT_FILE"
exit 1
