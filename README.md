# واجهة تنال

واجهة تنال للحلاقة الرجالية: نظام تشغيل وولاء فاخر لصالون حلاقة رجالي، مبني كـ Next.js Web/PWA بواجهة عربية RTL، وتطبيق حلاق Mobile-first، ولوحة مدير منفصلة لإدارة الصندوق والعملاء والزيارات والتقارير.

## المتطلبات

- Node.js LTS فقط: استخدم النسخة المحددة في `.nvmrc` وهي `22.22.3`.
- npm 10 أو أحدث.
- PostgreSQL للتطوير والإنتاج.
- Redis خاص وغير مكشوف للإنترنت في الإنتاج لتوحيد الكاش وحدود الطلبات بين نسخ التطبيق.

> لا يعتمد المشروع على Node Current أو Node v25 في الإنتاج.

## تجهيز Node على Windows

الخيار المفضل هو `nvm-windows`:

```powershell
nvm install 22.22.3
nvm use
node --version
```

إذا لم يكن `nvm` متاحًا، ثبّت Node.js LTS 22 يدويًا من موقع Node.js الرسمي أو استخدم نسخة محمولة، ثم تأكد أن `node --version` يعرض `v22.x` وليس Node v25.

## تجهيز PostgreSQL على Windows

لا تستخدم مستخدم `postgres` الافتراضي للتطبيق. إذا ظهر الخطأ:

```txt
password authentication failed for user "postgres"
```

فهذا يعني أن خدمة PostgreSQL تعمل، لكن كلمة مرور `postgres` غير صحيحة أو أن سياسة المصادقة لا تسمح بها. الحل الموصى به هو إنشاء مستخدم وقاعدة مخصصين للمشروع.

### خيار 1: داخل خدمة PostgreSQL المثبتة

نفّذ الأوامر التالية من `psql` أو pgAdmin بحساب يملك صلاحية إنشاء مستخدم وقاعدة:

```sql
CREATE USER tanal_user WITH PASSWORD 'tanal_dev_password';
CREATE DATABASE tanal_loyalty OWNER tanal_user;
GRANT ALL PRIVILEGES ON DATABASE tanal_loyalty TO tanal_user;
```

ثم استخدم:

```env
DATABASE_URL="postgresql://tanal_user:tanal_dev_password@localhost:5432/tanal_loyalty?schema=public"
```

### خيار 2: PostgreSQL محلي معزول داخل المشروع

هذا الخيار مناسب إذا لم تكن كلمة مرور `postgres` معروفة ولا تريد تعديل خدمة PostgreSQL الأصلية:

```powershell
Set-Content -LiteralPath ".postgres-pw" -Value "tanal_dev_password" -NoNewline
initdb -D ".postgres-data" -U "tanal_user" --pwfile=".postgres-pw" --encoding="UTF8" --locale="C"
Remove-Item -LiteralPath ".postgres-pw" -Force
pg_ctl -D ".postgres-data" -o "-p 55432" -l ".postgres-log" start
createdb -h localhost -p 55432 -U tanal_user tanal_loyalty
```

وفي هذه الحالة استخدم:

```env
DATABASE_URL="postgresql://tanal_user:tanal_dev_password@localhost:55432/tanal_loyalty?schema=public"
```

لإيقاف قاعدة المشروع المحلية:

```powershell
pg_ctl -D ".postgres-data" stop
```

## التشغيل المحلي

1. ثبّت الحزم:

```bash
npm install
```

2. انسخ ملف البيئة وعدّل `DATABASE_URL` حسب خيار PostgreSQL الذي تستخدمه:

```bash
cp .env.example .env
```

3. شغّل migration والـ seed:

```bash
npm run prisma:migrate -- --name init
npm run prisma:seed
```

4. للتحقق اليدوي من البيانات يمكن تشغيل Prisma Studio:

```bash
npx prisma studio
```

5. شغّل بيئة التطوير:

