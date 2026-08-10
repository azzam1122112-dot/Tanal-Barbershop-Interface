# SECURITY AUDIT REPORT — XMANSX SaaS

> **Phase 2 remediation addendum — 2026-08-10:** هذا الملف يحتفظ بالـbaseline قبل الإصلاح (36/100) لأغراض التتبع. عولجت لاحقًا جميع Critical/High المكتشفة، بما فيها MFA لمدير المنصة، القيود المركبة لعزل tenant، السعر server-side، والنسخ/الاستعادة المحلية. التقرير الحاكم بعد الإصلاح هو `SECURITY_FINAL_REPORT.md` بدرجة 92/100. لا تُقرأ النتائج أدناه كحالة حالية.

> تاريخ المراجعة الأولية: 2026-08-10
> النطاق: الشيفرة المحلية، إعدادات النشر، مخطط قاعدة البيانات، الاعتماديات، وسجل Git.
> المنهج: مراجعة ساكنة واختبارات بناء آمنة فقط. لم تُرسل رسائل أو Push أو WhatsApp، ولم تُنفذ دفعات أو Webhooks أو اختبارات إغراق، ولم تُقرأ أو تُطبع قيم الأسرار. لم تُستخدم بيانات إنتاج أو تُحذف بيانات.

## Executive Summary

**Security Score: 36/100 (قبل الإصلاح)**

| المستوى | العدد |
| --- | ---: |
| Critical | 7 |
| High | 12 |
| Medium | 12 |
| Low | 5 |
| Info | 8 |

**القرار الأولي: 🔴 غير آمن للإطلاق التجاري — NO-GO.**

السبب الرئيس هو وجود مسارات عملية تسمح بخلط بيانات أو مراجع بين منشآت مختلفة، إضافة إلى إمكانية مدير منشأة الاستيلاء على حساب المالك، وتشغيل تنظيف عام لبيانات جميع المنشآت. العزل الحالي على مستوى التطبيق فقط؛ أعمدة `organizationId` قابلة للقيمة الفارغة في نماذج أساسية ولا توجد سياسات PostgreSQL RLS أو قيود مركبة تمنع العلاقات العابرة للمنشآت.

### Architecture Inventory

| العنصر | النتيجة |
| --- | --- |
| Language / Runtime | TypeScript، Node.js، npm |
| Backend | Next.js 15 App Router / Route Handlers، Prisma ORM 6 |
| Frontend | React 19، Next.js، PWA Service Worker |
| Database | PostgreSQL |
| Authentication | جلسات opaque عشوائية؛ SHA-256 في DB؛ Cookies `HttpOnly`, `SameSite=Lax`, و`Secure` في الإنتاج |
| Passwords | bcrypt cost 12 |
| JWT / OAuth / MFA / OTP | غير مستخدمة؛ MFA غير متوفر |
| Cache / Rate limit | Redis اختياري مع fallback إلى PostgreSQL |
| WebSockets / Workers | غير موجودة |
| Cron | نقطة صيانة HTTP وسكربت محلي |
| Storage / Uploads | لا توجد واجهة رفع ملفات في النطاق الحالي |
| Payments | تحويل/نقد يدوي؛ لا توجد بوابة دفع أو Webhook دفع فعلي |
| Messaging | WhatsApp عبر روابط `wa.me`، وWeb Push خارجي |
| CI/CD | GitHub Actions؛ لا يوجد Dockerfile |
| Edge / Proxy | Nginx + Cloudflare موثقان في `deploy/` |
| Secrets | Environment variables؛ `.env` محلي متجاهل من Git |

### API Inventory

تم حصر **124 عملية API** تقريبًا: 50 GET، 49 POST، 20 PATCH، 7 DELETE، و1 PUT. المسارات العامة المتعمدة تقتصر على تسجيل الدخول/الخروج/التسجيل، readiness، بوابة العميل ذات الرابط السري، والانضمام العام للولاء. لم يظهر endpoint إداري بلا guard، لكن عدة guards أو استعلامات بعد الـguard لا تطبق الملكية والعزل بصورة صحيحة.

## Threat Model

### Assets

