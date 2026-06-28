# واجهة تنال

واجهة تنال للحلاقة الرجالية: نظام تشغيل وولاء فاخر لصالون حلاقة رجالي، مبني كـ Next.js Web/PWA بواجهة عربية RTL، وتطبيق حلاق Mobile-first، ولوحة مدير منفصلة لإدارة الصندوق والعملاء والزيارات والتقارير.

## المتطلبات

- Node.js LTS فقط: استخدم النسخة المحددة في `.nvmrc` وهي `22.22.3`.
- npm 10 أو أحدث.
- PostgreSQL للتطوير والإنتاج.

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

يحتوي المشروع على `public/manifest.webmanifest` باسم "واجهة تنال" وأيقونات محلية داخل `public/icons`. لا يوجد service worker أو cache offline للصفحات المحمية في هذه المرحلة، لتجنب تخزين بيانات العملاء أو الجلسات محليًا.

لتجربة التثبيت على الجوال، افتح `/barber` من المتصفح بعد تشغيل `npm run dev` أو نسخة الإنتاج، ثم استخدم خيار إضافة التطبيق إلى الشاشة الرئيسية إذا ظهر من المتصفح.

## النشر على Render

المشروع يحتوي على ملف `render.yaml` في جذر المستودع لإنشاء:

- Web Service باسم `tanal-loyalty-web`.
- PostgreSQL باسم `tanal-loyalty-db`.
- Health check على `/api/health`.
- إعداد مجاني مناسب لخطة Render Free بدون Cron Job مدفوع.
- تشغيل الهجرات والـ seed قبل بدء الخدمة عبر:

```bash
npm run prisma:deploy && npm run prisma:seed
```

خطوات النشر:

1. ادفع آخر نسخة إلى GitHub.
2. من Render Dashboard اختر `New > Blueprint`.
3. اربط المستودع:

```txt
azzam1122112-dot/Tanal-Barbershop-Interface
```

4. اختر الفرع `main` واترك مسار Blueprint الافتراضي `render.yaml`.
5. عند طلب متغيرات البيئة السرية، أدخل قيم إنتاج حقيقية:

```txt
SEED_ADMIN_PHONE
SEED_ADMIN_EMAIL
SEED_ADMIN_PASSWORD
SEED_BARBER_PHONE
SEED_BARBER_PIN
```

6. لا تستخدم كلمات المرور التجريبية في Render. الملف يفعّل:

```txt
REQUIRE_EXPLICIT_SEED_CREDENTIALS=true
```

لذلك سيفشل الـ seed في الإنتاج إذا لم يتم إدخال بيانات seed صريحة وآمنة.

أوامر Render المستخدمة:

```bash
# Build Command
npm ci && npm run prisma:generate && npm run build

# Pre-Deploy Command
npm run prisma:deploy && npm run prisma:seed

# Start Command
npm run start:render
```

ملاحظات:

- `DATABASE_URL` يأتي من PostgreSQL الذي ينشئه Render، ولا يوضع يدويًا داخل Git.
- `NODE_VERSION=22.22.3` مضبوط في Blueprint، ويوجد أيضًا `.nvmrc` و`.node-version`.
- خطة الخدمة وقاعدة البيانات في `render.yaml` مضبوطة على `free`. قاعدة PostgreSQL المجانية على Render محدودة وتنتهي بعد 30 يومًا، لذلك يلزم ترقية قاعدة البيانات لاحقًا إذا أصبحت بيانات الإنتاج مهمة.
- لا يوجد Cron Job في Blueprint المجاني؛ يمكن تشغيل الصيانة يدويًا عند الحاجة عبر:

```bash
npm run maintenance:cleanup
```

