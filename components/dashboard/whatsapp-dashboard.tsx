"use client";

import { FormEvent, useMemo, useState } from "react";

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
  const [status, setStatus] = useState("");
  const activeTemplates = useMemo(() => templates.filter((template) => template.isActive), [templates]);

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
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
      setStatus("تم حفظ القالب");
    } else {
      setStatus(data.message ?? "تعذر حفظ القالب");
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
      setStatus("تم تحديث القالب");
    } else {
      setStatus(data.message ?? "تعذر تحديث القالب");
    }
  }

  async function generateMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
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
      setStatus("تم تجهيز الرسالة. الإرسال يدوي فقط.");
      await refreshMessages();
    } else {
      setStatus(data.message ?? "تعذر تجهيز الرسالة");
    }
  }

  async function openWhatsApp(message: Pick<GeneratedMessage, "messageLogId" | "waUrl">) {
    const response = await fetch(`/api/dashboard/whatsapp/messages/${message.messageLogId}/opened`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { waUrl?: string; message?: MessageLog };
    if (response.ok) {
      window.open(data.waUrl ?? message.waUrl, "_blank", "noopener,noreferrer");
      await refreshMessages();
    } else {
      setStatus("تعذر تحديث حالة فتح واتساب");
    }
  }

  async function markSent(id: string) {
    const response = await fetch(`/api/dashboard/whatsapp/messages/${id}/mark-sent`, { method: "POST" });
    if (response.ok) {
      setStatus("تم تعليم الرسالة كمرسلة يدويًا");
      await refreshMessages();
    } else {
      setStatus("تعذر تعليم الرسالة كمرسلة");
    }
  }

  async function toggleWhatsapp(customerId: string, whatsappOptIn: boolean) {
    const response = await fetch(`/api/dashboard/customers/${customerId}/whatsapp-preference`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsappOptIn }),
    });
    setStatus(response.ok ? "تم تحديث تفضيل واتساب" : "تعذر تحديث تفضيل واتساب");
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
      setStatus(data.message ?? "تعذر تحميل جمهور الحملة");
    }
  }

  async function refreshMessages() {
    const response = await fetch("/api/dashboard/whatsapp/messages");
    const data = (await response.json().catch(() => ({}))) as { messages?: MessageLog[] };
    if (response.ok) setMessages(data.messages ?? []);
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-lg border border-salon-gold/40 bg-white p-4 text-sm text-salon-charcoal">
        الإرسال يتم يدويًا عبر واتساب. النظام يجهز الرسالة والرابط فقط، ولا يرسل تلقائيًا ولا يستخدم WhatsApp API.
      </div>
      {status ? <p className="rounded-lg border border-salon-line bg-white px-4 py-3 text-sm font-bold text-salon-charcoal">{status}</p> : null}

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={createTemplate} className="space-y-3 rounded-lg border border-salon-line bg-white p-5">
          <h2 className="text-xl font-bold">القوالب</h2>
          <input name="name" required placeholder="اسم القالب" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
          <select name="type" defaultValue="CUSTOM" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="POST_VISIT">بعد الزيارة</option>
            <option value="REWARD_READY">مكافأة جاهزة</option>
            <option value="CAMPAIGN">حملة</option>
            <option value="INACTIVE_CUSTOMER">عميل منقطع</option>
            <option value="CUSTOM">مخصص</option>
          </select>
          <textarea name="body" required rows={7} placeholder="نص القالب مع المتغيرات مثل {name} و {points}" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
          <button className="w-full rounded-md bg-salon-ink px-4 py-3 font-bold text-white">حفظ قالب</button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-salon-line bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-salon-mist text-salon-charcoal">
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
                      className={`rounded-md px-3 py-2 font-bold ${template.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
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
        <form onSubmit={generateMessage} className="space-y-3 rounded-lg border border-salon-line bg-white p-5">
          <h2 className="text-xl font-bold">إرسال رسالة لعميل</h2>
          <select name="customerId" defaultValue={prefillCustomerId ?? ""} required className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="">اختر العميل</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} - {customer.phone} - {customer.whatsappOptIn ? "واتساب مسموح" : "واتساب موقوف"}
              </option>
            ))}
          </select>
          <select name="templateId" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="">رسالة مخصصة بدون قالب</option>
            {activeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
          <select name="visitId" defaultValue={prefillVisitId ?? ""} className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="">بدون زيارة</option>
            {visits.map((visit) => <option key={visit.id} value={visit.id}>{visit.label}</option>)}
          </select>
          <select name="campaignId" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="">بدون حملة</option>
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
          <textarea name="customMessage" rows={4} placeholder="رسالة مخصصة اختيارية. يمكنك استخدام {name} و {salon_name}" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
          <button className="w-full rounded-md bg-salon-gold px-4 py-3 font-bold text-salon-ink">تجهيز الرسالة</button>
        </form>

        <div className="rounded-lg border border-salon-line bg-white p-5">
          <h2 className="text-xl font-bold">المعاينة</h2>
          {generated ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-salon-charcoal">{generated.customer.name} - {generated.phone}</p>
              <pre className="whitespace-pre-wrap rounded-lg bg-salon-mist p-4 text-sm leading-7">{generated.message}</pre>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => openWhatsApp(generated)} className="rounded-md bg-green-700 px-4 py-3 font-bold text-white">فتح واتساب</button>
                <button onClick={() => markSent(generated.messageLogId)} className="rounded-md bg-salon-ink px-4 py-3 font-bold text-white">تم الإرسال يدويًا</button>
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
        <div className="rounded-lg border border-salon-line bg-white p-5">
          <h2 className="text-xl font-bold">عملاء حملة</h2>
          <select onChange={(event) => loadCampaignAudience(event.currentTarget.value)} className="mt-3 w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="">اختر حملة</option>
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
          <AudienceList customers={campaignAudience} onToggle={toggleWhatsapp} />
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-salon-line bg-white">
        <div className="border-b border-salon-line p-5">
          <h2 className="text-xl font-bold">سجل الرسائل</h2>
        </div>
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-salon-mist text-salon-charcoal">
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
                    <button onClick={() => openWhatsApp({ messageLogId: message.id, waUrl: message.waUrl })} className="rounded-md bg-green-700 px-3 py-2 font-bold text-white">فتح</button>
                    <button onClick={() => markSent(message.id)} className="rounded-md bg-salon-ink px-3 py-2 font-bold text-white">تم الإرسال</button>
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
    <div className="rounded-lg border border-salon-line bg-white p-5">
      <h2 className="text-xl font-bold">{title}</h2>
      <AudienceList customers={customers} onToggle={onToggle} />
    </div>
  );
}

function AudienceList({ customers, onToggle }: { customers: AudienceCustomer[]; onToggle: (customerId: string, whatsappOptIn: boolean) => void }) {
  return (
    <div className="mt-3 max-h-[420px] space-y-3 overflow-auto">
      {customers.map((customer) => (
        <div key={customer.customerId} className="rounded-md border border-salon-line p-3 text-sm">
          <p className="font-bold">{customer.name}</p>
          <p className="text-salon-charcoal">{customer.phone}</p>
          <p className="text-salon-charcoal">النقاط: {customer.points} {customer.daysSinceLastVisit !== null ? `- منقطع ${customer.daysSinceLastVisit} يوم` : ""}</p>
          {customer.campaignName ? <p className="text-salon-charcoal">{customer.campaignName} - {customer.campaignDiscount}</p> : null}
          <button
            type="button"
            onClick={() => onToggle(customer.customerId, !customer.isWhatsappAllowed)}
            className={`mt-2 rounded-md px-3 py-2 font-bold ${customer.isWhatsappAllowed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
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
