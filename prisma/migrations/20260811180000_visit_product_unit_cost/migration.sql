-- لقطة تكلفة الوحدة على سطر المنتج المباع.
--
-- بلا هذه اللقطة تُحسب تكلفة المبيعات بسعر التكلفة الحالي، فتعديل تكلفة منتج
-- واحد يعيد كتابة أرباح كل شهر مضى — وهو ما يمنعه المشروع صراحةً في العمولات.
ALTER TABLE "VisitProduct" ADD COLUMN "unitCost" DECIMAL(10,2);

-- تعبئة السطور القائمة بأفضل تقدير متاح مرة واحدة: تكلفة المنتج الحالية.
-- بعد هذه اللحظة تتجمّد القيمة على السطر ولا تتأثر بأي تعديل لاحق للكتالوج.
UPDATE "VisitProduct" vp
SET "unitCost" = p."costPrice"
FROM "Product" p
WHERE p."id" = vp."productId" AND p."costPrice" IS NOT NULL;
