import { absoluteUrl, siteUrl } from "@/lib/site";
import { PUBLIC_ROUTES } from "@/lib/seo-routes";

/**
 * IndexNow — إبلاغ فوري لمحركات البحث بتغيّر صفحة.
 *
 * **لماذا يستحق الوجود:** خريطة الموقع دعوة سلبية تُقرأ متى شاء الزاحف، وقد
 * تمرّ أسابيع قبل إعادة زحف صفحة عُدِّلت. IndexNow نداء مباشر يقبله Bing
 * وYandex وSeznam وNaver عبر نقطة واحدة (المشاركون يتبادلون النداء بينهم)،
 * فتُعاد قراءة الصفحة خلال دقائق. Google لا يشارك فيه، ويبقى Search Console
 * وخريطة الموقع طريقه.
 *
 * **الرمز ليس سرًّا** — يجب أن يكون منشورًا على النطاق نفسه ليثبت ملكيته، وهو
 * ما يفعله `app/indexnow/[key]/route.ts`. لكنه رمز نطاق واحد: لا تُعِد استخدامه
 * على نطاق آخر.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export function getIndexNowKey() {
  return process.env.INDEXNOW_KEY?.trim() || "";
}

/**
 * الرمز يُقدَّم من مسار فرعي لا من جذر النطاق.
 *
 * المواصفة تسمح بأي موضع على المضيف نفسه ما دام `keyLocation` مُصرَّحًا به في
 * الطلب، وملف في الجذر كان سيحتاج إعادة كتابة تلتقط كل `*.txt` فتُظلّل
 * `robots.txt` المولَّد.
 */
export function indexNowKeyLocation(key: string) {
  return absoluteUrl(`/indexnow/${key}.txt`);
}

export type IndexNowResult = {
  submitted: string[];
  status: number;
  ok: boolean;
  body: string;
};

/**
 * يُرسل دفعة روابط. المواصفة تشترط أن تكون كلها على المضيف المُعلن، لذلك
 * يُرفض أي رابط خارجه بدل إرساله وخسارة الدفعة كلها بخطأ 422.
 */
export async function submitToIndexNow(
  urls: readonly string[] = PUBLIC_ROUTES.map((route) => absoluteUrl(route.path)),
  fetchImpl: typeof fetch = fetch,
): Promise<IndexNowResult> {
  const key = getIndexNowKey();
  if (!key) throw new Error("INDEXNOW_KEY غير مضبوط — لا يمكن الإبلاغ عن التحديثات.");

  const host = new URL(siteUrl).host;
  const urlList = [...new Set(urls)].filter((url) => {
    try {
      return new URL(url).host === host;
    } catch {
      return false;
    }
  });

  if (urlList.length === 0) throw new Error(`لا توجد روابط صالحة على المضيف ${host}.`);

  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: indexNowKeyLocation(key), urlList }),
  });

  return {
    submitted: urlList,
    status: response.status,
    // 200 قبول فوري و202 قبول مع تحقق لاحق من الرمز — كلاهما نجاح.
    ok: response.status === 200 || response.status === 202,
    body: await response.text().catch(() => ""),
  };
}
