import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./config";
import { canAccessBarberApp, canAccessDashboard } from "./access";
import { getAuthSession } from "./session";

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export async function getRequestSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return getAuthSession(prisma, token);
}

export async function requireDashboardApi() {
  const session = await getRequestSession();

  if (!canAccessDashboard(session)) {
    return { session: null, response: NextResponse.json({ message: "غير مصرح" }, { status: 401 }) };
  }

  return { session, response: null };
}

export async function requireBarberApi() {
  const session = await getRequestSession();

  if (!canAccessBarberApp(session)) {
    return { session: null, response: NextResponse.json({ message: "غير مصرح" }, { status: 401 }) };
  }

  return { session, response: null };
}

export async function getRequestMeta() {
  const headerStore = await headers();
  return {
    userAgent: headerStore.get("user-agent"),
    ipAddress: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headerStore.get("x-real-ip"),
  };
}

export async function parseJsonBody<T>(request: Request) {
  return (await request.json().catch(() => ({}))) as T;
}
