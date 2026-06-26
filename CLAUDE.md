# CLAUDE.md

دليل معماري موجّه للمطوّرين وأدوات الذكاء للعمل على هذا المستودع. README.md يغطّي التشغيل والنشر؛ هذا الملف يغطّي القرارات والأنماط.

## ما هو المشروع

نظام تشغيل وولاء لصالون حلاقة رجالي (TANAL). Next.js 15 (App Router) + React 19 + Prisma 6 + PostgreSQL، واجهة عربية RTL بالكامل. ثلاثة فضاءات:

- **واجهة الحلاق** `/barber` — موبايل أولًا، تسجيل الزيارات والبحث عن العملاء وفتح/إغلاق جلسة الصندوق.
- **لوحة المدير** `/dashboard` — العملاء، الزيارات، التقارير، الحملات، الولاء، جلسات الصندوق، واتساب، الإعدادات.
- **APIs** `/api/*` — معالجات رقيقة فوق طبقة الخدمة.

## أوامر أساسية

```bash
npm run dev          # تطوير
npm run typecheck    # tsc --noEmit
npm test             # vitest run (يحتاج PostgreSQL يعمل + seed)
npm run lint
npm run build
npm run prisma:migrate
npm run prisma:seed
```

> اختبارات عدة (cash-session, visit-service, daily-close, customer-service...) تستخدم `PrismaClient` حقيقيًا وتحتاج قاعدة بيانات تعمل وحساب مدير من الـ seed. الباقي اختبارات نقية.

## طبقات الكود

```
app/api/*      معالجات HTTP رقيقة: صلاحية → تحقق Zod → استدعاء الخدمة
app/(barber|dashboard)/*  صفحات React
components/*    واجهات (barber/ و dashboard/)
lib/*          منطق الأعمال الحقيقي (مصدر الحقيقة)
prisma/*       schema + migrations + seed
```

**القاعدة:** لا تضع منطق أعمال في معالجات الـ API أو المكوّنات. ضعه في `lib/*` لأنه قابل للاختبار وإعادة الاستخدام بين الواجهات.

## أنماط لا تكسرها

### الصلاحيات
- بوابات الوصول في `lib/auth/access.ts`. المعالجات تستخدم `requireBarberApi` / `requireDashboardApi` / `requireAdminApi` من `lib/auth/http.ts`.
- الجلسات مخزّنة في DB كـ SHA-256 hash للتوكن، والكوكي `httpOnly` + `sameSite=lax` + `secure` في الإنتاج.
- `middleware.ts` يتحقق فقط من وجود الكوكي (حارس مبدئي) + يفحص Origin على الطلبات المغيّرة للحالة (CSRF). التحقق الفعلي من الصلاحية يتم داخل المعالج.

### معالجة الأخطاء
- أخطاء الأعمال المتوقعة (تحقق، صلاحية، حالة) تُرمى كـ `BusinessError` من `lib/errors.ts`.
- المعالجات تُعيد الأخطاء عبر `toErrorResponse` / `safeErrorMessage` من `lib/http/error-response.ts`:
  - `BusinessError` → تُعرض رسالته العربية بحالته.
  - أي خطأ آخر → يُسجَّل عبر `logger` ويُعاد رسالة عامة 500 (لا تسريب تفاصيل داخلية).
- **لا تُعِد `error.message` مباشرة للواجهة** لخطأ غير مصنّف.

### المال والتجميع
- كل تجميع لإجماليات زيارات يمر عبر `aggregateVisitTotals` في `lib/visits/visit-totals.ts` — مصدر حقيقة واحد لجلسة الصندوق والإغلاق اليومي. لا تكرّر منطق cash/card/net/points.
- المبالغ `Decimal` في DB؛ حوّلها بـ `Number(...)` عند الحساب و`roundMoney` عند الجمع.

### التزامن المالي
- `confirmVisit` و عمليات جلسة الصندوق/الإغلاق تستخدم معاملات `Serializable` مع إعادة محاولة عند تعارض `P2034`.
- كل زيارة تحمل `idempotencyKey` فريدًا لكل حلاق (`@@unique([barberId, idempotencyKey])`) — الضغط المزدوج لا يكرّر الزيارة.

### قواعد الأعمال الجوهرية
- **جلسة الصندوق هي القفل التشغيلي**، وليس تاريخ اليوم. لا تسجيل زيارة بدون جلسة صندوق مفتوحة (`assertOpenCashSession`). `DailyClose` تقرير فقط.
- **خصم واحد لكل زيارة**: لا يُجمع reward نقاط + حملة + مكافأة مدير معًا. الخصم لا يتجاوز المبلغ.
- **واتساب يدوي بالكامل**: النظام يجهّز روابط `wa.me` فقط؛ لا API ولا إرسال تلقائي ولا bulk.
- **التدقيق إلزامي**: كل عملية حساسة تُسجَّل عبر `writeAuditLog` (actor/before/after/IP).

## الأمان والتشغيل

- **Rate limiting** مخزّن في DB (`LoginAttempt`) مع قفل 15 دقيقة بعد 8 محاولات فاشلة خلال 5 دقائق — يصمد عبر عدة instances (`lib/auth/rate-limit.ts`).
- **الصيانة الدورية** عبر `lib/maintenance/cleanup.ts`: حذف الجلسات المنتهية/الملغاة، عدادات المحاولات المنقضية، وسجلات التدقيق/واتساب الأقدم من مدة الاحتفاظ. تُشغَّل من cron (`npm run maintenance:cleanup`) أو `POST /api/maintenance/cleanup` (مدير أو `x-maintenance-token`).
- **Logging** منظّم JSON عبر `lib/logger.ts` (`LOG_LEVEL`).
- متغيرات بيئة جديدة: `ALLOWED_ORIGINS`, `MAINTENANCE_TOKEN`, `LOG_LEVEL` (انظر `.env.example`).

## التحقق قبل أي PR

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

CI على GitHub Actions (`.github/workflows/ci.yml`) يشغّلها مع خدمة PostgreSQL على كل push/PR إلى `main`.

## إضافة migration

عدّل `prisma/schema.prisma` ثم `npm run prisma:migrate -- --name <اسم>`. تحقق من الترتيب على قاعدة فارغة (انظر قسم "فحص قاعدة جديدة من الصفر" في README).