حسابات المستخدمين والمنشآت، الجلسات، بيانات العملاء وأرقامهم وحجوزاتهم وملاحظاتهم، الموظفون والفروع والخدمات، النقاط والمكافآت والحملات، الإيرادات والفواتير والعمولات والاشتراكات، مفاتيح API وVAPID وقاعدة البيانات وRedis، روابط بوابة العملاء، اشتراكات Push، وسجلات التدقيق.

### Actors and Trust Boundaries

- مهاجم غير مسجل، عميل يحمل رابط بوابة، حلاق، مشرف فرع، مدير، مالك، مدير منصة، ومشغل البنية التحتية.
- الحدود: الإنترنت → Nginx/Cloudflare → Next middleware/routes؛ Cookie → جدول Session؛ سياق المنشأة → Prisma/PostgreSQL؛ Redis؛ Web Push؛ رابط بوابة العميل؛ CI وسلسلة التوريد.
- التهديدات الأعلى: BOLA/IDOR، تصعيد الصلاحية، جلسات قديمة الصلاحية، حقن معرف تابع لمنشأة أخرى، SSRF، خلط Cache/Jobs، تزوير الموافقة التسويقية، سباقات الحجز/المخزون/الحصص، وتسريب الأسرار أو PII في السجلات.

## Critical Findings

### XM-C-01 — Cross-tenant campaigns in visit preview/confirmation

- **Severity:** Critical
- **CVSS:** 9.1 (AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N)
- **File:** `lib/campaigns/campaign-eligibility.ts:28-79`; `lib/visits/visit-service.ts:155-166,294-303`
- **Endpoint:** `POST /api/barber/visits/preview`, `POST /api/barber/visits/confirm`
- **Description:** استعلام الحملات النشطة لا يقيد `organizationId`، والتحقق من `campaignId` يستخدم `findUnique({id})` فقط.
- **Attack scenario:** حلاق في المنشأة A يعاين حملات B أو يرسل معرف حملة B لتطبيق خصمها على زيارة في A.
- **Business impact:** تسريب أسماء/أوصاف العروض وفساد مالي وسجل redemption عابر للمنشآت.
- **Evidence:** الاستعلام يعتمد على `id` أو حالة الحملة دون شرط المنشأة؛ لم يُستخدم أي معرف حقيقي في الدليل.
- **Recommended fix:** تمرير `organizationId` إلزاميًا إلى دوال الأهلية وربطه بكل الاستعلامات، مع اختبار منشأتين.

### XM-C-02 — Cross-tenant reward rule selection

- **Severity:** Critical
- **CVSS:** 9.1
- **File:** `lib/visits/visit-service.ts:284-306`
- **Endpoint:** `POST /api/barber/visits/confirm`
- **Description:** يتم جلب قاعدة المكافأة بواسطة `id` فقط.
- **Attack scenario:** مستخدم A يحقن `rewardRuleId` تابعًا لـB ويستهلك خصمًا أو ينشئ مرجعًا عابرًا للمنشآت.
- **Business impact:** تخفيض غير مصرح، فساد نقاط وعلاقات مالية، وكسر عزل العملاء.
- **Evidence:** `rewardRule.findUnique({ where: { id } })` بلا `organizationId`.
- **Recommended fix:** `findFirst({id, organizationId, isActive:true})` ثم رفض غير المملوك.

### XM-C-03 — Cross-tenant WhatsApp campaign/reward data

- **Severity:** Critical
- **CVSS:** 8.7
- **File:** `lib/whatsapp/whatsapp-service.ts:436-455,622-626`
- **Endpoint:** إنشاء جمهور/رسائل WhatsApp من لوحة المنشأة
- **Description:** جلب الحملة وأفضل مكافأة لا يقيد المنشأة.
- **Attack scenario:** مدير A يستخدم معرف حملة B، أو يحصل العميل في A على نص خصم مشتق من قاعدة B.
- **Business impact:** كشف منطق عروض المنافس، رسائل وأسعار خاطئة، ومخاطر امتثال.
- **Evidence:** `campaign.findUnique({id})` و`rewardRule.findFirst(...)` بلا tenant predicate.
- **Recommended fix:** جعل سياق المنشأة required في طبقة الخدمة واختبار عدم ظهور بيانات B.