- على باقة Render المجانية **اضبط `ROOT_DOMAIN` على المضيف الكامل** للخدمة (مثل `tanal-loyalty-web.onrender.com`). هذا ضروري: مضيف onrender.com يتكوّن من ثلاثة مقاطع، فإن تُرك `ROOT_DOMAIN` فارغًا سيُفسَّر اسم الخدمة (`tanal-loyalty-web`) خطأً كنطاق فرعي لمؤسسة وتفشل **كل** عمليات الدخول برسالة «لم نجد مؤسسة بهذا المعرّف». مع ضبطه على المضيف الكامل، يُحلّ المستأجر من البريد/الجوال على نطاق واحد. لتفعيل نطاقات المؤسسات الفرعية لاحقًا، اضبط `ROOT_DOMAIN=tanal.com`، ثم أضف custom domain wildcard مثل `*.tanal.com` ووجّه DNS wildcard من مزود النطاق إلى Render.

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

## منصّة SaaS متعددة المستأجرين

النظام منصّة SaaS تخدم عدة ملّاك (مؤسسات)، ولكل مؤسسة عدة صالونات (فروع).

- **الهرمية**: مؤسسة (`Organization`) ← صالونات (`Salon`) ← حلاقون/عملاء/زيارات/صندوق/ولاء/حملات/واتساب.
- **العزل**: كل بيانات المستأجر مقيّدة بـ `organizationId` على مستوى التطبيق (مع فحوص ملكية على مسارات `[id]`)، والعملاء والولاء مشتركان على مستوى المؤسسة بين فروعها.
- **التوجيه بالنطاق الفرعي**: `ROOT_DOMAIN` (مثال `tanal.com`) يفعّل نطاقات فرعية لكل مؤسسة: `owner.tanal.com`. الدخول يحلّ المؤسسة من النطاق الفرعي. محليًا (بلا نطاق فرعي) يُستخدم المؤسسة الافتراضية. **يتطلب الإنتاج إعداد wildcard DNS** (`*.tanal.com`) على Render وضبط `ROOT_DOMAIN`.
- **التسجيل الذاتي**: `/signup` ينشئ مؤسسة + أول صالون + حساب المالك (دور `OWNER`) ويسجّل الدخول تلقائيًا.
- **المالك**: يدير الفروع من `/dashboard/salons`، ويبدّل الصالون النشط من الشريط الجانبي.
- **حدود الباقة**: عدد الصالونات/الحلاقين محكوم بباقة المؤسسة.

### منصّة السوبر-آدمن

- **الرابط**: `platform.<root>` في الإنتاج (نطاق فرعي محجوز)، ومحليًا `/platform/login`.
- **الصلاحيات**: إدارة كل المؤسسات (إيقاف/تفعيل، إسناد باقة) من `/platform`، والباقات وحدودها من `/platform/plans`.
- **الإيقاف**: تعليق مؤسسة يقطع وصول كل مستخدميها فورًا.
- **الحساب**: يُهيّأ من `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`. إذا لم تُضبط هذه القيم، يستخدم seed بيانات `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` نفسها لتقليل متطلبات Render Free.

> ملاحظة إحكام: مفاتيح المستأجر (`organizationId`/`salonId`) تُضبط في كل عملية كتابة ومُثبّتة باختبارات العزل، لكنها تبقى اختيارية على مستوى المخطط (nullable) حاليًا؛ تحويلها إلى `NOT NULL` تحسين دفاعي اختياري يتطلب تحديث بيانات الاختبارات.

## ملاحظات أمان وتشغيل

- لا ترفع `.env` إلى Git، واستخدم `.env.example` فقط كمرجع.
- لا ترفع `.postgres-data` أو ملفات logs أو build output.
- Cookies مصممة لتكون `httpOnly` و `sameSite`، وتتحول إلى `secure` في production.
- لا يوجد إرسال واتساب تلقائي. النظام يجهز روابط `wa.me` فقط، والمدير يرسل يدويًا.
- لا يوجد WhatsApp API أو أي إرسال تلقائي أو bulk sender.
- لا يوجد service worker يخزن صفحات محمية offline في هذه المرحلة.
- الصالون يعمل 24 ساعة؛ السماح بتسجيل الزيارة مرتبط بوجود جلسة صندوق مفتوحة للحلاق، وليس بتاريخ اليوم أو جدول دوام.
