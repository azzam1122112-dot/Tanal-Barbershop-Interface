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
readonly BACKUP_DIR=/var/backups/tanal
readonly ENV_FILE=/etc/tanal/tanal.env
readonly SERVICE=tanal.service
readonly APP_USER=tanal
readonly HEALTH_URL=http://127.0.0.1:3000/api/health/readiness
readonly NODE_PATH_ENV=/usr/local/bin:/usr/bin:/bin

TARBALL="${1:-}"
SHA="${2:-}"

if [[ -z "$TARBALL" || -z "$SHA" ]]; then
  echo "usage: $0 <source-tarball> <git-sha>" >&2
  exit 2
fi
[[ $EUID -eq 0 ]] || { echo "must run as root" >&2; exit 2; }
[[ -f "$TARBALL" ]] || { echo "tarball not found: $TARBALL" >&2; exit 2; }
[[ -r "$ENV_FILE" ]] || { echo "env file not found: $ENV_FILE" >&2; exit 2; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STAGE="$RELEASES_DIR/staging-$SHA"
PREVIOUS="$RELEASES_DIR/app-before-$SHA-$STAMP"

echo "==> نسخة احتياطية لقاعدة البيانات"
# DATABASE_URL يحمل ‎?schema=public‎ وpg_dump يرفض معاملات الاستعلام، لذا تُقصّ.
DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | sed 's/?.*$//')"
install -d -m 0750 "$BACKUP_DIR"
pg_dump --format=custom --dbname="$DB_URL" --file="$BACKUP_DIR/predeploy-$SHA-$STAMP.dump"

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
echo "==> تثبيت الحزم (مع حزم التطوير — لازمة للبناء وللهجرات)"
runuser -u "$APP_USER" -- env PATH="$NODE_PATH_ENV" NODE_ENV=development \
  npm ci --include=dev --no-audit --no-fund

echo "==> توليد عميل Prisma والبناء"
set -a; . "$ENV_FILE"; set +a
runuser -u "$APP_USER" -- env PATH="$NODE_PATH_ENV" DATABASE_URL="$DATABASE_URL" \
  npm run prisma:generate --prefix "$STAGE"
runuser -u "$APP_USER" -- env PATH="$NODE_PATH_ENV" NODE_ENV=production DATABASE_URL="$DATABASE_URL" \
  npm run build --prefix "$STAGE"

echo "==> التبديل وإعادة التشغيل"
systemctl stop "$SERVICE"
mv "$APP_DIR" "$PREVIOUS"
mv "$STAGE" "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
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
systemctl stop "$SERVICE"
rm -rf "$APP_DIR"
mv "$PREVIOUS" "$APP_DIR"
systemctl start "$SERVICE"
echo "!! تم الرجوع. راجع: journalctl -u $SERVICE -n 50" >&2
exit 1
