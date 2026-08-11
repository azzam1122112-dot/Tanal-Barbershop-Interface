-- إزالة بند «سلفة موظف» من تصنيفات المصروفات نهائيًا.
--
-- PostgreSQL لا يسمح بحذف قيمة من ENUM مباشرة، فيُعاد بناء النوع. وقبل ذلك
-- تُنقل أي سجلات قائمة إلى `OTHER` — نصّ السبب المكتوب في `note` يبقى كما هو
-- لأنه بيانات المستخدم لا تسمية النظام.
--
-- ملاحظة صيانة: كُتبت يدويًا لا عبر `prisma migrate dev`، لأن المولّد يضيف
-- إسقاطًا لقيود عزل المستأجرين المخصّصة (انظر CLAUDE.md).

UPDATE "CashExpense" SET "category" = 'OTHER' WHERE "category" = 'STAFF_ADVANCE';

ALTER TYPE "ExpenseCategory" RENAME TO "ExpenseCategory_old";

CREATE TYPE "ExpenseCategory" AS ENUM ('SUPPLIES', 'MAINTENANCE', 'UTILITIES', 'REFUND', 'OTHER');

ALTER TABLE "CashExpense" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "CashExpense"
  ALTER COLUMN "category" TYPE "ExpenseCategory" USING ("category"::text::"ExpenseCategory");
ALTER TABLE "CashExpense" ALTER COLUMN "category" SET DEFAULT 'OTHER';

DROP TYPE "ExpenseCategory_old";