### XM-C-04 — Expense relation injection across tenants

- **Severity:** Critical
- **CVSS:** 9.1
- **File:** `lib/expenses/expense-service.ts:42-74`
- **Endpoint:** `POST /api/dashboard/expenses`
- **Description:** يقبل `barberId`، ثم يبحث عن جلسة نقدية مفتوحة بالحلاق والحالة فقط، دون المنشأة والفرع.
- **Attack scenario:** مدير A يرسل معرف حلاق B فينشئ مصروف A مرتبطًا بحلاق/جلسة B ويسترجع اسمه في الرد والتقارير.
- **Business impact:** تسريب بيانات موظف، تلويث الصندوق والتقارير، وكسر سلامة العلاقات.
- **Evidence:** شروط الاستعلام لا تحتوي `organizationId` أو `salonId` في المسار المتأثر.
- **Recommended fix:** تحقق ملكية الحلاق والجلسة بالمنشأة والفرع داخل transaction قبل الإنشاء.

### XM-C-05 — Tenant admin can trigger global destructive maintenance

- **Severity:** Critical
- **CVSS:** 9.6 (AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:H/A:H)
- **File:** `app/api/maintenance/cleanup/route.ts:17-34`; `lib/maintenance/cleanup.ts:27-54`
- **Endpoint:** `POST /api/maintenance/cleanup`
- **Description:** عند غياب maintenance token يسمح guard مدير المنشأة بتنفيذ تنظيف عام غير مقيد بالمنشأة.
- **Attack scenario:** مدير أي صالون يستدعي المسار فيحذف جلسات وسجلات تدقيق ورسائل قديمة تخص جميع العملاء.
- **Business impact:** فقد أدلة التدقيق وبيانات تشغيلية وتعطيل واسع عابر للمنشآت.
- **Evidence:** عمليات `deleteMany` عامة بعد قبول `requireAdminApi`.
- **Recommended fix:** السماح فقط بتوقيع cron صحيح أو جلسة Platform Admin، وعدم قبول أدوار المنشأة.

### XM-C-06 — ADMIN can take over OWNER account

- **Severity:** Critical
- **CVSS:** 9.4
- **File:** `app/api/dashboard/staff/[id]/route.ts:23-116`
- **Endpoint:** `PATCH /api/dashboard/staff/:id`
- **Description:** مسار التعديل يمنع حذف المالك لاحقًا لكنه لا يمنع تعديل حساب OWNER؛ يستطيع ADMIN تغيير كلمة المرور والبريد والحالة/الدور.
- **Attack scenario:** مدير عادي يعيد تعيين كلمة مرور المالك ثم يدخل بحسابه أو يعطله.
- **Business impact:** استيلاء كامل على المنشأة والبيانات والفوترة.
- **Evidence:** حماية `before.role === "OWNER"` موجودة في DELETE فقط، لا PATCH.
- **Recommended fix:** حظر تعديل OWNER من مسار إدارة الموظفين، وتوفير مسار ذاتي منفصل بإعادة تحقق قوية.

### XM-C-07 — Cross-tenant push subscription deletion

- **Severity:** Critical (وفق سياسة المشروع: أي أثر عابر للمنشآت Critical)
- **CVSS:** 8.1
- **File:** `lib/push/barber-push.ts:49-57`
- **Endpoint:** `POST /api/barber/push`
- **Description:** حفظ اشتراك جديد يحذف أي سجل يطابق `sessionId OR endpoint` عالميًا.
- **Attack scenario:** مستخدم يعرف endpoint لمستخدم آخر يسجله في جلسته فيحذف اشتراك الضحية قبل الإنشاء.
- **Business impact:** تعطيل إشعارات مستخدم/منشأة أخرى وإعادة إسناد endpoint.
- **Evidence:** `deleteMany` مع شرط OR غير مقيد بالمستخدم أو المنشأة.
- **Recommended fix:** حذف اشتراك الجلسة الحالية فقط، ورفض تعارض endpoint المملوك لجلسة أخرى دون كشف المالك.

## High Findings

