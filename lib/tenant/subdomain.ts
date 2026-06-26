// نطاقات فرعية محجوزة لا تُعتبر معرّفات مؤسسات.
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "dashboard", "platform"]);

// النطاق الفرعي المخصص لمنصّة السوبر-آدمن.
export const PLATFORM_SUBDOMAIN = "platform";

function hostnameOf(host: string | null | undefined) {
  if (!host) return null;
  return host.split(":")[0].trim().toLowerCase();
}

function firstLabel(host: string | null | undefined, rootDomain?: string): string | null {
  const hostname = hostnameOf(host);
  if (!hostname) return null;
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;

  const root = (rootDomain ?? process.env.ROOT_DOMAIN ?? "").trim().toLowerCase();
  let sub: string | null = null;
  if (root && hostname !== root && hostname.endsWith(`.${root}`)) {
    sub = hostname.slice(0, -(root.length + 1));
  } else if (!root) {
    const parts = hostname.split(".");
    if (parts.length > 2) sub = parts.slice(0, parts.length - 2).join(".");
  }
  if (!sub) return null;
  return sub.split(".")[0] || null;
}

/** يستخرج slug المؤسسة من اسم المضيف، أو null للنطاق الجذر/المحلي/المحجوز. */
export function extractOrgSlug(host: string | null | undefined, rootDomain?: string): string | null {
  const label = firstLabel(host, rootDomain);
  if (!label || RESERVED_SUBDOMAINS.has(label)) return null;
  return label;
}

/** هل الطلب موجّه لمنصّة السوبر-آدمن (platform.<root>)؟ */
export function isPlatformHost(host: string | null | undefined, rootDomain?: string): boolean {
  return firstLabel(host, rootDomain) === PLATFORM_SUBDOMAIN;
}
