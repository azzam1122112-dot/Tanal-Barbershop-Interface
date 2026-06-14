import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth/http";

export async function GET() {
  const session = await getRequestSession();

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  if (session.type === "dashboard") {
    return NextResponse.json({ user: session.user });
  }

  return NextResponse.json({ user: session.barber });
}