### XM-H-01 — Stale role/salon authorization in sessions

- **Severity/CVSS:** High / 8.8
- **File:** `lib/auth/session.ts:128-182` وعدة مسارات تعديل الموظفين والحلاقين
- **Endpoint:** جميع المسارات المحمية
- **Description:** الصلاحية تعتمد على `session.role` و`activeSalonId` المخزنين؛ تغيير الدور/الفرع/PIN/كلمة المرور لا يبطل كل الجلسات ذات الصلة.
- **Attack scenario:** مدير خُفضت صلاحيته يحتفظ بصلاحياته حتى 8 ساعات، أو حلاق نُقل يستمر في فرعه السابق.
- **Business impact:** تصعيد صلاحية ووصول غير مصرح.
- **Evidence:** الدور والفرع snapshot يُعادان دون مطابقتهما دائمًا مع السجلات الحية.
- **Recommended fix:** اشتقاق الدور/المنشأة/الفرع من السجل الحي وإبطال الجلسات عند تغير عوامل الأمن.

### XM-H-02 — Authenticated SSRF through Web Push endpoint

- **Severity/CVSS:** High / 8.1
- **File:** `app/api/barber/push/route.ts:13-21`; `lib/push/barber-push.ts:147-181`
- **Endpoint:** تسجيل/اختبار Push ومسار إرسال إشعار الموعد
- **Description:** يقبل أي URL صحيح ثم يقوم الخادم بطلبه عبر مكتبة Web Push.
- **Attack scenario:** حلاق يسجل HTTPS URL داخليًا أو metadata endpoint ويحفز الإرسال.
- **Business impact:** مسح شبكة داخلية أو وصول لخدمات غير عامة من الخادم.
- **Evidence:** التحقق `z.string().url()` فقط؛ لم يُرسل أي طلب أثناء المراجعة.
- **Recommended fix:** HTTPS وإتاحة hosts موثوقة لخدمات Push فقط، مع رفض IP/private/reserved targets.

### XM-H-03 — Marketing consent can be bypassed by custom message classification

- **Severity/CVSS:** High / 8.2
- **File:** `lib/whatsapp/whatsapp-service.ts:192-224`
- **Endpoint:** توليد رسالة WhatsApp
- **Description:** النص المخصص يتغلب على جسم قالب transactional بينما التصنيف يبقى مستمدًا من القالب/الطلب.
- **Attack scenario:** عرض تسويقي يوضع كنص مخصص مع قالب POST_VISIT فيمر رغم رفض العميل للتسويق.
- **Business impact:** مخالفة موافقات العملاء وحظر رقم الصالون ومخاطر تنظيمية.
- **Evidence:** اختيار category يسبق `customMessage?.trim() || template.body`.
- **Recommended fix:** أي نص مخصص تسويقي افتراضيًا، ولا تسمح للعميل بتعيين تصنيف موثوق.

### XM-H-04 — Client-controlled visit amount and inconsistent product total

- **Severity/CVSS:** High / 8.1
- **File:** `lib/visits/visit-service.ts:100-184,284-337`
- **Endpoint:** preview/confirm visit
- **Description:** مبلغ الخدمة قادم من العميل رغم وجود أسعار خدمة، وفي التأكيد تُستخدم `input.grossAmount` بدل إجمالي المعاينة الذي يتضمن المنتجات.
- **Attack scenario:** موظف يخفض المبلغ أو يسجل منتجات دون إدخالها في الإيراد/النقاط/VAT.
- **Business impact:** تلاعب مالي وضريبي وعمولات خاطئة.
- **Evidence:** الخدمات المختارة لا تحسب السعر النهائي server-side؛ مسار confirm يتجاهل `preview.grossAmount` في عدة حسابات.
- **Recommended fix:** حساب السعر من DB، وأي override يحتاج صلاحية وسبب وسجل؛ استخدم إجمالي preview الموثوق في confirm.

### XM-H-05 — Appointment double-booking race

