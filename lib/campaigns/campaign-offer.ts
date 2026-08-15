import type { Campaign } from "@prisma/client";

/**
 * صياغة الحملة **للعميل** — لا لشاشة الإدارة.
 *
 * **لماذا لا يُعرض `campaign.name`:** الاسم يكتبه المدير لنفسه ويصف الشريحة لا
 * العرض: «استرجاع المنقطعين»، «عملاء بلا زيارة ٦٠ يومًا». عرضه حرفيًا يخبر
 * العميل بتصنيفه عند الصالون — وهو أسوأ ما يمكن أن تفتتح به رسالة ترغيب.
 * العنوان هنا **مشتقّ من قيمة الخصم نفسها**، والشرح يأتي من `description` وهو
 * الحقل الذي يكتبه المدير للعميل أصلًا.
 *
 * **ولا يُعرض `targetType` ولا `minPoints` ولا `inactiveDays`** لسبب واحد:
 * كلها تصف لماذا اختير هذا العميل، لا ماذا سيربح.
 */
export type CustomerCampaignOffer = {
  id: string;
  /** اسم تسويقي آمن للحملات العامة فقط؛ أسماء الشرائح المستهدفة تبقى داخلية. */
  title: string | null;
  /** «خصم ١٥٪» أو «خصم ٢٠ ريال» — مشتقّ من الخصم لا من الاسم الداخلي. */
  headline: string;
  /** شرح المدير للعميل إن كتبه. */
  detail: string | null;
  endsAt: string;
  /** النسبة لا تُترجم إلى ريالات بلا فاتورة — الشاشة تقولها نسبةً. */
  isPercentage: boolean;
};

export function toCustomerCampaignOffer(campaign: Campaign): CustomerCampaignOffer {
  const value = Number(campaign.discountValue);
  const isPercentage = campaign.discountType === "PERCENTAGE";

  return {
    id: campaign.id,
    title: campaign.targetType === "ALL_CUSTOMERS" ? campaign.name.trim() || null : null,
    headline: isPercentage ? `خصم ${formatPercentage(value)}٪` : `خصم ${formatPercentage(value)} ريال`,
    detail: campaign.description?.trim() || null,
    endsAt: campaign.endAt.toISOString(),
    isPercentage,
  };
}

/** ‏«١٥» لا «١٥.٠٠»، و«١٢.٥» تبقى كما هي. */
function formatPercentage(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
