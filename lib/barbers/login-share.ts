type BarberLoginDetails = {
  name: string;
  phone: string;
  loginUrl: string;
  pin?: string | null;
};

export function buildBarberLoginMessage({ name, phone, loginUrl, pin }: BarberLoginDetails) {
  const pinLine = pin?.trim()
    ? `رمز الدخول: ${pin.trim()}`
    : "رمز الدخول: استخدم الرمز الذي سلّمك مدير الصالون";

  return [
    `مرحبًا ${name}،`,
    "هذه بيانات دخولك إلى تطبيق الحلاق في منصة إكس مانس إكس XMANSX:",
    `رابط الدخول: ${loginUrl}`,
    `رقم الجوال: ${phone}`,
    pinLine,
    "بعد الدخول يمكنك متابعة حجوزاتك وتحديث حالتها مباشرة.",
  ].join("\n");
}

export function toWhatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("05")) return `966${digits.slice(1)}`;
  if (digits.startsWith("5")) return `966${digits}`;
  return digits;
}
