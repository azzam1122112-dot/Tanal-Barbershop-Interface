#!/usr/bin/env bash
# نشر إصدار جديد على خادم الإنتاج (tanal-prod).
#
# يُنفَّذ على الخادم بصلاحية root:
#     tar -czf /tmp/tanal-<sha>.tar.gz ...   # أو: git archive من جهاز التطوير ثم scp
#     deploy/release.sh /tmp/tanal-<sha>.tar.gz <sha>
#
# يبني الإصدار الجديد في مجلد مستقل بينما الإصدار الحالي ما زال يخدم الطلبات،
# فلا يتوقف الموقع إلا لحظة التبديل وإعادة التشغيل. وإن فشل فحص الصحة بعد
# التبديل يرجع تلقائيًا إلى الإصدار السابق بدل ترك الإنتاج معطّلًا.
set -Eeuo pipefail

readonly APP_DIR=/srv/tanal/app
readonly RELEASES_DIR=/srv/tanal/releases
readonly SERVICE=tanal.service
readonly APP_USER=tanal
readonly HEALTH_URL=http://127.0.0.1:3000/api/health/readiness
readonly NODE_PATH_ENV=/usr/local/bin:/usr/bin:/bin

# The production unit is the source of truth for the secret environment path.
# Older installations used a different location, so hard-coding one path makes
# an otherwise healthy server impossible to deploy. TANAL_ENV_FILE remains an
# explicit emergency override, while systemd supplies the normal value.
SYSTEMD_ENV_FILE="$(
  systemctl show "$SERVICE" --property=EnvironmentFiles --value \
    | awk '{ path=$1; sub(/^-/, "", path); print path; exit }'
)"
readonly ENV_FILE="${TANAL_ENV_FILE:-${SYSTEMD_ENV_FILE:-/etc/tanal/tanal.env}}"

TARBALL="${1:-}"
SHA="${2:-}"

if [[ -z "$TARBALL" || -z "$SHA" ]]; then
  echo "usage: $0 <source-tarball> <git-sha>" >&2
  exit 2
fi
[[ $EUID -eq 0 ]] || { echo "must run as root" >&2; exit 2; }
[[ -f "$TARBALL" ]] || { echo "tarball not found: $TARBALL" >&2; exit 2; }
[[ -r "$ENV_FILE" ]] || { echo "env file not found: $ENV_FILE" >&2; exit 2; }

set -a; . "$ENV_FILE"; set +a

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || { echo "production environment is missing: $name" >&2; exit 2; }
}

for name in \
  DATABASE_URL REDIS_URL SESSION_SECRET CUSTOMER_OTP_PEPPER \
  RESEND_API_KEY EMAIL_FROM EMAIL_REPLY_TO RESEND_INBOUND_API_KEY \
  RESEND_WEBHOOK_SECRET SUPPORT_EMAIL_ADDRESS \
  PLATFORM_MFA_ENCRYPTION_KEY MAINTENANCE_TOKEN \
  PUBLIC_APP_URL ROOT_DOMAIN ALLOWED_ORIGINS \
  WEBAUTHN_RP_NAME WEBAUTHN_RP_ID WEBAUTHN_ORIGIN \
  BACKUP_AGE_RECIPIENT MONITOR_ALERT_EMAIL MONITOR_EMAIL_FROM; do
  require_env "$name"
done

