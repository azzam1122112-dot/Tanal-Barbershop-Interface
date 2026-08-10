export function buildAppointmentWhatsAppMessage({
  customerName,
  barberName,
  salonName,
  appointmentDateTime,
}: {
  customerName: string;
  barberName: string;
  salonName?: string | null;
  appointmentDateTime: string;
}) {
  return [
    `مرحبًا ${customerName}،`,
    `معك الحلاق ${barberName}${salonName ? ` من ${salonName}` : ""}.`,
    `أتواصل معك بخصوص موعدك ${appointmentDateTime}.`,
    "إذا احتجت أي مساعدة أو تعديل على الموعد تواصل معي هنا.",
  ].join("\n");
}
