import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { CUSTOMER_SESSION_COOKIE_NAME } from "@/lib/customers/account-config";
import { MUTATING_METHODS, isTrustedOrigin, parseAllowedOrigins } from "@/lib/auth/origin";
import { CSP_NONCE_HEADER, buildContentSecurityPolicy, createCspNonce } from "@/lib/security/csp";

/** صفحات حساب العميل التي تُفتح بلا جلسة (الدخول والتسجيل والتفعيل والاستعادة). */
const PUBLIC_ACCOUNT_PATHS = new Set([
  "/account/login",
  "/account/register",
  "/account/verify",
  "/account/forgot-password",
  "/account/reset-password",
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // دفاع CSRF: ارفض الطلبات المغيّرة للحالة من أصل غير موثوق.
  if (pathname.startsWith("/api") && MUTATING_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    const allowed = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
    // كل عمليات حساب العميل متصفح-إلى-خادم، بما فيها التسجيل والدخول قبل وجود
    // cookie. لذلك غياب Origin عنها fail-closed. نبقي غيابها مسموحًا لبقية API
    // حتى لا نكسر jobs خادم-لخادم المحمية أصلًا بمفاتيحها التشغيلية.
    const requiresBrowserOrigin = pathname === "/api/account" || pathname.startsWith("/api/account/");
    if ((requiresBrowserOrigin && !origin) || !isTrustedOrigin(origin, getRequestOrigins(request), allowed)) {
      return NextResponse.json({ message: "أصل الطلب غير موثوق" }, { status: 403 });
    }
  }

  // **جلسة الموظف وحدها** تفتح مسارات الموظفين. كوكي العميل باسم مستقل ولا
  // يُقرأ هنا إطلاقًا، فحيازته لا تمنح شيئًا من اللوحة أو تطبيق الحلاق أو الإيصال.
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  // وبالمقابل: جلسة الموظف ليست تسجيل دخول عميل. حساب العميل يُحرس بكوكيه هو.
  if (pathname.startsWith("/account") && !PUBLIC_ACCOUNT_PATHS.has(pathname)) {
    if (!request.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value) {
      return redirectToPublicOrigin(request, "/account/login");
    }
  }

  if (pathname.startsWith("/dashboard") && pathname !== "/dashboard/login" && !hasSession) {
    return redirectToPublicOrigin(request, "/dashboard/login");
  }

  if (pathname.startsWith("/barber") && pathname !== "/barber/login" && !hasSession) {
    return redirectToPublicOrigin(request, "/barber/login");
  }

  if (pathname.startsWith("/platform") && pathname !== "/platform/login" && !hasSession) {
    return redirectToPublicOrigin(request, "/platform/login");
  }

  // الإيصالات تحمل بيانات عميل ومبالغ — لا تُفتح بلا جلسة.
  if (pathname.startsWith("/receipt") && !hasSession) {
    return redirectToPublicOrigin(request, "/dashboard/login");
  }

  return withNonceCsp(request, pathname);
}

/**
 * يستبدل سياسة `next.config.ts` الثابتة بنسخة nonce على مسارات الصفحات وحدها.
 *
 * الـnonce يُمرَّر في **ترويسة الطلب** أيضًا لا في الرد فقط: من هناك تقرؤه Next
 * فتوقّع سكربتات حزمتها الداخلية، ومن هناك يقرؤه `app/barber/layout.tsx` لسكربت
 * التقاط دعوة التثبيت. بلا ترويسة الطلب يُحجب كل سكربت في الصفحة.
 *
 * ومسارات `/api` تُستثنى: ردودها JSON لا HTML، فبناء ترويسات طلب جديدة لكل نداء
 * تكلفةٌ بلا مقابل.
 */
function withNonceCsp(request: NextRequest, pathname: string) {
  if (pathname.startsWith("/api")) return NextResponse.next();

  const nonce = createCspNonce();
  const csp = buildContentSecurityPolicy({ nonce, isProduction: process.env.NODE_ENV === "production" });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_NONCE_HEADER, nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/**
 * لا نبني التحويل من `request.url`: خلف reverse proxy قد يكون أصله
 * `http://localhost:3000`. وفي الوقت نفسه يشترط Next.js عنوانًا مطلقًا داخل
 * middleware، لذلك نعيد بناء الأصل العام من ترويسات البروكسي التي يثبتها Nginx.
 */
function redirectToPublicOrigin(request: NextRequest, pathname: `/${string}`) {
  return NextResponse.redirect(new URL(pathname, `${getPublicRequestOrigin(request)}/`));
}

function getPublicRequestOrigin(request: NextRequest) {
  const host = trustedRequestHost(request);
  const protocol = firstForwardedValue(request.headers.get("x-forwarded-proto")) ??
    request.nextUrl.protocol.replace(":", "");

  if (host && (protocol === "http" || protocol === "https")) {
    try {
      return new URL(`${protocol}://${host}`).origin;
    } catch {
      // نعود إلى أصل Next بعد فشل ترويسة مشوهة.
    }
  }

  return request.nextUrl.origin;
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

/**
 * المضيف المعلن للطلب — **بعد التحقق منه**، لا كما وصل.
 *
 * `X-Forwarded-Host` ترويسةٌ لا يضبطها إلا بروكسي موثوق، وإعداد Nginx المرفق
 * صار يضبطها صراحةً. لكن التطبيق لا يعتمد على ذلك وحده: منه يُبنى أصلُ التحويل
 * بعد فشل الجلسة، وتُضاف إلى أصول CSRF المقبولة. نشرٌ خلف بروكسي لا يمسحها —
 * أو مباشرةً بلا بروكسي — كان يجعل قيمةً يكتبها الزائر تقرّر إلى أين يُحوَّل.
 *
 * القاعدة: تُقبل الترويسة فقط إن كانت داخل النطاق الذي نملكه. والمرجع بالترتيب:
 * `ROOT_DOMAIN` (النشر متعدد النطاقات الفرعية)، ثم مضيف `PUBLIC_APP_URL` (نطاق
 * واحد). بلا أيٍّ منهما — أي محليًا — لا مرجع للمقارنة فنكتفي بمضيف الطلب نفسه.
 */
function trustedRequestHost(request: NextRequest): string | null {
  const directHost = firstForwardedValue(request.headers.get("host"));
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  if (!forwardedHost) return directHost;
  return isOwnedHost(forwardedHost) ? forwardedHost : directHost;
}

function isOwnedHost(host: string) {
  const hostname = host.split(":")[0]?.trim().toLowerCase();
  if (!hostname) return false;

  const root = process.env.ROOT_DOMAIN?.trim().toLowerCase();
  if (root) return hostname === root || hostname.endsWith(`.${root}`);

  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return hostname === new URL(configured).hostname.toLowerCase();
    } catch {
      return false;
    }
  }

  // بلا نطاق مضبوط (تطوير/نطاق واحد بلا إعداد) لا مرجع نقارن به.
  return true;
}

function getRequestOrigins(request: NextRequest) {
  const origins = new Set<string>([request.nextUrl.origin]);
  const host = trustedRequestHost(request);
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");

  if (host && forwardedProto) {
    origins.add(`${forwardedProto}://${host}`);
  }

  return [...origins];
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/barber/:path*",
    "/platform/:path*",
    "/receipt/:path*",
    "/account/:path*",
    // بوابة العميل وصفحة الانضمام تعرضان بيانات من القاعدة، فتأخذان سياسة nonce
    // كبقية الشاشات. لا حارس جلسة عليهما — الرمز في الرابط هو الهوية.
    "/my/:path*",
    "/join",
    "/api/:path*",
  ],
};