- **Severity/CVSS:** High / 7.5
- **File:** `lib/appointments/appointment-service.ts:53-88`
- **Endpoint:** إنشاء موعد
- **Description:** فحص التعارض ثم الإنشاء ليسا في transaction Serializable واحدة.
- **Attack scenario:** طلبان متزامنان يمران من الفحص وينشئان حجزين لنفس الفترة.
- **Business impact:** حجز مزدوج وتعويضات وفقد ثقة.
- **Evidence:** `assertNoOverlap(prisma)` ثم `appointment.create` منفصل.
- **Recommended fix:** transaction Serializable مع retry واختبار تزامن.

### XM-H-06 — Stock update is non-atomic

- **Severity/CVSS:** High / 7.5
- **File:** `lib/products/product-service.ts:167-217`
- **Endpoint:** حركات المخزون وبيع المنتجات
- **Description:** read/calculate/update/movement ليست دائمًا ضمن transaction عند الاستدعاء من لوحة التحكم.
- **Attack scenario:** طلبان متزامنان يفقد أحدهما تحديث الآخر أو ينتجان حركة لا تطابق الرصيد.
- **Business impact:** مخزون سالب/خاطئ وتقارير مالية غير موثوقة.
- **Evidence:** تقبل الدالة PrismaClient وتنفذ عدة عمليات مستقلة.
- **Recommended fix:** مسار transaction Serializable واحد مع شرط عدم النزول عن الصفر.

### XM-H-07 — Cash-session helper does not request Serializable isolation

- **Severity/CVSS:** High / 7.1
- **File:** `lib/cash-sessions/cash-session-service.ts:335-351`
- **Endpoint:** فتح/إغلاق الجلسة النقدية
- **Description:** helper اسمه Serializable لكنه يستدعي `$transaction(callback)` دون `isolationLevel`.
- **Attack scenario:** طلبان متزامنان يفتحان جلستين أو ينتجان إغلاقًا غير متسق.
- **Business impact:** اختلافات صندوق وإقفال يومي.
- **Evidence:** غياب خيار isolation.
- **Recommended fix:** `Prisma.TransactionIsolationLevel.Serializable` مع retry.

### XM-H-08 — Predictable seed credentials can reach production

- **Severity/CVSS:** High / 8.8
- **File:** `prisma/seed.ts:9-24`; `.env.example`; `README.md`
- **Endpoint:** حسابات الدخول المزروعة
- **Description:** كلمات مرور fallback معروفة ما لم يُضبط flag اختياري يدويًا.
- **Attack scenario:** تشغيل seed في الإنتاج مع نسيان flag ينشئ حسابات يمكن تخمينها.
- **Business impact:** اختراق مالك/منصة مباشر.
- **Evidence:** `REQUIRE_EXPLICIT_SEED_CREDENTIALS` ليس إلزاميًا تلقائيًا في production.
- **Recommended fix:** production يفرض قيمًا صريحة ويرفض القيم التجريبية دائمًا.

### XM-H-09 — Platform administrators have no MFA

- **Severity/CVSS:** High / 8.1
- **File:** `app/api/auth/platform/login/route.ts` ونموذج PlatformAdmin
- **Endpoint:** Platform login
- **Description:** كلمة مرور فقط لحساب ذي صلاحية شاملة لكل المنشآت.
- **Attack scenario:** تسريب/إعادة استخدام كلمة مرور يعطي المهاجم السيطرة على المنصة.
- **Business impact:** اختراق جماعي لكل العملاء.
- **Evidence:** لا توجد MFA/WebAuthn/TOTP أو step-up authentication.
- **Recommended fix:** MFA إلزامي، جلسة أقصر، step-up للعمليات الحساسة، وتنبيه دخول.

### XM-H-10 — Database cannot enforce tenant isolation

- **Severity/CVSS:** High / 8.6
- **File:** `prisma/schema.prisma` والمهاجرات
- **Endpoint:** جميع مسارات البيانات
- **Description:** 17 نموذجًا أساسيًا تقريبًا تسمح `organizationId` فارغة؛ لا RLS ولا مفاتيح/قيود مركبة تمنع علاقة بين tenantين.
- **Attack scenario:** خطأ استعلام واحد أو relation injection يتجاوز العزل بلا حاجز DB.
- **Business impact:** أثر انفجاري لتسريب أو فساد شامل.
- **Evidence:** العزل محقق في طبقة التطبيق فقط.
- **Recommended fix:** خطة مرحلية: backfill، NOT NULL، مفاتيح مركبة، ثم RLS/context أو طبقة repository مركزية.

