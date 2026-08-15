import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPortalBooking, getPortalIdentity } from "@/lib/customers/portal-view";
import { PortalBooking } from "@/components/public/portal-booking";

export const metadata: Metadata = { title: "مواعيدي" };

export default async function PortalAppointmentsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const identity = await getPortalIdentity(token);
  if (!identity) notFound();

  const { appointments, bookableSalons } = await getPortalBooking(identity);

  return (
    <PortalBooking
      token={token}
      salons={bookableSalons}
      initialAppointments={appointments}
      bookingPolicy={identity.bookingPolicy}
      arriveEarlyMinutes={identity.arriveEarlyMinutes}
    />
  );
}
