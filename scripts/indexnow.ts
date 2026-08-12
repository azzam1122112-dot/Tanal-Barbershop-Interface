import { absoluteUrl } from "../lib/site";
import { PUBLIC_ROUTES } from "../lib/seo-routes";
import { indexNowKeyLocation, getIndexNowKey, submitToIndexNow } from "../lib/seo-indexnow";

/**
 * إبلاغ IndexNow بتحديث الصفحات العامة.
 *
 *   npm run seo:indexnow                 # كل الصفحات العامة
 *   npm run seo:indexnow -- /terms /privacy
 *
 * يُشغَّل بعد نشرٍ غيّر محتوى صفحة عامة. تشغيله بلا تغيير حقيقي إساءة استخدام
 * للخدمة ولا يُسرّع شيئًا.
 */
async function main() {
  const key = getIndexNowKey();
  if (!key) {
    console.error("INDEXNOW_KEY غير مضبوط. ولّد رمزًا عشوائيًا (8-128 محرفًا) واضبطه في البيئة.");
    process.exitCode = 1;
    return;
  }

  const paths = process.argv.slice(2);
  const urls = paths.length > 0
    ? paths.map((path) => absoluteUrl(path))
    : PUBLIC_ROUTES.map((route) => absoluteUrl(route.path));

  console.log(`موضع الرمز: ${indexNowKeyLocation(key)}`);
  const result = await submitToIndexNow(urls);

  console.log(`${result.ok ? "تم" : "فشل"} — الحالة ${result.status}`);
  for (const url of result.submitted) console.log(`  ${url}`);
  if (result.body) console.log(result.body);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
