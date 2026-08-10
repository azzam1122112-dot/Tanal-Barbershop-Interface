# SECURITY REMEDIATION PLAN — XMANSX

> الحالة بعد تنفيذ 2026-08-10. لم تُطبق التغييرات على Production، ولم تتغير أسرار أو بيانات حقيقية، ولم يحدث commit/push/deploy.

## P0 — يجب إغلاقه قبل الإطلاق

| الإجراء | الحالة | معيار القبول/الدليل |
| --- | --- | --- |
| إغلاق BOLA/IDOR والعلاقات العابرة للمؤسسات | **Completed in code/test** | tenant-scoped services + 56 composite FKs + اختبار رفض DB مباشر |
| MFA إلزامي لمدير المنصة | **Completed in code/test** | TOTP، secret مشفر، recovery hash، anti-replay، setup-only session |
| سلامة مبلغ الخدمة | **Completed in code/test** | السعر من `Service.defaultPrice` ورفض client mismatch؛ override إداري فقط |
| النسخ والاستعادة | **Completed locally / Production gate open** | restore محلي ناجح؛ يلزم encrypted Staging restore وoff-site retention |
| حماية Portal token | **Completed in code/test** | hash at rest، expiry 1–90 يومًا، rotation، no-store/no-referrer |
| سباقات حدود الباقات | **Completed in code/test** | Serializable + advisory locks + concurrent regression test |
| موافقة WhatsApp وعزل المرسل | **Completed in code/test** | marketing consent fail-closed وtenant ownership |
| حماية Production seed/session/admin operations | **Completed in code/test** | منع demo credentials، live authorization، session invalidation |

## P1 — يجب إغلاقه قبل قرار GO

| الإجراء | الحالة | المالك المقترح |
| --- | --- | --- |
| تطبيق migrations على Staging بعد نسخة قابلة للاستعادة | **Pending operational execution** | DevOps + DBA |
| تشغيل encrypted backup ثم restore drill من Staging | **Pending operational evidence** | DevOps + DBA |
| التحقق من DB/Redis private networking وTLS وleast privilege | **Pending environment evidence** | Cloud/DevOps |
| مشاهدة نجاح Semgrep/Gitleaks/CodeQL داخل GitHub CI | **Pending first CI run** | Engineering |
| إكمال MFA لكل Platform Admin وحفظ recovery codes خارجيًا | **Pending enrollment** | Security + Platform owners |
| smoke test واختبار اختراق مستقل على Staging | **Pending** | AppSec/External tester |

## P2 — تحسين أمني قريب

1. استبدال CSP `'unsafe-inline'` بسياسة nonce/hash متوافقة مع Next.js.
2. توحيد `Content-Type` وbody-size وطول الحقول والحدود القصوى للقيم على كل API قديم.
3. إضافة OTP ورد عام لمسار loyalty join لإزالة membership enumeration.
4. ربط tenant-denial وMFA failures وrate limits وPlatform actions مع SIEM وتنبيهات.
5. اختبار recovery code rotation وإعادة تهيئة MFA بإجراء break-glass موثق رباعي العيون.
6. إضافة OSV/SBOM/container scan عندما تدخل صور التطبيق مسار النشر.

## P3 — Hardening إضافي

1. PostgreSQL RLS كطبقة إضافية فوق composite constraints بعد تصميم tenant context آمن وfail-closed.
2. WAF/bot management وcentral distributed rate limiting عند التوسع الأفقي.
3. immutable audit sink منفصل بحد أدنى من PII.
4. تمارين incident response وdisaster recovery دورية وقياس RPO/RTO.
5. WebAuthn/passkeys لحسابات المنصة عالية الحساسية فوق TOTP.

## Safe Deployment Order

1. أنشئ backup مشفر من Staging وتحقق من checksum والقابلية للاستعادة.
2. شغّل `prisma migrate deploy` على Staging فقط وراجع backfill/fail-closed checks.
3. شغّل الاختبارات الـ259 وtypecheck/lint/build وSemgrep/Gitleaks/CodeQL.
4. اختبر بمنشأتين منفصلتين وأدوار Owner/Admin/Supervisor/Barber/Customer/Platform Admin.
5. فعّل مفتاح MFA سريًا عبر secret manager ثم أكمل enrollment لكل مدير منصة.
6. تحقق من TLS/firewall/Redis/object storage/monitoring واحتفاظ النسخ خارج الموقع.
7. نفّذ pentest مستقل، ثم وثّق قرار GO وموافقة مالك المخاطر.

## Rollback and Safety

- لا تُطبق migrations على Production دون backup مثبت الاستعادة ونافذة تغيير.
- لا تُسجل أو تُطبع `PLATFORM_MFA_ENCRYPTION_KEY` أو recovery codes.
- لا تحذف قواعد بيانات drill أو artifacts تلقائيًا؛ تنظيفها يحتاج تفويضًا منفصلًا.
- لا تنفذ إرسالًا أو دفعًا أو webhook حقيقيًا أثناء smoke/security tests.
- لا commit أو push أو deploy دون طلب صريح.
