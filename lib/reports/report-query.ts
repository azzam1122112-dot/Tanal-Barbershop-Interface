import type { PaymentMethod } from "@prisma/client";
import { getPresetRange, type ReportFilters } from "./dashboard-reports";
import { addRiyadhDays, parseRiyadhDateKey } from "@/lib/datetime/riyadh";

export function getReportFiltersFromUrl(url: URL): ReportFilters {
  const preset = url.searchParams.get("preset");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const presetRange = getPresetRange(preset);
  const paymentMethod = url.searchParams.get("paymentMethod");

  return {
    from: fromParam ? parseRiyadhDateKey(fromParam) : presetRange.from,
    to: toParam ? addRiyadhDays(parseRiyadhDateKey(toParam), 1) : presetRange.to,
    barberId: url.searchParams.get("barberId"),
    paymentMethod: isPaymentMethod(paymentMethod) ? paymentMethod : undefined,
  };
}

function isPaymentMethod(value: string | null): value is PaymentMethod {
  return value === "CASH" || value === "NETWORK";
}
