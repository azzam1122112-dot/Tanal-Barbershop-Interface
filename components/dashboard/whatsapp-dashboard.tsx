"use client";

import { FormEvent, useMemo, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { ManagerRewardButton } from "@/components/dashboard/manager-reward-button";

type TemplateType = "POST_VISIT" | "REWARD_READY" | "CAMPAIGN" | "INACTIVE_CUSTOMER" | "CUSTOM";
type MessageStatus = "DRAFTED" | "OPENED" | "MARKED_SENT" | "SKIPPED" | "FAILED";

type Template = {
  id: string;
  name: string;
  type: TemplateType;
  body: string;
  isActive: boolean;
};

type CustomerOption = {
  id: string;
  name: string;
  phone: string;
  pointsBalance: number;
  whatsappOptIn: boolean;
};

type VisitOption = {
  id: string;
  customerId: string;
  label: string;
};

type CampaignOption = {
  id: string;
  name: string;
};

type AudienceCustomer = {
  customerId: string;
  name: string;
  phone: string;
  points: number;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  isWhatsappAllowed: boolean;
  campaignName?: string;
  campaignDiscount?: string;
  managerRewardTitle?: string;
  managerRewardDiscount?: number;
  managerRewardExpiresAt?: string | null;
};

type MessageLog = {
  id: string;
  customer: { id: string; name: string; phone: string };
  template: { id: string; name: string; type: TemplateType } | null;
  campaign: { id: string; name: string } | null;
  phone: string;
  message: string;
  waUrl: string;
  status: MessageStatus;
  createdAt: string;
};

type GeneratedMessage = {
  messageLogId: string;
  customer: { id: string; name: string; phone: string };
  phone: string;
  message: string;
  waUrl: string;
  status: MessageStatus;
};

const TEMPLATE_TYPE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: "POST_VISIT", label: "بعد الزيارة" },
  { value: "REWARD_READY", label: "مكافأة نقاط جاهزة" },
  { value: "CAMPAIGN", label: "حملة" },
  { value: "INACTIVE_CUSTOMER", label: "عميل منقطع" },
  { value: "CUSTOM", label: "مخصص" },
];

const TEMPLATE_VARIABLES: { token: string; label: string }[] = [
  { token: "{name}", label: "اسم العميل" },
  { token: "{salon_name}", label: "اسم الصالون" },
  { token: "{points}", label: "رصيد النقاط" },
  { token: "{reward_discount}", label: "قيمة الخصم" },
  { token: "{visit_net_amount}", label: "مبلغ الزيارة" },
  { token: "{visit_points_earned}", label: "نقاط الزيارة" },
  { token: "{campaign_name}", label: "اسم الحملة" },
  { token: "{campaign_discount}", label: "خصم الحملة" },
  { token: "{days_since_last_visit}", label: "أيام الانقطاع" },
  { token: "{last_visit}", label: "تاريخ آخر زيارة" },
];

