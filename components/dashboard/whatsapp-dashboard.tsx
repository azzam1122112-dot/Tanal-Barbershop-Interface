"use client";

import { FormEvent, useMemo, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

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
  const activeTemplates = useMemo(() => templates.filter((template) => template.isActive), [templates]);

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
          <h2 className="text-xl font-black">القوالب</h2>
          <input name="name" required placeholder="اسم القالب" className="dashboard-field" />
          <select name="type" defaultValue="CUSTOM" className="dashboard-field">
            <option value="POST_VISIT">بعد الزيارة</option>
            <option value="REWARD_READY">مكافأة جاهزة</option>
            <option value="CAMPAIGN">حملة</option>
            <option value="INACTIVE_CUSTOMER">عميل منقطع</option>
            <option value="CUSTOM">مخصص</option>
          </select>
          <textarea name="body" required rows={7} placeholder="نص القالب مع المتغيرات مثل {name} و {points}" className="dashboard-field" />
          <button className="dashboard-button w-full">حفظ قالب</button>
        </form>

        <div className="dashboard-panel overflow-x-auto">
          <table className="dashboard-table min-w-[760px]">
            <thead>
              <tr>
                <th className="px-3 py-3 text-right">القالب</th>
                <th className="px-3 py-3 text-right">النوع</th>
                <th className="px-3 py-3 text-right">معاينة</th>
                <th className="px-3 py-3 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-salon-line">
              {templates.map((template) => (
                <tr key={template.id}>
                  <td className="px-3 py-3 font-bold">{template.name}</td>
                  <td className="px-3 py-3">{templateTypeLabel(template.type)}</td>
                  <td className="max-w-[420px] whitespace-pre-wrap px-3 py-3 text-salon-charcoal">{template.body}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => updateTemplate(template.id, { isActive: !template.isActive })}
                      className={`rounded-lg px-3 py-2 font-bold ${template.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                    >
                      {template.isActive ? "فعال" : "معطل"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={generateMessage} className="dashboard-panel space-y-3 p-5">
          <h2 className="text-xl font-black">إرسال رسالة لعميل</h2>
          <select name="customerId" defaultValue={prefillCustomerId ?? ""} required className="dashboard-field">
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
          <select name="visitId" defaultValue={prefillVisitId ?? ""} className="dashboard-field">
            <option value="">بدون زيارة</option>
            {visits.map((visit) => <option key={visit.id} value={visit.id}>{visit.label}</option>)}
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
        <table className="dashboard-table min-w-[960px]">
          <thead>
            <tr>
              <th className="px-3 py-3 text-right">التاريخ</th>
              <th className="px-3 py-3 text-right">العميل</th>
              <th className="px-3 py-3 text-right">القالب</th>
              <th className="px-3 py-3 text-right">الحالة</th>
              <th className="px-3 py-3 text-right">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-salon-line">
            {messages.map((message) => (
              <tr key={message.id}>
                <td className="px-3 py-3">{new Date(message.createdAt).toLocaleString("ar-SA")}</td>
                <td className="px-3 py-3">{message.customer.name}<br /><span className="text-salon-charcoal">{message.customer.phone}</span></td>
                <td className="px-3 py-3">{message.template?.name ?? "مخصص"}</td>
                <td className="px-3 py-3">{statusLabel(message.status)}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => openWhatsApp({ messageLogId: message.id, waUrl: message.waUrl })} className="rounded-lg bg-salon-forest px-3 py-2 font-bold text-white">فتح</button>
                    <button onClick={() => markSent(message.id)} className="dashboard-button px-3 py-2">تم الإرسال</button>
                  </div>
                </td>
              </tr>
            ))}
            {messages.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-salon-charcoal">لا توجد رسائل</td></tr> : null}
          </tbody>
        </table>
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
          {customer.campaignName ? <p className="text-salon-charcoal">{customer.campaignName} - {customer.campaignDiscount}</p> : null}
          <button
            type="button"
            onClick={() => onToggle(customer.customerId, !customer.isWhatsappAllowed)}
            className={`mt-2 rounded-lg px-3 py-2 font-bold ${customer.isWhatsappAllowed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
          >
            {customer.isWhatsappAllowed ? "واتساب مسموح" : "واتساب موقوف"}
          </button>
        </div>
      ))}
      {customers.length === 0 ? <p className="py-6 text-center text-sm text-salon-charcoal">لا توجد نتائج</p> : null}
    </div>
  );
}

function templateTypeLabel(type: TemplateType) {
  const labels: Record<TemplateType, string> = {
    POST_VISIT: "بعد الزيارة",
    REWARD_READY: "مكافأة جاهزة",
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