```bash
npm run dev
```

## أوامر الفحص

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm audit
```

## بيانات Demo اختيارية

الـ seed الأساسي يبقى نظيفًا ومناسبًا كبداية تشغيل. إذا أردت تجهيز بيانات عرض داخلية للتجربة، شغّل الأمر الاختياري التالي بعد `npm run prisma:seed`:

```bash
npm run demo:seed
```

ينشئ الأمر بيانات مميزة بالبادئة `[DEMO]` مثل عملاء تجريبيين، زيارات كاش وشبكة، زيارة بمكافأة، زيارة بحملة، جلسة صندوق مغلقة، تصحيح بعد الإغلاق، ورسالة واتساب draft. يمكن إعادة تشغيله لأنه ينظف بيانات `[DEMO]` السابقة أولًا. لا تشغّله على الإنتاج إلا إذا كنت تقصد إنشاء بيانات تجربة.

## جلسة الصندوق CashSession

الصالون يعمل 24 ساعة، لذلك لا يوجد مفهوم وردية أو وقت دوام ثابت داخل النظام. القفل التشغيلي لتسجيل الزيارات يعتمد فقط على جلسة الصندوق:

- يفتح الحلاق جلسة صندوق عندما يبدأ استقبال العملاء.
- لا يستطيع الحلاق تسجيل زيارة إذا لا توجد جلسة صندوق مفتوحة.
- كل زيارة جديدة ترتبط بـ `cashSessionId`.
- المدير يغلق جلسة الصندوق عند استلام الكاش أو المراجعة.
- بعد إغلاق الجلسة لا يمكن إضافة زيارات عليها.
- يمكن للحلاق فتح جلسة صندوق جديدة في نفس اليوم بعد إغلاق السابقة.
- التقارير اليومية تبقى تقارير حسب تاريخ الزيارة فقط، وليست هي التي تسمح أو تمنع العمل.
- `DailyClose` لم يعد القفل التشغيلي لتسجيل الزيارات.

## تجربة PWA

تطبيق الحلاق يبدأ من:

```txt
/barber
```

يحتوي المشروع على بيان مستقل لتطبيق الحلاق وعامل خدمة مقيّد بنطاق `/barber`. يخزّن عامل الخدمة الأصول الثابتة وصفحة انقطاع الاتصال فقط؛ صفحات العملاء ونداءات `/api/*` تبقى شبكة فقط. كما يستقبل تنبيهات Web Push للمواعيد الجديدة دون تخزين حمولتها.

لتجربة التثبيت على الجوال، افتح `/barber` من المتصفح بعد تشغيل `npm run dev` أو نسخة الإنتاج، ثم استخدم خيار إضافة التطبيق إلى الشاشة الرئيسية إذا ظهر من المتصفح.

على iPhone يجب إضافة التطبيق إلى الشاشة الرئيسية أولًا ثم تفعيل التنبيهات من داخل نسخة التطبيق المثبّتة. على Android يظهر طلب الإذن مباشرة بعد ضغط الحلاق زر التفعيل.

## النشر على خادم إنتاج

المشروع غير مرتبط بمزوّد استضافة بعينه. أي خادم يوفّر **Node 22** و**PostgreSQL** يكفي: خادم افتراضي (VPS)، حاوية Docker، أو منصة PaaS.

### المتطلبات

- Node 22.22.3 — النسخة مثبّتة في `.nvmrc` و`.node-version` وحقل `engines` في `package.json`.
- PostgreSQL يمكن الوصول إليه عبر `DATABASE_URL`.
- عكس وكيل (Nginx أو Caddy) أمام التطبيق لإنهاء TLS وتمرير ترويسات `X-Forwarded-*`.

### أوامر النشر

```bash
# 1. البناء
npm ci && npm run prisma:generate && npm run build

# 2. أول نشر فقط: تهيئة الباقات والمؤسسة الافتراضية وحساب المنصّة
npm run prisma:seed

# 3. التشغيل — يطبّق الهجرات قبل استقبال أي طلب
npm run start:prod
```

يستمع التطبيق على المنفذ من متغيّر `PORT` (افتراضيًا 3000).

> **لماذا `start:prod` لا `start`:** بدء الخدمة قبل تطبيق الهجرات يعني أن أول طلب يصل إلى مخطط قاعدة قديم. الأمر يجمع `prisma migrate deploy` مع `next start` في خطوة واحدة.

### متغيرات البيئة

انسخ `.env.example` إلى `.env` واضبط القيم. الحرجة منها:

| المتغيّر | لماذا يهم |
|---|---|
| `DATABASE_URL` | الاتصال بقاعدة الإنتاج |
| `DATABASE_CONNECTION_LIMIT` و`DATABASE_POOL_TIMEOUT` | حد اتصالات كل نسخة بالتجميع الانتظاري بدل استنزاف PostgreSQL |
| `REDIS_URL` | كاش قصير وعدادات Rate Limit ذرية مشتركة، مثل `redis://127.0.0.1:6379` |
| `REDIS_REQUIRED=true` | يجعل فحص الجاهزية يفشل إذا توقف Redis في الإنتاج |
| `REQUIRE_EXPLICIT_SEED_CREDENTIALS=true` | يجعل الـ seed يفشل بدل زرع كلمات مرور تجريبية معروفة |
| `SEED_ADMIN_*` و`SEED_BARBER_*` و`PLATFORM_ADMIN_*` | بيانات اعتماد حقيقية — اجعلها أسرارًا على الخادم ولا تودعها في Git |
| `ALLOWED_ORIGINS` | فحص Origin ضد CSRF على الطلبات المغيّرة للحالة |
| `MAINTENANCE_TOKEN` | سرّ مشترك لمسار الصيانة المجدول |
| `PUBLIC_APP_URL` | بناء رابط رمز QR لتسجيل العملاء في برنامج الولاء |
| `ROOT_DOMAIN` | نطاقات المؤسسات الفرعية — **اتركه فارغًا** إن كنت تخدم نطاقًا واحدًا |
| `WEB_PUSH_PUBLIC_KEY` و`WEB_PUSH_PRIVATE_KEY` | زوج VAPID ثابت لتنبيهات حجوزات الحلاق — أنشئه مرة واحدة بـ `npx web-push generate-vapid-keys` |
| `WEB_PUSH_SUBJECT` | جهة التواصل الرسمية لخدمة Push: `mailto:support@xmansx.com` |
| `PUBLIC_GOOGLE_SITE_VERIFICATION` و`PUBLIC_BING_SITE_VERIFICATION` و`PUBLIC_YANDEX_SITE_VERIFICATION` | إثبات ملكية الموقع في أدوات مشرفي المواقع — **اضبطها وقت البناء أيضًا** |
| `INDEXNOW_KEY` | إبلاغ فوري لمحركات البحث بتحديث الصفحات (اتركه فارغًا لتعطيله) |

> **تحذير `ROOT_DOMAIN`:** قيمة خاطئة تجعل النظام يفسّر جزءًا من اسم المضيف كنطاق فرعي لمؤسسة، فتفشل **كل** عمليات الدخول برسالة «لم نجد مؤسسة بهذا المعرّف». على مضيف من ثلاثة مقاطع مثل `app.example.com` اتركه فارغًا أو اضبطه على المضيف الكامل. لتفعيل نطاقات المؤسسات (`owner.tanal.com`) اضبطه على النطاق الجذر ووجّه wildcard DNS لـ `*.tanal.com`.

### فحص الصحة

`GET /api/health` مسار حياة خفيف يعيد `{"status":"ok"}`. استخدم
`GET /api/health/readiness` لموازن الحمل؛ فهو يتحقق من PostgreSQL وRedis ويعيد `503`
عند عدم الجاهزية. لا توجّه حركة جديدة إلى نسخة تفشل في هذا المسار.

### نشر إصدار على خادم الإنتاج القائم

خادم الإنتاج الحالي يشغّل `tanal.service` من `/srv/tanal/app`، وأسراره في
`/etc/tanal/tanal.env` خارج مجلد التطبيق. المجلد **ليس مستودع git**؛ الإصدار
يُسلَّم كأرشيف ويُبدَّل مجلده بالكامل، ويُقرأ إصداره الحالي من `.release-sha`.

```bash
# من جهاز التطوير
git archive --format=tar.gz -o /tmp/tanal-<sha>.tar.gz <sha>
scp /tmp/tanal-<sha>.tar.gz root@<host>:/tmp/

# على الخادم
/srv/tanal/app/deploy/release.sh /tmp/tanal-<sha>.tar.gz <sha>
```

`deploy/release.sh` يأخذ نسخة احتياطية من قاعدة البيانات، ثم يبني الإصدار الجديد
في مجلد مستقل **والتطبيق الحالي ما زال يخدم الطلبات**، فيقتصر التوقف على لحظة
التبديل وإعادة التشغيل. وإن فشل فحص الصحة بعده يرجع تلقائيًا للإصدار السابق.

النسخة السابقة للنشر تمر إلزاميًا عبر `tanal-backup.service`: custom-format،
فحص `pg_restore --list`، تشفير age، وSHA-256. لا ينشئ سكربت الإصدار dump خامًا.
كما يرفض الإصدار قبل أي تغيير إذا كانت إعدادات Session/OTP/Redis/Email/WebAuthn
أو Node 22.22.3 غير مكتملة. يتم البناء أولًا، ثم يطبّق `ExecStartPre` migrations
بعد تبديل المجلد وقبل قبول الطلبات؛ migrations الهادمة ممنوعة لأنها لا تُعكس
بمجرد الرجوع إلى كود الإصدار السابق.

> **لا تضبط `NODE_ENV=production` قبل `npm ci`.** عندها يتخطّى npm حزم التطوير
> فيسقط TypeScript وTailwind ويفشل البناء. والأهم أن `ExecStartPre` في وحدة
> systemd يشغّل `prisma migrate deploy` وحزمة `prisma` نفسها devDependency —
> أي أن تقليم حزم التطوير بعد البناء يمنع الخدمة من الإقلاع أصلًا.

### طبقة الإنتاج المقترحة

توجد ملفات جاهزة تحت `deploy/` لـ systemd وNginx وRedis. ثبّت شهادة Cloudflare
Origin CA في المسارات المذكورة داخل ملف Nginx، ثم اختبر `nginx -t` قبل إعادة التحميل.
ملف `cloudflare-realip.conf` يستعيد IP العميل الحقيقي من `CF-Connecting-IP`، ويجب تحديث
قائمة العناوين عند إعلان Cloudflare عن تغييرها.

لا تسمح بالاتصال إلى المنفذين `3000` أو `6379` من الإنترنت. اسمح لـ80/443 فقط من
عناوين Cloudflare على جدار الخادم، مع إبقاء SSH محميًا بالمفاتيح ومن عنوان إداري موثوق.
بعد تثبيت شهادة Origin CA والتحقق منها فعّل Cloudflare SSL بوضع **Full (strict)**.

الكاش العام للصفحة الرئيسية يعاد توليده كل خمس دقائق، بينما مسارات `/api/*` خاصة
وموسومة `no-store`. بيانات اللوحة الحساسة تستخدم كاش Redis قصيرًا ومفصولًا حسب المؤسسة
والفرع، لذلك لا ينبغي إنشاء قاعدة Cloudflare من نوع Cache Everything لكل الموقع.

### اختبار الضغط

ابدأ على بيئة اختبار أو محليًا، وراقب CPU والذاكرة واتصالات PostgreSQL ونسبة أخطاء 5xx:

```bash
LOAD_TEST_CONCURRENCY=50 LOAD_TEST_DURATION_SECONDS=60 npm run loadtest
```

يرفض السكربت استهداف عنوان خارجي افتراضيًا. لاستخدام بيئة اختبار بعيدة مصرّح بها:

```bash
ALLOW_REMOTE_LOAD_TEST=true LOAD_TEST_URL=https://staging.example.com/api/health npm run loadtest
```

مسار الصحة يختبر الوكيل وNode فقط؛ كرر الاختبار على سيناريوهات قراءة واقعية في بيئة
اختبار ببيانات ممثلة، ولا تنفذ ضغطًا على الإنتاج أثناء استقبال العملاء.

### الصيانة الدورية

حذف الجلسات المنتهية وعدادات المحاولات وسجلات التدقيق الأقدم من مدة الاحتفاظ. شغّلها من cron يوميًا:

```bash
npm run maintenance:cleanup
```

أو عبر طلب `POST /api/maintenance/cleanup` مع ترويسة `x-maintenance-token` تحمل قيمة `MAINTENANCE_TOKEN`.

الوحدتان الجاهزتان لذلك `deploy/systemd/tanal-maintenance.{service,timer}`:

```bash
install -m 0644 deploy/systemd/tanal-maintenance.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now tanal-maintenance.timer
```

### مراقبة الجاهزية

المراقب المجاني المرفق يفحص readiness كل دقيقتين، يسجل الفشل كـ`daemon.crit`
في journal، ويرسل عبر Resend تنبيهًا محدودًا بـ`MONITOR_ALERT_COOLDOWN_SECONDS`:

```bash
install -m 0755 deploy/monitor/tanal-healthcheck.sh /srv/tanal/app/deploy/monitor/
install -m 0644 deploy/systemd/tanal-healthcheck.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tanal-healthcheck.timer
systemctl start tanal-healthcheck.service
systemctl status tanal-healthcheck.timer tanal-healthcheck.service
```

يجب أن يحتوي `/etc/tanal/tanal.env` على `MONITOR_ALERT_EMAIL` و`MONITOR_EMAIL_FROM`
من نطاق Resend الموثق. لا تختبر مسار الفشل على Production دون نافذة معتمدة؛ اختبره
أولًا في Staging، ثم راقب وصول الرسالة وظهور الحدث في journal.

> **حالة الإنتاج (11 أغسطس 2026): هذه الوحدة غير مثبّتة على `tanal-prod`،** ولا
> يوجد أي جدول cron بديل لها. أي أن الجلسات المنتهية وعدادات المحاولات وسجلات
> التدقيق **لا تُحذف أبدًا** حاليًا، فمدة الاحتفاظ المعلنة في سياسة الخصوصية غير
> مطبَّقة فعليًا. تثبيتها عملية حذف بيانات، فراجع `RETENTION_*` قبل أول تشغيل.

### النسخ الاحتياطي

الجدولة المشفرة موجودة في `deploy/systemd/tanal-backup.{service,timer}`، وإجراءات
الاستعادة الآمنة في `deploy/backup/README.md`. وجود timer أو artifact وحده لا
يكفي: لا تُغلق بوابة الإطلاق حتى تنجح استعادة أحدث ملف `.dump.age` على قاعدة
منفصلة مع smoke test، وتثبت نسخة off-site ومالك العملية وRPO/RTO.

## فحص قاعدة جديدة من الصفر

عند إضافة migrations جديدة، يمكن التحقق من أن الترتيب يعمل على قاعدة فارغة بدون لمس قاعدة التطوير. أنشئ قاعدة مؤقتة مثل `tanal_loyalty_fresh_check` ثم شغّل الأوامر مع `DATABASE_URL` يشير إليها:

```powershell
createdb -h localhost -p 55432 -U tanal_user tanal_loyalty_fresh_check
$env:DATABASE_URL="postgresql://tanal_user:tanal_dev_password@localhost:55432/tanal_loyalty_fresh_check?schema=public"
npm run prisma:migrate
npm run prisma:seed
npm run typecheck
npm test
npm run lint
npm run build
npm audit
dropdb -h localhost -p 55432 -U tanal_user tanal_loyalty_fresh_check
```

لا تحفظ رابط قاعدة الفحص داخل `.env`، واستخدمه كمتغير بيئة مؤقت في نافذة الطرفية فقط.

## البريد التشغيلي للعملاء (Resend)

طبقة البريد في `lib/email/resend-email.ts` تستخدم واجهة Resend الثابتة من
الخادم فقط، وتُلزم كل رسالة بمفتاح منع تكرار. يوجد قالب عربي مشترك ورسائل جاهزة
لتأكيد الموعد وإلغائه في `lib/email/customer-email-templates.ts`.

إعدادات الإنتاج المطلوبة:

```env
RESEND_API_KEY="re_..."
EMAIL_FROM="XMANSX | إكس مانس <notifications@xmansx.com>"
EMAIL_REPLY_TO="support@xmansx.com"
EMAIL_PLATFORM_TAG="xmansx"
RESEND_INBOUND_API_KEY="re_..."
RESEND_WEBHOOK_SECRET="whsec_..."
SUPPORT_EMAIL_ADDRESS="support@xmansx.com"
INBOUND_EMAIL_REQUIRED="true"
EMAIL_REQUIRED="true"
CUSTOMER_OTP_PEPPER="قيمة-عشوائية-قوية-خاصة-ببيئة-الإنتاج"
```

- أنشئ مفتاحًا مستقلًا باسم XMANSX وبصلاحية `sending_access` فقط؛ لا تعِد استخدام
  مفتاح مشروع آخر.
- تحقّق من نطاق `xmansx.com` في Resend قبل الإرسال لعملاء حقيقيين، ليظهر
  عنوان المرسل الرسمي `notifications@xmansx.com` للمستلم.
- يضاف وسم `platform=xmansx` تلقائيًا لكل رسالة لفصل تقارير المنصة عن بقية
  المنصات داخل فريق Resend المشترك.
- مفتاح `RESEND_INBOUND_API_KEY` مستقل ومخزن على الخادم فقط بصلاحية `full_access`
  لأن Resend لا يسمح لمفتاح `sending_access` باسترجاع محتوى الرسائل والمرفقات.
- سجّل Webhook الإنتاجي على `https://www.xmansx.com/api/webhooks/resend` واختر
  حدث `email.received`، ثم ضع سر التوقيع في `RESEND_WEBHOOK_SECRET`.
- يظهر صندوق البريد لمدير المنصة فقط في `/platform/support`، ويتحقق من توقيع
  كل حدث ويمنع التكرار ولا يعرض HTML الوارد مباشرة.
- جميع طلبات الدعم والشكاوى والخصوصية والفوترة تصل إلى
  `support@xmansx.com`، ويحدد المرسل النوع في عنوان الرسالة لتصنيفها ومتابعتها.
- لا يُعاد المفتاح من أي API ولا يُسجّل في السجلات. مسار
  `GET /api/platform/email/test` يعرض جاهزية الإعداد فقط، و`POST` يرسل اختبارًا
  بعد مصادقة مدير المنصة.
- عند `EMAIL_REQUIRED=true` يفشل فحص الجاهزية إذا غاب المفتاح أو عنوان المرسل،
  فيمنع نشر إصدار يبدو سليمًا وهو غير قادر على مراسلة العملاء.
- استخدم `CUSTOMER_OTP_PEPPER` مستقلًا وقويًا لتوقيع رموز تحقق العملاء؛ تدويره
  يبطل الرموز الحية فقط، وعمرها عشر دقائق.

## حسابات seed التجريبية

- مدير النظام:
  - البريد: `admin@tanal.local`
  - الجوال: `0500000001`
  - كلمة المرور: `Admin@12345`
- الحلاق:
  - الجوال: `0500000002`
  - رمز الدخول: `Tanal@123`
- مشرف الفرع (مسند للصالون الافتراضي):
  - البريد: `supervisor@tanal.local`
  - الجوال: `0500000003`
  - كلمة المرور: `Super@12345`

## روابط الصفحات الأساسية

- واجهة الحلاق: `/barber/login`
- دخول المدير: `/dashboard/login`
- الداشبورد: `/dashboard`
- التقارير: `/dashboard/reports`
- جلسات الصندوق: `/dashboard/daily-close`
- واتساب اليدوي: `/dashboard/whatsapp`
- الإعدادات: `/dashboard/settings`

## الظهور في محركات البحث (SEO)

كل ما يقرأه المحرك مولَّد من الكود: `app/robots.ts` و`app/sitemap.ts` و`lib/seo.ts`.
لا ملفات ثابتة تُحدَّث يدويًا وتتباعد عن الموقع.

**ما يعمل تلقائيًا بلا إعداد:** رابط أساسي (canonical) لكل صفحة عامة مبني على
`PUBLIC_APP_URL` لا على مضيف الطلب، بطاقة مشاركة بصورة لكل صفحة، بيانات منظّمة
(`Organization` و`WebSite` و`SoftwareApplication` بأسعار الباقات الفعلية و`FAQPage`
ومسار تنقّل للوثائق القانونية)، و`noindex` على كل ما هو خلف تسجيل دخول أو خلف رمز
في الرابط.

**خطوات التفعيل بعد أول نشر** — بدونها لن تظهر النتائج مهما كان الكود سليمًا:

1. **اضبط `PUBLIC_APP_URL` وقت البناء** على النطاق النهائي. الصفحات العامة
   مُصيَّرة مسبقًا، فضبطه وقت التشغيل وحده يترك `localhost` في الروابط المدمجة.
2. **Google Search Console** — أضف النطاق، انسخ رمز «وسم HTML» إلى
   `PUBLIC_GOOGLE_SITE_VERIFICATION`، أعد البناء والنشر، ثم تحقّق. بعدها أرسل
   `https://<domain>/sitemap.xml` واطلب فهرسة الصفحة الرئيسية من «فحص عنوان URL».
3. **Bing Webmaster Tools** — `PUBLIC_BING_SITE_VERIFICATION` بالطريقة نفسها
   (يغطي Bing وYahoo وDuckDuckGo وECOSIA وواجهات بحث الذكاء الاصطناعي المبنية عليه).
4. **Yandex Webmaster** — `PUBLIC_YANDEX_SITE_VERIFICATION` إن كان السوق الروسي مهمًا.
5. **IndexNow** — ولّد رمزًا واضبطه في `INDEXNOW_KEY`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
   ```
   تأكّد أن `https://<domain>/indexnow/<KEY>.txt` يعيد الرمز، ثم بعد كل نشرٍ يغيّر
   محتوى صفحة عامة:
   ```bash
   npm run seo:indexnow                      # كل الصفحات العامة
   npm run seo:indexnow -- /terms /privacy   # صفحات بعينها
   ```
6. **تحقّق من البيانات المنظّمة** على
   [validator.schema.org](https://validator.schema.org/) و«اختبار النتائج الغنية» من Google.

> **الملكية والنطاقات الفرعية:** كل صفحة عامة تُقدَّم أيضًا من نطاق كل مستأجر
> (`owner.<root>`)، لكن رابطها الأساسي يشير دائمًا إلى النطاق الرئيسي فتُجمَّع
> النسخ ولا يُوزَّع وزن النطاق. أثبت ملكية **النطاق الجذر** في أدوات المشرفين
> (خاصية Domain لا URL prefix) ليشمل التحقق النطاقات الفرعية كلها.

> **ما لا يفعله الكود:** الترتيب يحتاج محتوى وروابط خارجية. الأسرع أثرًا: نشاط
> تجاري على خرائط Google (Business Profile) باسم مطابق، وذكر النطاق في أدلة
> برمجيات السعودية، ومقالات تشرح المشكلات التي تحلّها المنصّة. البنية التقنية
> هنا تضمن أن يُفهرس ما تنشره ويُعرض جيدًا — لا أن يوجد ما يُفهرَس.

## منصّة SaaS متعددة المستأجرين

النظام منصّة SaaS تخدم عدة ملّاك (مؤسسات)، ولكل مؤسسة عدة صالونات (فروع).

- **الهرمية**: مؤسسة (`Organization`) ← صالونات (`Salon`) ← حلاقون/عملاء/زيارات/صندوق/ولاء/حملات/واتساب.
- **العزل**: كل بيانات المستأجر مقيّدة بـ `organizationId` على مستوى التطبيق (مع فحوص ملكية على مسارات `[id]`)، والعملاء والولاء مشتركان على مستوى المؤسسة بين فروعها.
- **التوجيه بالنطاق الفرعي**: `ROOT_DOMAIN` (مثال `tanal.com`) يفعّل نطاقات فرعية لكل مؤسسة: `owner.tanal.com`. الدخول يحلّ المؤسسة من النطاق الفرعي. محليًا (بلا نطاق فرعي) يُستخدم المؤسسة الافتراضية. **يتطلب الإنتاج إعداد wildcard DNS** (`*.tanal.com`) عند مزوّد النطاق وضبط `ROOT_DOMAIN`.
- **التسجيل الذاتي**: `/signup` ينشئ مؤسسة + أول صالون + حساب المالك (دور `OWNER`) ويسجّل الدخول تلقائيًا.
- **المالك**: يدير الفروع من `/dashboard/salons`، ويبدّل الصالون النشط من الشريط الجانبي.
- **حدود الباقة**: عدد الصالونات/الحلاقين محكوم بباقة المؤسسة.

### منصّة السوبر-آدمن

- **الرابط**: `platform.<root>` في الإنتاج (نطاق فرعي محجوز)، ومحليًا `/platform/login`.
- **الصلاحيات**: إدارة كل المؤسسات (إيقاف/تفعيل، إسناد باقة) من `/platform`، والباقات وحدودها من `/platform/plans`.
- **الإيقاف**: تعليق مؤسسة يقطع وصول كل مستخدميها فورًا.
- **الحساب**: يُهيّأ من `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`. إذا لم تُضبط هذه القيم، يستخدم seed بيانات `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` نفسها. **اضبطهما صراحةً في الإنتاج** حتى لا يشترك حساب المنصّة مع حساب المؤسسة في كلمة المرور.

> ملاحظة إحكام: مفاتيح المستأجر (`organizationId`/`salonId`) تُضبط في كل عملية كتابة ومُثبّتة باختبارات العزل، لكنها تبقى اختيارية على مستوى المخطط (nullable) حاليًا؛ تحويلها إلى `NOT NULL` تحسين دفاعي اختياري يتطلب تحديث بيانات الاختبارات.

## ملاحظات أمان وتشغيل

- لا ترفع `.env` إلى Git، واستخدم `.env.example` فقط كمرجع.
- لا ترفع `.postgres-data` أو ملفات logs أو build output.
- Cookies مصممة لتكون `httpOnly` و `sameSite`، وتتحول إلى `secure` في production.
- لا يوجد إرسال واتساب تلقائي. النظام يجهز روابط `wa.me` فقط، والمدير يرسل يدويًا.
- لا يوجد WhatsApp API أو أي إرسال تلقائي أو bulk sender.
- لا يوجد service worker يخزن صفحات محمية offline في هذه المرحلة.
- الصالون يعمل 24 ساعة؛ السماح بتسجيل الزيارة مرتبط بوجود جلسة صندوق مفتوحة للحلاق، وليس بتاريخ اليوم أو جدول دوام.
