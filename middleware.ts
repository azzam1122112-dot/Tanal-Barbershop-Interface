import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { MUTATING_METHODS, isTrustedOrigin, parseAllowedOrigins } from "@/lib/auth/origin";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // دفاع CSRF: ارفض الطلبات المغيّرة للحالة من أصل غير موثوق.
  if (pathname.startsWith("/api") && MUTATING_METHODS.has(request.method)) {
    const allowed = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
    if (!isTrustedOrigin(request.headers.get("origin"), request.nextUrl.origin, allowed)) {
      return NextResponse.json({ message: "أصل الطلب غير موثوق" }, { status: 403 });
    }
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (pathname.startsWith("/dashboard") && pathname !== "/dashboard/login" && !hasSession) {
    return NextResponse.redirect(new URL("/dashboard/login", request.url));
  }

  if (pathname.startsWith("/barber") && pathname !== "/barber/login" && !hasSession) {
    return NextResponse.redirect(new URL("/barber/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/barber/:path*", "/api/:path*"],
};