### XM-H-11 — Proxy/IP trust allows rate-limit bypass

- **Severity/CVSS:** High / 7.5
- **File:** `lib/auth/rate-limit.ts`; request metadata helper؛ `deploy/nginx/xmansx.conf`
- **Endpoint:** login/signup/public forms
- **Description:** التطبيق يثق بأول `X-Forwarded-For`، وNginx يستخدم `$proxy_add_x_forwarded_for`؛ يمكن للعميل إدخال قيمة أولى مزورة إن وصل إلى proxy.
- **Attack scenario:** تغيير header لكل محاولة لتجاوز حد التسجيل/الدخول.
- **Business impact:** brute force، spam، وإساءة استخدام الموارد.
- **Evidence:** سلسلة proxy لا تُستبدل بعنوان موثوق واحد.
- **Recommended fix:** Nginx يكتب `$remote_addr` بعد real-ip الموثوق، والتطبيق يثق فقط بتكوين proxy معلوم.

### XM-H-12 — Production recovery and DB transport are not demonstrated

- **Severity/CVSS:** High / 7.4
- **File:** `README.md` وملفات deploy
- **Endpoint:** البنية التحتية
- **Description:** لا يوجد backup schedule/restore test في المستودع، ولا يفرض التطبيق TLS لاتصال PostgreSQL؛ firewall/least privilege غير قابلين للتحقق محليًا.
- **Attack scenario:** فشل/تشفير قاعدة البيانات أو اعتراض شبكة داخلية بلا استعادة موثوقة.
- **Business impact:** فقد بيانات طويل أو كشف بيانات العملاء.
- **Evidence:** الوثائق تطلب إعداد النسخ خارج المستودع ولا تقدم دليلاً آليًا.
- **Recommended fix:** نسخ مشفر، retention واختبار restore دوري، TLS وDB private، وحساب أقل صلاحية.

## Medium Findings

| ID | CVSS | File / Endpoint | Description / Attack scenario / Impact / Evidence | Recommended fix |
| --- | ---: | --- | --- | --- |
| XM-M-01 | 6.5 | `next.config.ts`, Nginx | غياب CSP/HSTS/Referrer/Permissions/frame/cache headers مركزية يزيد أثر XSS والتسريب. | رؤوس موحدة و`no-store` للمسارات الحساسة. |
| XM-M-02 | 6.1 | `app/page.tsx:333-346` | JSON-LD مبني من بيانات خطط DB داخل `dangerouslySetInnerHTML` دون escape لـ`<`؛ Platform admin مخترق قد يسبب stored XSS. | serializer آمن يستبدل `<` بـUnicode escape. |
| XM-M-03 | 6.5 | بوابة `/my/:token` | bearer token طويل العمر مخزن plaintext ويوضع في URL؛ تسريب DB/history/referrer يمنح PII. | hash at rest، expiry/rotation، no-referrer/no-store. |
| XM-M-04 | 5.3 | login limiter | المفتاح قائم على الحساب فقط؛ مهاجم يستطيع lockout موجّه للضحية. | حدود IP+account وaccount مستقلة مع backoff منضبط. |
| XM-M-05 | 5.3 | public portal APIs | حجز/إلغاء/slots لا تملك حدودًا واضحة لكل token/IP. | rate limits آمنة دون DoS للمستخدم. |
| XM-M-06 | 5.3 | JSON routes / validation | لا يفرض `Content-Type`، وحدود طول/قيمة غير مكتملة، والاعتماد على body limit خاص بـNginx. | media-type 415، max lengths/amounts، body limit بالتطبيق. |
| XM-M-07 | 6.4 | logger/audit/WhatsApp logs | رسائل الخطأ والstack وPII/نص الرسائل/الأرقام تسجل كاملة. | redaction/masking وretention وRBAC على logs. |
| XM-M-08 | 6.5 | إنشاء الفروع/المستخدمين/الفواتير | count-then-create للحصص قد يتجاوز الباقة تحت التزامن. | Serializable أو عداد/قيد DB ذري. |
| XM-M-09 | 4.3 | WhatsApp mark-sent | يمكن تكرار الانتقال إلى SENT دون state machine صارمة/إعادة تحقق موافقة. | تحديث شرطي `OPENED -> SENT` وموافقة وقت الفتح. |
| XM-M-10 | 5.3 | public loyalty join | رد `ALREADY_REGISTERED` يكشف عضوية رقم هاتف. | رد عام وتحقق OTP قبل كشف الحالة. |
| XM-M-11 | 6.5 | supervisor reports/messaging | نطاق المشرف يبدو مؤسسيًا لبعض العملاء/الحملات رغم وصفه كمدير فروع؛ نموذج الملكية غير حاسم. | قرار صلاحيات موثق واختبارات branch scope. |
| XM-M-12 | 6.5 | `.github/workflows/ci.yml` | `npm audit` غير حاجب، actions tags غير مثبتة إلى SHA، ولا Dependabot/CodeQL. | fail on high، minimal permissions، pinning وأتمتة التحديث. |

