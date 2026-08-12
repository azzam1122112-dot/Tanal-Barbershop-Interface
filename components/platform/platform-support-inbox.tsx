"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

type Status = "OPEN" | "PENDING" | "RESOLVED" | "SPAM";
type Priority = "NORMAL" | "HIGH" | "URGENT";
type Admin = { id: string; name: string };
type Attachment = { id: string; filename: string; contentType: string; size: number | null };
type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  createdAt: string;
  sentByAdmin: Admin | null;
  attachments: Attachment[];
};
type Conversation = {
  id: string;
  participantEmail: string;
  participantName: string | null;
  subject: string;
  status: Status;
  priority: Priority;
  unreadCount: number;
  lastMessageAt: string;
  assignedAdminId: string | null;
  assignedAdmin: Admin | null;
  messages: Message[];
};
type InboxData = {
  admins: Admin[];
  stats: { open: number; pending: number; resolved: number; unread: number };
  conversations: Conversation[];
};

const STATUS_COPY: Record<Status, { label: string; tone: string }> = {
  OPEN: { label: "مفتوحة", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  PENDING: { label: "بانتظار العميل", tone: "border-blue-200 bg-blue-50 text-blue-900" },
  RESOLVED: { label: "تم الحل", tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  SPAM: { label: "مزعجة", tone: "border-slate-200 bg-slate-100 text-slate-700" },
};
const PRIORITY_COPY: Record<Priority, string> = { NORMAL: "عادية", HIGH: "عالية", URGENT: "عاجلة" };

export function PlatformSupportInbox({ initialData }: { initialData: InboxData }) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialData.conversations);
  const [selectedId, setSelectedId] = useState(initialData.conversations[0]?.id ?? null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConversations(initialData.conversations);
    setSelectedId((current) => current && initialData.conversations.some((item) => item.id === current)
      ? current
      : initialData.conversations[0]?.id ?? null);
  }, [initialData]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filter !== "ALL" && conversation.status !== filter) return false;
      if (!normalized) return true;
      return [conversation.subject, conversation.participantName ?? "", conversation.participantEmail]
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }, [conversations, filter, query]);

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  async function selectConversation(conversation: Conversation) {
    setSelectedId(conversation.id);
    setMobileDetailOpen(true);
    setReply("");
    setError(null);
    setNotice(null);
    if (conversation.unreadCount > 0) {
      await patchConversation(conversation.id, { markRead: true }, false);
      router.refresh();
    }
  }

  async function patchConversation(id: string, patch: Record<string, unknown>, refresh = true) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/platform/support/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json() as { message?: string; conversation?: Partial<Conversation> };
      if (!response.ok || !payload.conversation) throw new Error(payload.message ?? "تعذر تحديث المحادثة");
      setConversations((items) => items.map((item) => item.id === id ? { ...item, ...payload.conversation } : item));
      if (refresh) setNotice("تم حفظ التعديل");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث المحادثة");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!selected || reply.trim().length < 2) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/platform/support/conversations/${selected.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply }),
      });
      const payload = await response.json() as { notice?: string; message?: string | { id: string } };
      if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "تعذر إرسال الرد");
      setReply("");
      setNotice(payload.notice ?? "تم إرسال الرد للعميل");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إرسال الرد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-panel mt-5 overflow-hidden">
      <div className="grid min-h-[680px] xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className={`${mobileDetailOpen ? "hidden xl:block" : "block"} border-b border-salon-line bg-[#fbfaf7] xl:border-b-0 xl:border-l`}>
          <div className="space-y-3 border-b border-salon-line p-4">
            <label className="relative block">
              <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-salon-charcoal/55"><Icon name="search" className="h-4 w-4" /></span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو البريد أو العنوان" className="dashboard-field w-full pr-10" />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(["ALL", "OPEN", "PENDING", "RESOLVED", "SPAM"] as const).map((item) => (
                <button key={item} type="button" onClick={() => setFilter(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${filter === item ? "border-salon-ink bg-salon-ink text-white" : "border-salon-line bg-white text-salon-charcoal"}`}>
                  {item === "ALL" ? "الكل" : STATUS_COPY[item].label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[590px] overflow-y-auto">
            {visible.map((conversation) => {
              const active = conversation.id === selectedId;
              const lastMessage = conversation.messages.at(-1);
              return (
                <button key={conversation.id} type="button" onClick={() => void selectConversation(conversation)} className={`relative block w-full border-b border-salon-line/70 px-4 py-4 text-right transition ${active ? "bg-white shadow-[inset_-3px_0_0_#b99455]" : "hover:bg-white/80"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${conversation.unreadCount ? "font-black text-salon-ink" : "font-bold text-salon-charcoal"}`}>{conversation.participantName || conversation.participantEmail}</p>
                      {conversation.participantName ? <p className="mt-0.5 truncate text-[11px] font-semibold text-salon-charcoal/55" dir="ltr">{conversation.participantEmail}</p> : null}
                    </div>
                    <time className="shrink-0 text-[10px] font-semibold text-salon-charcoal/55">{relativeTime(conversation.lastMessageAt)}</time>
                  </div>
                  <p className="mt-2 truncate text-xs font-bold text-salon-ink">{conversation.subject}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-salon-charcoal/65">{lastMessage?.bodyText ?? "لا يوجد محتوى"}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <StatusBadge status={conversation.status} />
                    {conversation.priority !== "NORMAL" ? <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">{PRIORITY_COPY[conversation.priority]}</span> : null}
                    {conversation.unreadCount ? <span className="mr-auto grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">{conversation.unreadCount}</span> : null}
                  </div>
                </button>
              );
            })}
            {visible.length === 0 ? <div className="px-5 py-16 text-center"><p className="font-bold text-salon-ink">لا توجد محادثات مطابقة</p><p className="mt-2 text-xs text-salon-charcoal/60">ستظهر رسائل العملاء هنا فور وصولها.</p></div> : null}
          </div>
        </aside>

        {selected ? (
          <div className={`${mobileDetailOpen ? "flex" : "hidden xl:flex"} min-w-0 flex-col bg-white`}>
            <header className="border-b border-salon-line px-5 py-4">
              <button type="button" onClick={() => setMobileDetailOpen(false)} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-salon-line bg-white px-3 py-2 text-xs font-bold text-salon-ink xl:hidden">
                <span aria-hidden="true">→</span> العودة إلى الرسائل
              </button>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={selected.status} /><span className="text-[11px] font-semibold text-salon-charcoal/55">#{selected.id.slice(-8)}</span></div>
                  <h2 className="mt-2 text-xl font-black text-salon-ink">{selected.subject}</h2>
                  <p className="mt-1 text-sm font-semibold text-salon-charcoal/65">{selected.participantName || "عميل"} · <span dir="ltr">{selected.participantEmail}</span></p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <CompactSelect label="الحالة" value={selected.status} disabled={busy} onChange={(value) => void patchConversation(selected.id, { status: value })} options={Object.entries(STATUS_COPY).map(([value, copy]) => ({ value, label: copy.label }))} />
                  <CompactSelect label="الأولوية" value={selected.priority} disabled={busy} onChange={(value) => void patchConversation(selected.id, { priority: value })} options={Object.entries(PRIORITY_COPY).map(([value, label]) => ({ value, label }))} />
                  <CompactSelect label="المسؤول" value={selected.assignedAdminId ?? ""} disabled={busy} onChange={(value) => void patchConversation(selected.id, { assignedAdminId: value || null })} options={[{ value: "", label: "غير معيّن" }, ...initialData.admins.map((admin) => ({ value: admin.id, label: admin.name }))]} />
                </div>
              </div>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto bg-[#f7f5ef] px-4 py-5 sm:px-6">
              {selected.messages.map((message) => {
                const outbound = message.direction === "OUTBOUND";
                return (
                  <article key={message.id} className={`flex ${outbound ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[88%] rounded-2xl border px-4 py-3 shadow-sm sm:max-w-[75%] ${outbound ? "border-salon-ink bg-salon-ink text-white" : "border-salon-line bg-white text-salon-ink"}`}>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
                        <span className={outbound ? "text-salon-goldlight" : "text-salon-gold"}>{outbound ? message.sentByAdmin?.name ?? "فريق إكس مانس إكس XMANSX" : selected.participantName ?? selected.participantEmail}</span>
                        <time className={outbound ? "text-white/45" : "text-salon-charcoal/45"}>{fullDate(message.createdAt)}</time>
                      </div>
                      <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-7 ${outbound ? "text-white/90" : "text-salon-charcoal"}`}>{message.bodyText}</p>
                      {message.attachments.length ? (
                        <div className={`mt-3 space-y-2 border-t pt-3 ${outbound ? "border-white/10" : "border-salon-line"}`}>
                          {message.attachments.map((attachment) => (
                            <a key={attachment.id} href={`/api/platform/support/messages/${message.id}/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs font-bold ${outbound ? "bg-white/10 text-white" : "bg-salon-mist text-salon-ink"}`}>
                              <span className="truncate">{attachment.filename}</span><span className="shrink-0 opacity-60">{formatBytes(attachment.size)}</span>
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>

            <footer className="border-t border-salon-line bg-white p-4 sm:p-5">
              {notice ? <p role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{notice}</p> : null}
              {error ? <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{error}</p> : null}
              <label className="block">
                <span className="sr-only">نص الرد</span>
                <textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={4} maxLength={10_000} disabled={busy || selected.status === "SPAM"} placeholder={selected.status === "SPAM" ? "أخرج المحادثة من الرسائل المزعجة للرد" : "اكتب ردًا واضحًا واحترافيًا..."} className="dashboard-field w-full resize-y leading-7" />
              </label>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-semibold text-salon-charcoal/55">سيُرسل من إكس مانس إكس XMANSX ويستقبل رد العميل في المحادثة نفسها.</p>
                <button type="button" onClick={() => void sendReply()} disabled={busy || reply.trim().length < 2 || selected.status === "SPAM"} className="dashboard-button-gold min-w-32 px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">{busy ? "جارٍ التنفيذ..." : "إرسال الرد"}</button>
              </div>
            </footer>
          </div>
        ) : (
          <div className="grid min-h-[520px] place-items-center bg-white px-6 text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-salon-mist text-salon-gold"><Icon name="bell" className="h-7 w-7" /></span><h2 className="mt-4 text-xl font-black">اختر محادثة</h2><p className="mt-2 text-sm text-salon-charcoal/65">ستظهر تفاصيل الرسالة والردود هنا.</p></div></div>
        )}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const copy = STATUS_COPY[status];
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${copy.tone}`}>{copy.label}</span>;
}

function CompactSelect({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled: boolean }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-bold text-salon-charcoal/55">{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="dashboard-field min-w-32 py-2 text-xs font-bold">{options.map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}</select></label>;
}

function relativeTime(value: string) {
  const diffMinutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("ar-SA-u-nu-latn", { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  const hours = Math.round(diffMinutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function fullDate(value: string) {
  return new Date(value).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
}

function formatBytes(value: number | null) {
  if (value === null) return "مرفق";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
