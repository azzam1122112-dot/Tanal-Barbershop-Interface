const attempts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function isRateLimited(key: string, now = Date.now()) {
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export function clearRateLimit(key: string) {
  attempts.delete(key);
}

export function resetRateLimitsForTests() {
  attempts.clear();
}
