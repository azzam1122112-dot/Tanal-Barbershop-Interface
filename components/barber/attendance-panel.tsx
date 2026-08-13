"use client";

import { useState } from "react";
import { FeedbackNote, useFeedback } from "@/components/ui/toast";
import { RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";
import { safeFetch } from "@/lib/http/safe-fetch";

type Attendance = { id: string; checkInAt: string; isOpen: boolean } | null;

const timeFormatter = new Intl.DateTimeFormat("ar-SA", { timeZone: RIYADH_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

/** تسجيل حضور/انصراف الحلاق — منفصل عن جلسة الصندوق عمدًا. */
export function AttendancePanel({ initialAttendance }: { initialAttendance: Attendance }) {
  const [attendance, setAttendance] = useState(initialAttendance);
  const [loading, setLoading] = useState(false);
  // كان النص واحدًا واللون أخضر دائمًا: «تعذر تسجيل الحضور» تُقرأ تأكيدًا.
  const { feedback, succeed, fail, clear } = useFeedback();

  async function toggle() {
    if (loading) return;
    setLoading(true);
    clear();
    const response = await safeFetch("/api/barber/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: attendance?.isOpen ? "check-out" : "check-in" }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      attendance?: { id: string; checkInAt: string; isOpen: boolean };
      message?: string;
    };

    if (response.ok && data.attendance) {
      setAttendance(data.attendance.isOpen ? data.attendance : null);
      succeed(data.attendance.isOpen ? "تم تسجيل الحضور" : "تم تسجيل الانصراف");
    } else {
      fail(data.message ?? "تعذر تسجيل الحضور");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-salon-line bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-salon-charcoal/70">الدوام</p>
          <p className="mt-0.5 text-sm font-bold">
            {attendance?.isOpen ? `داخل الدوام منذ ${timeFormatter.format(new Date(attendance.checkInAt))}` : "خارج الدوام"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={loading}
          className={`min-h-11 shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-95 disabled:opacity-55 ${
            attendance?.isOpen ? "bg-salon-mist text-salon-charcoal" : "bg-salon-forest text-white"
          }`}
        >
          {loading ? "جاري التسجيل..." : attendance?.isOpen ? "تسجيل انصراف" : "تسجيل حضور"}
        </button>
      </div>
      <FeedbackNote feedback={feedback} />
    </div>
  );
}