export function WhatsAppDashboard({
  initialTemplates,
  initialMessages,
  customers,
  visits,
  campaigns,
  inactiveAudience,
  rewardAudience,
  prefillCustomerId,
  prefillVisitId,
}: {
  initialTemplates: Template[];
  initialMessages: MessageLog[];
  customers: CustomerOption[];
  visits: VisitOption[];
  campaigns: CampaignOption[];
  inactiveAudience: AudienceCustomer[];
  rewardAudience: AudienceCustomer[];
  prefillCustomerId?: string;
  prefillVisitId?: string;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [messages, setMessages] = useState(initialMessages);
  const [generated, setGenerated] = useState<GeneratedMessage | null>(null);
  const [campaignAudience, setCampaignAudience] = useState<AudienceCustomer[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(prefillCustomerId ?? "");
  const [selectedVisitId, setSelectedVisitId] = useState(prefillVisitId ?? "");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<{ name: string; type: TemplateType; body: string }>({
    name: "",
    type: "CUSTOM",
    body: "",
  });
  const [restoring, setRestoring] = useState(false);
  const activeTemplates = useMemo(() => templates.filter((template) => template.isActive), [templates]);
  const customerVisits = useMemo(
    () => visits.filter((visit) => visit.customerId === selectedCustomerId),
    [visits, selectedCustomerId],
  );

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setToast(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/dashboard/whatsapp/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        type: form.get("type"),
        body: form.get("body"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { template?: Template; message?: string };
    if (response.ok && data.template) {
      setTemplates((current) => [data.template!, ...current]);
      event.currentTarget.reset();
      setToast({ message: "تم حفظ القالب بنجاح", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر حفظ القالب", tone: "error" });
    }
  }

  async function updateTemplate(id: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/dashboard/whatsapp/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { template?: Template; message?: string };
    if (response.ok && data.template) {
      setTemplates((current) => current.map((template) => (template.id === id ? data.template! : template)));
      setToast({ message: "تم تحديث القالب", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث القالب", tone: "error" });
    }
  }

  function startTemplateEdit(template: Template) {
    setEditingTemplateId(template.id);
    setTemplateDraft({ name: template.name, type: template.type, body: template.body });
  }

  async function saveTemplateEdit(id: string) {
    await updateTemplate(id, {
      name: templateDraft.name,
      type: templateDraft.type,
      body: templateDraft.body,
    });
    setEditingTemplateId(null);
  }

  async function restoreDefaults() {
    setRestoring(true);
    setToast(null);
    const response = await fetch("/api/dashboard/whatsapp/templates/restore-defaults", { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { created?: number; templates?: Template[]; message?: string };
    if (response.ok && data.templates) {
      setTemplates(data.templates);
      setToast({
        message: data.created ? `تمت إضافة ${data.created} قالبًا احترافيًا` : "القوالب الاحترافية موجودة مسبقًا",
        tone: "success",
      });
    } else {
      setToast({ message: data.message ?? "تعذر استعادة القوالب", tone: "error" });
    }
    setRestoring(false);
  }

  async function generateMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setToast(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      customerId: form.get("customerId"),
      templateId: form.get("templateId") || undefined,
      visitId: form.get("visitId") || undefined,
      campaignId: form.get("campaignId") || undefined,
      customMessage: form.get("customMessage") || undefined,
    };
    const response = await fetch("/api/dashboard/whatsapp/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as GeneratedMessage & { message?: string };
    if (response.ok && data.messageLogId) {
      setGenerated(data);
      setToast({ message: "تم تجهيز الرسالة. الإرسال يدوي فقط.", tone: "success" });
      await refreshMessages();
    } else {
      setToast({ message: data.message ?? "تعذر تجهيز الرسالة", tone: "error" });
    }
  }

  async function openWhatsApp(message: Pick<GeneratedMessage, "messageLogId" | "waUrl">) {
    const response = await fetch(`/api/dashboard/whatsapp/messages/${message.messageLogId}/opened`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { waUrl?: string; message?: MessageLog };
    if (response.ok) {
      window.open(data.waUrl ?? message.waUrl, "_blank", "noopener,noreferrer");
      await refreshMessages();
    } else {
      setToast({ message: "تعذر تحديث حالة فتح واتساب", tone: "error" });
    }
  }

  async function markSent(id: string) {
    const response = await fetch(`/api/dashboard/whatsapp/messages/${id}/mark-sent`, { method: "POST" });
    if (response.ok) {
      setToast({ message: "تم تعليم الرسالة كمرسلة يدويًا", tone: "success" });
      await refreshMessages();
    } else {
      setToast({ message: "تعذر تعليم الرسالة كمرسلة", tone: "error" });
    }
  }

  async function toggleWhatsapp(customerId: string, whatsappOptIn: boolean) {
    const response = await fetch(`/api/dashboard/customers/${customerId}/whatsapp-preference`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsappOptIn }),
    });
    setToast(response.ok ? { message: "تم تحديث تفضيل واتساب", tone: "success" } : { message: "تعذر تحديث تفضيل واتساب", tone: "error" });
  }

  async function loadCampaignAudience(campaignId: string) {
    if (!campaignId) {
      setCampaignAudience([]);
      return;
    }
    const response = await fetch(`/api/dashboard/whatsapp/audiences/campaign/${campaignId}`);
    const data = (await response.json().catch(() => ({}))) as { customers?: AudienceCustomer[]; message?: string };
    if (response.ok) {
      setCampaignAudience(data.customers ?? []);
    } else {
      setToast({ message: data.message ?? "تعذر تحميل جمهور الحملة", tone: "error" });
    }
  }

  async function refreshMessages() {
    const response = await fetch("/api/dashboard/whatsapp/messages");
    const data = (await response.json().catch(() => ({}))) as { messages?: MessageLog[] };
    if (response.ok) setMessages(data.messages ?? []);
  }

  return (
    <div className="mt-8 space-y-6">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="rounded-lg border border-salon-gold/40 bg-white p-4 text-sm text-salon-charcoal">
        الإرسال يتم يدويًا عبر واتساب. النظام يجهز الرسالة والرابط فقط، ولا يرسل تلقائيًا ولا يستخدم WhatsApp API.
      </div>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={createTemplate} className="dashboard-panel space-y-3 p-5">
          <h2 className="text-xl font-black">إضافة قالب جديد</h2>
          <input name="name" required placeholder="اسم القالب" className="dashboard-field" />
          <select name="type" defaultValue="CUSTOM" className="dashboard-field">
            {TEMPLATE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <textarea name="body" required rows={7} placeholder="اكتب نص الرسالة هنا، واستخدم المتغيّرات بالأسفل…" className="dashboard-field" />
          <div className="rounded-lg border border-salon-line bg-salon-mist p-3">
            <p className="mb-2 text-xs font-black text-salon-charcoal">المتغيّرات المتاحة (تُستبدل تلقائيًا):</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARIABLES.map((variable) => (
                <span key={variable.token} dir="ltr" title={variable.label} className="rounded-md border border-salon-line bg-white px-2 py-1 text-[11px] font-bold text-salon-charcoal">
                  {variable.token}
                </span>
              ))}
            </div>
          </div>
          <button className="dashboard-button w-full">حفظ القالب</button>
        </form>

        <div className="dashboard-panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black">القوالب الحالية</h2>
            <button
              type="button"
              onClick={restoreDefaults}
              disabled={restoring}
              className="dashboard-button-soft px-3 py-2 text-sm disabled:opacity-60"
            >
              {restoring ? "جاري الاستعادة..." : "استعادة القوالب الاحترافية"}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((template) => {
              const isEditing = editingTemplateId === template.id;
              return (
                <article key={template.id} className="rounded-xl border border-salon-line bg-white p-4">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        value={templateDraft.name}
                        onChange={(event) => setTemplateDraft((draft) => ({ ...draft, name: event.target.value }))}
                        placeholder="اسم القالب"
                        className="dashboard-field py-2"
                      />
                      <select
                        value={templateDraft.type}
                        onChange={(event) => setTemplateDraft((draft) => ({ ...draft, type: event.target.value as TemplateType }))}
                        className="dashboard-field py-2"
                      >
                        {TEMPLATE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <textarea
                        value={templateDraft.body}
                        onChange={(event) => setTemplateDraft((draft) => ({ ...draft, body: event.target.value }))}
                        rows={8}
                        className="dashboard-field"
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => saveTemplateEdit(template.id)} className="dashboard-button px-3 py-2 text-sm">حفظ</button>
                        <button type="button" onClick={() => setEditingTemplateId(null)} className="dashboard-button-soft px-3 py-2 text-sm">إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-black">{template.name}</p>
                          <span className="text-xs font-bold text-salon-gold">{templateTypeLabel(template.type)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateTemplate(template.id, { isActive: !template.isActive })}
                          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${template.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                        >
                          {template.isActive ? "فعال" : "معطل"}
                        </button>
                      </div>
                      <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-salon-mist p-3 text-sm leading-7 text-salon-charcoal">{template.body}</pre>
                      <button type="button" onClick={() => startTemplateEdit(template)} className="dashboard-button-soft mt-3 w-full px-3 py-2 text-sm">تعديل القالب</button>
                    </>
                  )}
                </article>
              );
            })}
            {templates.length === 0 ? (
              <div className="md:col-span-2 rounded-xl border border-dashed border-salon-line bg-salon-mist p-6 text-center">
                <p className="font-black">لا توجد قوالب بعد</p>
                <p className="dashboard-muted mt-1 text-sm">اضغط «استعادة القوالب الاحترافية» لإضافة قوالب جاهزة قابلة للتعديل.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={generateMessage} className="dashboard-panel space-y-3 p-5">
          <h2 className="text-xl font-black">إرسال رسالة لعميل</h2>
          <select
            name="customerId"
            value={selectedCustomerId}
            onChange={(event) => {
              setSelectedCustomerId(event.target.value);
              setSelectedVisitId("");
            }}
            required
            className="dashboard-field"
          >
            <option value="">اختر العميل</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} - {customer.phone} - {customer.whatsappOptIn ? "واتساب مسموح" : "واتساب موقوف"}
              </option>
            ))}
          </select>
          <select name="templateId" className="dashboard-field">
            <option value="">رسالة مخصصة بدون قالب</option>
            {activeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
          <select
            name="visitId"
            value={selectedVisitId}
            onChange={(event) => setSelectedVisitId(event.target.value)}
            disabled={!selectedCustomerId}
            className="dashboard-field disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">
              {!selectedCustomerId ? "اختر العميل أولًا" : customerVisits.length === 0 ? "لا توجد زيارات لهذا العميل" : "بدون زيارة"}
            </option>
            {customerVisits.map((visit) => <option key={visit.id} value={visit.id}>{visit.label}</option>)}
          </select>
          <select name="campaignId" className="dashboard-field">
            <option value="">بدون حملة</option>
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
          <textarea name="customMessage" rows={4} placeholder="رسالة مخصصة اختيارية. يمكنك استخدام {name} و {salon_name}" className="dashboard-field" />
          <button className="dashboard-button-gold w-full">تجهيز الرسالة</button>
        </form>

        <div className="dashboard-panel p-5">
          <h2 className="text-xl font-black">المعاينة</h2>
          {generated ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-salon-charcoal">{generated.customer.name} - {generated.phone}</p>
              <pre className="whitespace-pre-wrap rounded-lg border border-salon-line bg-salon-mist p-4 text-sm leading-7">{generated.message}</pre>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => openWhatsApp(generated)} className="rounded-lg bg-salon-forest px-4 py-3 font-bold text-white">فتح واتساب</button>
                <button onClick={() => markSent(generated.messageLogId)} className="dashboard-button">تم الإرسال يدويًا</button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-salon-charcoal">اختر العميل والقالب ثم جهز الرسالة.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <AudienceCard title="العملاء المنقطعون" customers={inactiveAudience} onToggle={toggleWhatsapp} />
        <AudienceCard title="لديهم مكافأة" customers={rewardAudience} onToggle={toggleWhatsapp} />
        <div className="dashboard-panel p-5">
          <h2 className="text-xl font-black">عملاء حملة</h2>
          <select onChange={(event) => loadCampaignAudience(event.currentTarget.value)} className="dashboard-field mt-3">
            <option value="">اختر حملة</option>
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
          <AudienceList customers={campaignAudience} onToggle={toggleWhatsapp} />
        </div>
      </section>

      <section className="dashboard-panel overflow-x-auto">
        <div className="border-b border-salon-line p-5">
          <h2 className="text-xl font-black">سجل الرسائل</h2>
        </div>
        <div className="hidden grid-cols-[180px_1fr_140px_140px_200px] gap-3 border-b border-salon-line px-4 py-3 text-sm font-bold text-salon-charcoal lg:grid">
          <span>التاريخ</span>
          <span>العميل</span>
          <span>القالب</span>
          <span>الحالة</span>
          <span>إجراء</span>
        </div>
        <div className="divide-y divide-salon-line">
          {messages.map((message) => (
            <div
              key={message.id}
              className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-sm lg:grid-cols-[180px_1fr_140px_140px_200px] lg:items-center lg:gap-3"
            >
              <MessageCell label="التاريخ">{new Date(message.createdAt).toLocaleString("ar-SA")}</MessageCell>
              <MessageCell label="العميل">
                {message.customer.name}<br /><span className="text-salon-charcoal">{message.customer.phone}</span>
              </MessageCell>
              <MessageCell label="القالب">{message.template?.name ?? "مخصص"}</MessageCell>
              <MessageCell label="الحالة">{statusLabel(message.status)}</MessageCell>
              <div className="col-span-2 grid gap-1 lg:col-span-1 lg:block">
                <span className="text-xs font-bold text-salon-charcoal lg:hidden">إجراء</span>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => openWhatsApp({ messageLogId: message.id, waUrl: message.waUrl })} className="rounded-lg bg-salon-forest px-3 py-2 font-bold text-white">فتح</button>
                  <button onClick={() => markSent(message.id)} className="dashboard-button px-3 py-2">تم الإرسال</button>
                </div>
              </div>
            </div>
          ))}
          {messages.length === 0 ? <p className="px-4 py-8 text-center text-salon-charcoal">لا توجد رسائل</p> : null}
        </div>
      </section>
    </div>
  );
}

function AudienceCard({ title, customers, onToggle }: { title: string; customers: AudienceCustomer[]; onToggle: (customerId: string, whatsappOptIn: boolean) => void }) {
  return (
    <div className="dashboard-panel p-5">
      <h2 className="text-xl font-black">{title}</h2>
      <AudienceList customers={customers} onToggle={onToggle} />
    </div>
  );
}

function AudienceList({ customers, onToggle }: { customers: AudienceCustomer[]; onToggle: (customerId: string, whatsappOptIn: boolean) => void }) {
  return (
    <div className="mt-3 max-h-[420px] space-y-3 overflow-auto">
      {customers.map((customer) => (
        <div key={customer.customerId} className="rounded-lg border border-salon-line bg-white/80 p-3 text-sm">
          <p className="font-bold">{customer.name}</p>
          <p className="text-salon-charcoal">{customer.phone}</p>
          <p className="text-salon-charcoal">النقاط: {customer.points} {customer.daysSinceLastVisit !== null ? `- منقطع ${customer.daysSinceLastVisit} يوم` : ""}</p>
          {customer.managerRewardTitle ? (
            <p className="text-salon-charcoal">
              مكافأة الإدارة: {customer.managerRewardTitle} - {customer.managerRewardDiscount} ريال
            </p>
          ) : null}
          {customer.campaignName ? <p className="text-salon-charcoal">{customer.campaignName} - {customer.campaignDiscount}</p> : null}
          <button
            type="button"
            onClick={() => onToggle(customer.customerId, !customer.isWhatsappAllowed)}
            className={`mt-2 rounded-lg px-3 py-2 font-bold ${customer.isWhatsappAllowed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
          >
            {customer.isWhatsappAllowed ? "واتساب مسموح" : "واتساب موقوف"}
          </button>
          <div className="mt-2">
            <ManagerRewardButton customerId={customer.customerId} customerName={customer.name} />
          </div>
        </div>
      ))}
      {customers.length === 0 ? <p className="py-6 text-center text-sm text-salon-charcoal">لا توجد نتائج</p> : null}
    </div>
  );
}

function MessageCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 lg:block">
      <span className="text-xs font-bold text-salon-charcoal lg:hidden">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function templateTypeLabel(type: TemplateType) {
  const labels: Record<TemplateType, string> = {
    POST_VISIT: "بعد الزيارة",
    REWARD_READY: "مكافأة نقاط جاهزة",
    CAMPAIGN: "حملة",
    INACTIVE_CUSTOMER: "عميل منقطع",
    CUSTOM: "مخصص",
  };
  return labels[type];
}

function statusLabel(status: MessageStatus) {
  const labels: Record<MessageStatus, string> = {
    DRAFTED: "مجهزة",
    OPENED: "تم فتح الرابط",
    MARKED_SENT: "تم تعليمها كمرسلة",
    SKIPPED: "تم التخطي",
    FAILED: "فشلت",
  };
  return labels[status];
}