## Low Findings

| ID | File / Endpoint | Description and impact | Recommended fix |
| --- | --- | --- | --- |
| XM-L-01 | `/api/health/readiness` | يكشف حالة DB/Redis منفصلة لمهاجم غير مسجل. | اجعله داخليًا أو أعد حالة كلية فقط. |
| XM-L-02 | admin operations | عمليات منصة حساسة لا تملك تغطية audit موحدة. | سجل append-only مع actor/target/result بلا أسرار. |
| XM-L-03 | passwords | الحد الأدنى 8 ولا يوجد حد bytes واضح يراعي حد bcrypt 72 بايت. | max 64/72 bytes وسياسة أقوى للحسابات الجديدة. |
| XM-L-04 | Nginx HTTP redirect | استخدام `$host` يحتاج default server صارم لمنع Host abuse في إعداد غير صحيح. | default reject + canonical redirect. |
| XM-L-05 | monitoring | لا يوجد دليل alerting على brute force/tenant-denials/admin takeover. | تنبيهات وتشغيل runbooks. |

## Informational / Existing Positive Controls

1. لا توجد استعلامات raw SQL ديناميكية خطرة؛ استخدام Prisma واسع.
2. لا توجد uploads أو XML parsing أو command execution أو unsafe deserialization في النطاق.
3. Cookies للجلسة `HttpOnly`, `SameSite=Lax`, وSecure في production، والجلسات عشوائية ومخزنة hash.
4. كلمات المرور مخزنة bcrypt وليست plaintext.
5. Redis cache keys التي روجعت مرتبطة بالمنشأة/الفرع.
6. PWA لا يخزن API responses أو بيانات صفحات حساسة في cache، ولا يخزن tokens في localStorage.
7. `.env` متجاهل ولم يظهر في تاريخ Git؛ لم تظهر private keys أو provider tokens في الملفات المتتبعة.
8. `npm audit` الحالي: صفر ثغرات معروفة؛ signatures المتاحة للاعتماديات اجتازت التحقق.

## Data Leakage Review

يوجد احتمال مؤكد لتسريب metadata حملات/مكافآت واسم حلاق بين المنشآت عبر XM-C-01 إلى XM-C-04. كما تزيد روابط البوابة غير المنتهية، PII في logs، وحالة readiness من سطح التسريب. لم تُعرض في هذا التقرير أي قيمة عميل أو Secret حقيقية.

## Tenant Isolation Review

**النتيجة قبل الإصلاح: غير آمن.** معظم endpoints تطبق `organizationId` و/أو قائمة فروع، لكن الاستثناءات الحرجة أعلاه كافية لكسر الضمان. لا توجد طبقة DB ثانية تمنع الخطأ. يجب أن تغطي اختبارات regression جميع GET/POST/PATCH/DELETE للأصول الأساسية بمنشأتين على الأقل.

## Authentication Review

التوليد والتخزين والـcookie جيدون أساسًا، ولا يوجد JWT غير آمن. المشكلات: صلاحية الجلسة snapshot، عدم إبطال الجلسات عند reset/change، غياب MFA للمنصة، seed credentials، وسياسة password/rate-limit.

