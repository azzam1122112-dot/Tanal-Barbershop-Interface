import { getIndexNowKey } from "@/lib/seo-indexnow";

// الرمز يُقرأ من البيئة وقت الطلب: تغييره لا يحتاج إعادة بناء.
export const dynamic = "force-dynamic";

/**
 * ملف إثبات ملكية IndexNow. يُطلبه المحرك للتأكد أن من أرسل الإشعار يملك
 * النطاق، ومحتواه هو الرمز نفسه نصًّا خامًا بلا أسطر زائدة.
 *
 * المقارنة تقبل الاسم بامتداد `.txt` وبدونه لأن المحركات تطلبه بامتداده،
 * وتُعيد 404 إن لم يُضبط `INDEXNOW_KEY` فلا يُعلَن عن مسار لا يعمل.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const configured = getIndexNowKey();
  const { key } = await params;
  const requested = key.replace(/\.txt$/i, "");

  if (!configured || requested !== configured) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(configured, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
