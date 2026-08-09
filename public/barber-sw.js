/*
 * عامل خدمة واجهة الحلاق — هيكل التطبيق فقط.
 *
 * قاعدة جوهرية: لا يُخزَّن أي رد يحمل بيانات عميل أو مبلغًا.
 * الجهاز قد يكون مشتركًا بين حلاقين، والأرقام المالية لا تُقرأ إلا من الخادم.
 * فالمخزَّن هنا حصرًا: أصول البناء الثابتة (بمحتوى مُبصَّم في اسمها)، الأيقونات،
 * وصفحة «لا اتصال». كل ما عدا ذلك شبكة فقط.
 */

const CACHE_VERSION = "xmansx-barber-v4";
const OFFLINE_URL = "/barber-offline.html";

// أصول لا تحمل بيانات: تُسبق تخزينها ليعمل الهيكل بلا شبكة.
// البيان (`/barber.webmanifest`) ليس هنا عمدًا: اسمه غير مُبصَّم، فتخزينه دائمًا
// يعني أن أي تعديل عليه لا يصل للأجهزة المثبَّتة إلا برفع CACHE_VERSION.
// وهو يُقرأ وقت التثبيت/التحديث فقط — أي مع وجود شبكة أصلًا.
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/xmansx-icon-192.png",
  "/icons/xmansx-icon-512.png",
  "/icons/xmansx-maskable-512.png",
  "/brand/xmansx-mark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // `reload` يتجاوز ذاكرة HTTP حتى لا نُسبق تخزين نسخة قديمة.
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })));
      // التفعيل الفوري: التحديث يُعرض للحلاق كزر صريح، لا كانتظار صامت.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// التنبيه يصل من Web Push حتى والتطبيق مغلق. لا نخزّن الحمولة؛ تُعرض مباشرة
// ثم يتخلص منها المتصفح، بينما تبقى بيانات المواعيد الفعلية شبكة فقط.
self.addEventListener("push", (event) => {
  let payload = {
    title: "XMANSX",
    body: "لديك تحديث جديد في جدول المواعيد.",
    url: "/barber#appointments",
    tag: "xmansx-update",
    kind: "appointment",
  };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // حمولة غير مقروءة: نعرض رسالة آمنة عامة بدل إسقاط التنبيه كليًا.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/xmansx-icon-192.png",
      badge: "/icons/xmansx-icon-192.png",
      dir: "rtl",
      lang: "ar",
      tag: payload.tag,
      renotify: true,
      vibrate: [180, 80, 180],
      data: { url: safeBarberUrl(payload.url), kind: payload.kind },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = safeBarberUrl(event.notification.data?.url);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        if ("navigate" in existing) await existing.navigate(destination);
        return existing.focus();
      }
      return self.clients.openWindow(destination);
    })(),
  );
});

function safeBarberUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/barber", self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith("/barber")) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    // الوجهة الاحتياطية أدناه.
  }
  return "/barber";
}

/** أصل ثابت بلا بيانات: اسمه مُبصَّم أو صورة علامة — آمن للتخزين الدائم. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // الطفرات لا تُخزَّن ولا تُعاد من ذاكرة — شبكة فقط.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // كل نداءات الـ API شبكة فقط: المبالغ والنقاط والمخزون لا تُقرأ من نسخة قديمة أبدًا.
  if (url.pathname.startsWith("/api/")) return;

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // تنقّل صفحات: شبكة أولًا، وعند الفشل صفحة «لا اتصال» — لا صفحة محفوظة فيها بيانات.
  if (request.mode === "navigate") {
    event.respondWith(networkThenOfflinePage(request));
  }

  // ما عدا ذلك (حمولات RSC مثلًا) يمر إلى الشبكة كما هو.
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkThenOfflinePage(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE_VERSION);
    const offline = await cache.match(OFFLINE_URL);
    return (
      offline ??
      new Response("لا يوجد اتصال بالإنترنت", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}