## Authorization Review

يوجد تصعيد رأسي Critical من ADMIN إلى OWNER، وتشغيل صيانة عالمية من tenant admin. Guards موجودة على المسارات لكن object authorization لا يُفرض دائمًا داخل services.

## API Security Review

لا توجد أدلة SQLi/RCE/XXE. المشكلات المؤكدة: BOLA/tenant reference injection، SSRF، mass/business assignment للمبلغ، consent classification، missing content-type limits، rate-limit proxy trust، واستجابات/حالات انتقال تحتاج تقليلًا.

## Infrastructure Review

Nginx وCloudflare وsystemd non-root/hardening موثقة بصورة جيدة، لكن صحة firewall وFull(strict) وDB private/TLS لا يمكن إثباتها من المستودع. Redis آمن فقط إذا بقي على localhost/private. لا يوجد Docker. لا ينبغي اعتماد الإنتاج قبل تحقق مستقل من هذه الضوابط.

## Dependency Review

- `npm audit --json`: 0 Critical/High/Moderate/Low في lockfile الحالي.
- `npm audit signatures`: التوقيعات/attestations المتاحة صحيحة.
- Semgrep/OSV/Trivy/Gitleaks غير مثبتة محليًا؛ عُوض ذلك بمراجعة ساكنة موجهة. يلزم إضافتها إلى CI مستقبلًا.
- لم تُحدّث أي major dependency تلقائيًا.

## Secrets Review

لم يظهر Secret متتبع حاليًا أو تاريخيًا بالأنماط التي فُحصت، و`.env` متجاهل. توجد أسرار محلية configured لكن لم تُطبع قيمها. الخطر الأكبر هو fallback seed credentials. يجب إجراء فحص CI بأداة secrets مخصصة وتدوير أي قيمة إن ظهرت لاحقًا.

## Security Headers

الرؤوس المركزية المطلوبة غير مطبقة حاليًا: CSP، HSTS، `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protection، وcache policy للمسارات الحساسة. HTTPS redirect موجود في Nginx، لكن HSTS غير موجود.

## Logging & Monitoring

السجل لا يطبع secrets عمدًا في معظم التدفقات، لكن serializer العام يحتفظ برسالة/stack كاملة، وسجلات WhatsApp/audit تحفظ PII ونصوصًا كاملة. يلزم masking، تقليل retention والوصول، وتنبيهات على فشل الدخول ومحاولات cross-tenant.

## Backup & Recovery

لا يوجد دليل على schedule، تشفير، retention أو restore drill. هذا شرط إطلاق تشغيلي P0 حتى إن كان تنفيذه خارج المستودع.

## Recommended Security Improvements

1. إصلاح كل XM-C فورًا وإضافة اختبارات منشأتين قبل أي إطلاق.
2. إعادة اشتقاق الصلاحيات من DB وإبطال الجلسات عند التغييرات الحساسة.
3. MFA إلزامي لمدير المنصة وstep-up للتدمير/إعادة التعيين.
4. نقل حساب الأسعار والحصص إلى server-side transactions.
5. إضافة DB tenant constraints/RLS تدريجيًا بعد تنظيف البيانات واختبار migration غير مدمرة.
6. تفعيل headers وlogging redaction وproxy trust مضبوط.
7. اعتماد backup/restore وTLS/firewall checklist موثق بأدلة تشغيل.
8. تشغيل SAST/SCA/secrets scanning وsecurity regression tests في CI.

## Review Limitations

- لم يتم إجراء DAST تفاعلي عبر المتصفح لأن أداة المتصفح المعزولة لم تكن متاحة، ولم يتم استخدام Chrome الشخصي للمستخدم حفاظًا على الجلسات.
- لم تُنفذ اختبارات نشطة على Production أو خدمات خارجية.
- إعدادات Cloudflare/firewall/DB/backup الفعلية خارج المستودع تحتاج أدلة من بيئة Staging/Production.
- النتائج هي baseline قبل الإصلاح؛ ستتبعها إعادة فحص في `SECURITY_FINAL_REPORT.md`.
