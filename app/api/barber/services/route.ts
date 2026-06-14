import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireBarberApi } from "@/lib/auth/http";
import { onlyActiveServices, toSafeService } from "@/lib/services/service-summary";

export async function GET() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;

  const services = await prisma.service.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ services: onlyActiveServices(services).map((service) => toSafeService(service)) });
}
