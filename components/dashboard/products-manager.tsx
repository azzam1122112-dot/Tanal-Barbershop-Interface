"use client";

import { FormEvent, useState } from "react";
import { formatMoney } from "@/lib/format";
import { safeFetch } from "@/lib/http/safe-fetch";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { InlineEmpty } from "@/components/dashboard/ui";
type Product = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  costPrice: number | null;
  stockQuantity: number;
  lowStockThreshold: number;
  commissionRate: number | null;
  isActive: boolean;
  salon: { id: string; name: string };
  isLowStock: boolean;
};

type SalonOption = { id: string; name: string };

const MOVEMENT_TYPES = [
  { value: "PURCHASE", label: "توريد (+)", sign: 1 },
  { value: "RETURN", label: "إرجاع (+)", sign: 1 },
  { value: "WASTE", label: "تالف (−)", sign: -1 },
  { value: "ADJUSTMENT", label: "جرد/تسوية", sign: 1 },
] as const;

export function ProductsManager({
  initialProducts,
  salons,
  defaultSalonId,
}: {
  initialProducts: Product[];
  salons: SalonOption[];
  defaultSalonId: string | null;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [stockFormId, setStockFormId] = useState<string | null>(null);

  const lowStock = products.filter((product) => product.isActive && product.isLowStock);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);

    const response = await safeFetch("/api/dashboard/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salonId: form.get("salonId"),
        name: form.get("name"),
        sku: form.get("sku") || null,
        price: form.get("price"),
        costPrice: form.get("costPrice") || null,
        stockQuantity: form.get("stockQuantity") || 0,
        lowStockThreshold: form.get("lowStockThreshold") || 3,
        commissionRate: form.get("commissionRate") || null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { product?: Product; message?: string };

    if (response.ok && data.product) {
      setProducts((current) => [data.product!, ...current]);
      formEl.reset();
      setToast({ message: "تم إضافة المنتج", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر حفظ المنتج", tone: "error" });
    }
    setLoading(false);
  }

  async function patchProduct(product: Product, body: Record<string, unknown>, successMessage?: string) {
    setPendingId(product.id);
    setToast(null);
    const response = await safeFetch(`/api/dashboard/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { product?: Product; message?: string };

    if (response.ok && data.product) {
      setProducts((current) => current.map((item) => (item.id === product.id ? data.product! : item)));
      setToast({ message: successMessage ?? "تم تحديث المنتج", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث المنتج", tone: "error" });
    }
    setPendingId(null);
  }

  async function submitStock(event: FormEvent<HTMLFormElement>, product: Product) {
    event.preventDefault();
    setPendingId(product.id);
    setToast(null);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const type = String(form.get("type"));
    const raw = Math.abs(Number(form.get("quantity")) || 0);
    const sign = MOVEMENT_TYPES.find((item) => item.value === type)?.sign ?? 1;
    // «جرد/تسوية» يقبل الإشارة كما أدخلها المستخدم؛ الباقي محدّد الاتجاه.
    const quantity = type === "ADJUSTMENT" ? Number(form.get("quantity")) : raw * sign;

    const response = await safeFetch(`/api/dashboard/products/${product.id}/stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, quantity, reason: form.get("reason") || null }),
    });
    const data = (await response.json().catch(() => ({}))) as { product?: Product; message?: string };

    if (response.ok && data.product) {
      setProducts((current) => current.map((item) => (item.id === product.id ? data.product! : item)));
      setStockFormId(null);
      setToast({ message: "تم تحديث المخزون", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث المخزون", tone: "error" });
    }
    setPendingId(null);
  }

  return (
    <div className="mt-6 space-y-6">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      {lowStock.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
          <p className="text-sm font-bold">{lowStock.length} منتج يحتاج إعادة طلب</p>
          <p className="mt-1 text-sm font-medium">
            {lowStock.map((product) => `${product.name} (${product.stockQuantity})`).join("، ")}
          </p>
        </div>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[360px_1fr]">
        <form onSubmit={createProduct} className="dashboard-panel h-fit space-y-3 p-5">
          <h2 className="text-lg font-bold tracking-tight">إضافة منتج</h2>
          {salons.length > 1 ? (
            <label className="block text-sm font-semibold">
              الفرع
              <select name="salonId" defaultValue={defaultSalonId ?? salons[0]?.id} className="dashboard-field mt-2">
                {salons.map((salon) => (
                  <option key={salon.id} value={salon.id}>
                    {salon.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="salonId" value={defaultSalonId ?? salons[0]?.id ?? ""} />
          )}
          <label className="block text-sm font-semibold">
            اسم المنتج
            <input name="name" required className="dashboard-field mt-2" placeholder="مثال: واكس تثبيت" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">
              سعر البيع
              <input lang="en" name="price" type="number" min={0.5} step="0.5" required className="dashboard-field mt-2" />
            </label>
            <label className="block text-sm font-semibold">
              سعر التكلفة
              <input lang="en" name="costPrice" type="number" min={0} step="0.5" className="dashboard-field mt-2" placeholder="اختياري" />
            </label>
            <label className="block text-sm font-semibold">
              الكمية الافتتاحية
              <input lang="en" name="stockQuantity" type="number" min={0} step={1} defaultValue={0} className="dashboard-field mt-2" />
            </label>
            <label className="block text-sm font-semibold">
              حد إعادة الطلب
              <input lang="en" name="lowStockThreshold" type="number" min={0} step={1} defaultValue={3} className="dashboard-field mt-2" />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            نسبة عمولة المنتج %
            <input lang="en" name="commissionRate" type="number" min={0} max={100} step={0.5} className="dashboard-field mt-2" placeholder="اتركه فارغًا لاستخدام نسبة الحلاق" />
          </label>
          <label className="block text-sm font-semibold">
            رمز المنتج (SKU)
            <input name="sku" className="dashboard-field mt-2" placeholder="اختياري" />
          </label>
          <button disabled={loading} className="dashboard-button-gold w-full">
            {loading ? "جاري الحفظ..." : "حفظ المنتج"}
          </button>
        </form>

        <div className="dashboard-panel overflow-hidden">
          <div className="border-b border-salon-line/70 px-5 py-4">
            <h2 className="text-lg font-bold tracking-tight">المنتجات ({products.length})</h2>
            <p className="dashboard-muted mt-1 text-sm">كل تغيير في الكمية يُسجَّل كحركة مخزون قابلة للتدقيق.</p>
          </div>

          <div className="divide-y divide-salon-line/70">
            {products.map((product) => {
              const isPending = pendingId === product.id;
              const showStockForm = stockFormId === product.id;

              return (
                <article key={product.id} className="px-5 py-4">
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold">{product.name}</h3>
                        {!product.isActive ? (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">معطل</span>
                        ) : null}
                        {product.isLowStock ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            {product.stockQuantity <= 0 ? "نفد" : "قارب على النفاد"}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-salon-charcoal">
                        {formatMoney(product.price)} · متوفر: <span className="tabular-nums">{product.stockQuantity}</span> · حد
                        الطلب: {product.lowStockThreshold}
                        {product.commissionRate != null ? ` · عمولة ${product.commissionRate}%` : ""}
                        {salons.length > 1 ? ` · ${product.salon.name}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setStockFormId(showStockForm ? null : product.id)}
                        className="dashboard-button px-3 py-2 text-xs"
                      >
                        {showStockForm ? "إغلاق" : "حركة مخزون"}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          void patchProduct(
                            product,
                            { isActive: !product.isActive },
                            product.isActive
                              ? `أُخفي ${product.name} — لن يظهر عند تسجيل الزيارة`
                              : `فُعّل ${product.name} — صار متاحًا للبيع`,
                          )
                        }
                        className="dashboard-button-soft px-3 py-2 text-xs"
                      >
                        {product.isActive ? "تعطيل" : "تفعيل"}
                      </button>
                    </div>
                  </div>

                  {showStockForm ? (
                    <form onSubmit={(event) => void submitStock(event, product)} className="mt-3 grid gap-2 rounded-xl bg-salon-pearl p-3 sm:grid-cols-[160px_120px_1fr_110px]" aria-label={`تسجيل حركة مخزون ${product.name}`}>
                      <label htmlFor={`stock-type-${product.id}`} className="sr-only">نوع حركة المخزون</label>
                      <select id={`stock-type-${product.id}`} name="type" defaultValue="PURCHASE" className="dashboard-field py-2.5">
                        {MOVEMENT_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                      <label htmlFor={`stock-quantity-${product.id}`} className="sr-only">كمية الحركة</label>
                      <input id={`stock-quantity-${product.id}`} lang="en" name="quantity" type="number" step={1} required defaultValue={1} className="dashboard-field py-2.5" />
                      <label htmlFor={`stock-reason-${product.id}`} className="sr-only">سبب حركة المخزون</label>
                      <input id={`stock-reason-${product.id}`} name="reason" placeholder="السبب (اختياري)" className="dashboard-field py-2.5" />
                      <button disabled={isPending} className="dashboard-button py-2.5 text-xs">
                        {isPending ? "..." : "تسجيل"}
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })}

            {products.length === 0 ? (
              <div className="p-5"><InlineEmpty icon="📦" title="لا توجد منتجات بعد" hint="أضف منتجًا من النموذج المجاور ليظهر للحلاق عند تسجيل الزيارة." /></div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
