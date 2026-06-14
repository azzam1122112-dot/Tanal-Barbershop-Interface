import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/dashboard/:path*", "/barber/:path*"],
};
