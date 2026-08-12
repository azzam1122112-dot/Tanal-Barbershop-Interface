import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
  getCustomerAuthSession,
} from "@/lib/customers/account-session";

export function setCustomerSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: CUSTOMER_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: CUSTOMER_SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearCustomerSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: CUSTOMER_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export async function readCustomerSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(CUSTOMER_SESSION_COOKIE_NAME)?.value ?? null;
}

/** جلسة العميل الحالية، محفوظة لكل طلب — نفس مبدأ `getRequestSession` للموظفين. */
export const getRequestCustomerSession = cache(async () => {
  return getCustomerAuthSession(prisma, await readCustomerSessionToken());
});

export async function requireCustomerApi() {
  const session = await getRequestCustomerSession();
  if (!session) {
    return { session: null, response: NextResponse.json({ message: "غير مصرح" }, { status: 401 }) };
  }
  return { session, response: null };
}