[[ "${#SESSION_SECRET}" -ge 32 ]] || { echo "SESSION_SECRET is invalid" >&2; exit 2; }
[[ "${#CUSTOMER_OTP_PEPPER}" -ge 32 ]] || { echo "CUSTOMER_OTP_PEPPER is invalid" >&2; exit 2; }
[[ "${REDIS_REQUIRED:-}" == "true" ]] || { echo "REDIS_REQUIRED must be true" >&2; exit 2; }
[[ "${EMAIL_REQUIRED:-}" == "true" ]] || { echo "EMAIL_REQUIRED must be true" >&2; exit 2; }
[[ "${INBOUND_EMAIL_REQUIRED:-}" == "true" ]] || { echo "INBOUND_EMAIL_REQUIRED must be true" >&2; exit 2; }
[[ "${EMAIL_PROVIDER:-}" == "resend" ]] || { echo "EMAIL_PROVIDER must be resend" >&2; exit 2; }
[[ "${REQUIRE_EXPLICIT_SEED_CREDENTIALS:-}" == "true" ]] || {
  echo "REQUIRE_EXPLICIT_SEED_CREDENTIALS must be true" >&2; exit 2;
}
[[ "$WEBAUTHN_RP_NAME" == "XMANSX" ]] || { echo "WEBAUTHN_RP_NAME is invalid" >&2; exit 2; }
[[ "$WEBAUTHN_RP_ID" == "xmansx.com" ]] || { echo "WEBAUTHN_RP_ID is invalid" >&2; exit 2; }
[[ "${WEBAUTHN_ORIGIN%/}" == "https://xmansx.com" ]] || { echo "WEBAUTHN_ORIGIN is invalid" >&2; exit 2; }
[[ "${PUBLIC_APP_URL%/}" == "https://xmansx.com" ]] || { echo "PUBLIC_APP_URL is invalid" >&2; exit 2; }
[[ "$ROOT_DOMAIN" == "xmansx.com" ]] || { echo "ROOT_DOMAIN is invalid" >&2; exit 2; }
ALLOWED_ORIGINS_COMPACT="${ALLOWED_ORIGINS//[[:space:]]/}"
[[ ",$ALLOWED_ORIGINS_COMPACT," == *",https://xmansx.com,"* ]] || { echo "ALLOWED_ORIGINS must include https://xmansx.com" >&2; exit 2; }
[[ "$EMAIL_REPLY_TO" == "support@xmansx.com" ]] || { echo "EMAIL_REPLY_TO is invalid" >&2; exit 2; }
[[ "$SUPPORT_EMAIL_ADDRESS" == "support@xmansx.com" ]] || { echo "SUPPORT_EMAIL_ADDRESS is invalid" >&2; exit 2; }
[[ "$MONITOR_ALERT_EMAIL" == "support@xmansx.com" ]] || { echo "MONITOR_ALERT_EMAIL is invalid" >&2; exit 2; }
[[ "$EMAIL_FROM" == *"@xmansx.com"* ]] || { echo "EMAIL_FROM is invalid" >&2; exit 2; }
[[ "$MONITOR_EMAIL_FROM" == *"@xmansx.com"* ]] || { echo "MONITOR_EMAIL_FROM is invalid" >&2; exit 2; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STAGE="$RELEASES_DIR/staging-$SHA"
PREVIOUS="$RELEASES_DIR/app-before-$SHA-$STAMP"

echo "==> نسخة احتياطية لقاعدة البيانات"
# تستخدم نفس خدمة الإنتاج: pg_dump مخصص، تحقق بنيوي، تشفير age، checksum،
# وصلاحيات 0600. فشل أي خطوة يمنع النشر قبل لمس الإصدار أو المخطط.
systemctl start tanal-backup.service

echo "==> تجهيز الإصدار في $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE"
tar -xzf "$TARBALL" -C "$STAGE"
echo "$SHA" > "$STAGE/.release-sha"
chown -R "$APP_USER:$APP_USER" "$STAGE"

# لا تضبط NODE_ENV=production هنا: npm يتخطّى عندها devDependencies، فيسقط
# TypeScript وTailwind ويفشل البناء. والأهم أن ExecStartPre في وحدة systemd
# يشغّل `prisma migrate deploy` وحزمة prisma نفسها devDependency — أي أن تقليم
# حزم التطوير بعد البناء يمنع الخدمة من الإقلاع أصلًا. تبقى كاملة عن قصد.
# ‏`runuser` يرث مجلد عمل المُشغِّل لا مجلد السكربت، و`npm ci` يقرأ
# package-lock.json من مجلد العمل. بلا هذا الانتقال يفشل بـ EUSAGE.
cd "$STAGE"

EXPECTED_NODE="$(tr -d '\r\n' < .node-version)"
ACTUAL_NODE="$(node -p 'process.versions.node')"
[[ "$ACTUAL_NODE" == "$EXPECTED_NODE" ]] || {
  echo "Node version mismatch: expected $EXPECTED_NODE" >&2
  exit 2
}

echo "==> تثبيت الحزم (مع حزم التطوير — لازمة للبناء وللهجرات)"
runuser -u "$APP_USER" -- env --chdir="$STAGE" PATH="$NODE_PATH_ENV" NODE_ENV=development \
  npm ci --include=dev --no-audit --no-fund

echo "==> توليد عميل Prisma والبناء"
runuser -u "$APP_USER" -- env --chdir="$STAGE" PATH="$NODE_PATH_ENV" DATABASE_URL="$DATABASE_URL" \
  npm run prisma:generate
# البناء لا يملك صلاحية تغيير Production. إذا احتاجت صفحة مخططًا لم يُطبّق بعد
# فهذه مشكلة build-time data access ويجب إصلاحها، لا تجاوزها بترحيل مبكر.
runuser -u "$APP_USER" -- env --chdir="$STAGE" PATH="$NODE_PATH_ENV" NODE_ENV=production DATABASE_URL="$DATABASE_URL" \
  npm run build

echo "==> التبديل وإعادة التشغيل"
# اخرج من المجلد قبل نقله: البقاء داخله يجعل مجلد العمل يتبع inode المنقول،
# فيصبح الرجوع (rm -rf على المجلد الحالي) عملية على أرض تتحرك تحت القدمين.
cd /
systemctl stop "$SERVICE"
mv "$APP_DIR" "$PREVIOUS"
mv "$STAGE" "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
# ExecStartPre في tanal.service يطبّق `prisma migrate deploy` بعد التبديل وقبل
# أن تبدأ العملية الجديدة في قبول الطلبات.
systemctl start "$SERVICE"

echo "==> فحص الصحة"
for attempt in $(seq 1 20); do
  if curl -sf --max-time 5 "$HEALTH_URL" > /dev/null; then
    echo "الإصدار $SHA يعمل. الإصدار السابق محفوظ في $PREVIOUS"
    exit 0
  fi
  sleep 3
done

echo "!! فشل فحص الصحة — رجوع تلقائي إلى الإصدار السابق" >&2
# لا يمكن الرجوع آليًا عن مخطط PostgreSQL. لذلك لا يدخل هذا المسار إلا migrations
# متوافقة رجعيًا؛ أما migration هادم فيحتاج خطة forward-fix وموافقة مستقلة.
systemctl stop "$SERVICE"
rm -rf "$APP_DIR"
mv "$PREVIOUS" "$APP_DIR"
systemctl start "$SERVICE"
echo "!! تم الرجوع. راجع: journalctl -u $SERVICE -n 50" >&2
exit 1
