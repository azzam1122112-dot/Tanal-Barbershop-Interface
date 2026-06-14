import type { PaymentMethod } from "@prisma/client";
import { getPresetRange, type ReportFilters } from "./dashboard-reports";

export function getReportFiltersFromUrl(url: URL): ReportFilters {
  const preset = url.searchParams.get("preset");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const presetRange = getPresetRange(preset);
  const paymentMethod = url.searchParams.get("paymentMethod");

  return {
    from: fromParam ? startOfDay(new Date(fromParam)) : presetRange.from,
    to: toParam ? endExclusive(new Date(toParam)) : presetRange.to,
    barberId: url.searchParams.get("barberId"),
    paymentMethod: isPaymentMethod(paymentMethod) ? paymentMethod : undefined,
  };
}

function isPaymentMethod(value: string | null): value is PaymentMethod {
  return value === "CASH" || value === "NETWORK";
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endExclusive(date: Date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}
