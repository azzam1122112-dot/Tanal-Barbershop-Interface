import type { Prisma, PrismaClient, WhatsAppTemplateType } from "@prisma/client";

export type DefaultWhatsAppTemplate = {
  name: string;
  type: WhatsAppTemplateType;
  body: string;
};

/**
 * قوالب واتساب احترافية جاهزة — تُزرع لكل مؤسسة جديدة وقابلة للتعديل بالكامل لاحقًا.
 * تستخدم فقط المتغيّرات المدعومة في renderWhatsAppTemplate.
 */
export const DEFAULT_WHATSAPP_TEMPLATES: DefaultWhatsAppTemplate[] = [
  {
    name: "شكر بعد الزيارة",
    type: "POST_VISIT",
    body: `مرحبًا {name} 👋

شكرًا لزيارتك {salon_name} اليوم 💈
• قيمة الزيارة: {visit_net_amount} ريال
• نقاط اكتسبتها: {visit_points_earned} ⭐
• رصيدك الآن: {points} نقطة

نسعد بخدمتك دائمًا، إلى اللقاء قريبًا 🌟`,
  },
  {
    name: "مكافأتك جاهزة",
    type: "REWARD_READY",
    body: `أهلًا {name} 🎁

لديك مكافأة بانتظارك في {salon_name}!
• رصيد نقاطك: {points} ⭐
• خصم متاح لك: {reward_discount} ريال 💰

احجز زيارتك القادمة واستمتع بمكافأتك 🌟`,
  },
  {
    name: "عرض خاص لك",
    type: "CAMPAIGN",
    body: `عرض خاص لك يا {name} 🎉

{campaign_name}
🔥 الخصم: {campaign_discount}

العرض في {salon_name} لفترة محدودة — لا تفوّته!
بانتظارك 📲`,
  },
  {
    name: "اشتقنا لك",
    type: "INACTIVE_CUSTOMER",
    body: `اشتقنا لك يا {name} 🤍

مرّ {days_since_last_visit} يومًا على آخر زيارة لك إلى {salon_name}.
ورصيد نقاطك محفوظ: {points} ⭐

عُد إلينا ودلّل نفسك بإطلالة جديدة 💈`,
  },
  {
    name: "رسالة ترحيب",
    type: "CUSTOM",
    body: `مرحبًا {name} 👋

نتشرّف بتواصلك مع {salon_name}.
نحن هنا لخدمتك دائمًا 🌟`,
  },
];

type WhatsAppDb = PrismaClient | Prisma.TransactionClient;

/**
 * يزرع القوالب الاحترافية الناقصة لمؤسسة (لا يكرّر الموجود بنفس النوع والاسم).
 * يُرجع عدد القوالب المُضافة.
 */
export async function seedDefaultWhatsAppTemplates(db: WhatsAppDb, organizationId: string) {
  let created = 0;
  for (const template of DEFAULT_WHATSAPP_TEMPLATES) {
    const existing = await db.whatsAppTemplate.findFirst({
      where: { organizationId, type: template.type, name: template.name },
      select: { id: true },
    });
    if (existing) continue;
    await db.whatsAppTemplate.create({ data: { ...template, organizationId } });
    created += 1;
  }
  return created;
}
