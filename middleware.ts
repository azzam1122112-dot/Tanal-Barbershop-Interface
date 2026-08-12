import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { CUSTOMER_SESSION_COOKIE_NAME } from "@/lib/customers/account-config";
import { MUTATING_METHODS, isTrustedOrigin, parseAllowedOrigins } from "@/lib/auth/origin";

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
    const allowed = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
    if (!isTrustedOrigin(request.headers.get("origin"), getRequestOrigins(request), allowed)) {
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

  return NextResponse.next();
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
  const host = firstForwardedValue(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
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

function getRequestOrigins(request: NextRequest) {
  const origins = new Set<string>([request.nextUrl.origin]);
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");

  if (forwardedHost && forwardedProto) {
    origins.add(`${forwardedProto}://${forwardedHost}`);
  }

  return [...origins];
}

export const config = {
  matcher: ["/dashboard/:path*", "/barber/:path*", "/platform/:path*", "/receipt/:path*", "/account/:path*", "/api/:path*"],
};
