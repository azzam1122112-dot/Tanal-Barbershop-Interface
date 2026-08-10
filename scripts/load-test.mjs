import { performance } from "node:perf_hooks";

const target = new URL(process.env.LOAD_TEST_URL ?? "http://127.0.0.1:3000/api/health");
const concurrency = boundedInteger(process.env.LOAD_TEST_CONCURRENCY, 20, 1, 500);
const durationSeconds = boundedInteger(process.env.LOAD_TEST_DURATION_SECONDS, 20, 1, 600);
const timeoutMs = boundedInteger(process.env.LOAD_TEST_TIMEOUT_MS, 5_000, 250, 60_000);
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);

if (!isLocal && process.env.ALLOW_REMOTE_LOAD_TEST !== "true") {
  throw new Error("Refusing a remote load test. Set ALLOW_REMOTE_LOAD_TEST=true only with explicit authorization.");
}

const deadline = performance.now() + durationSeconds * 1_000;
const latencies = [];
const statuses = new Map();
let failures = 0;

await Promise.all(Array.from({ length: concurrency }, worker));

latencies.sort((a, b) => a - b);
const total = latencies.length + failures;
const elapsedSeconds = durationSeconds;
const summary = {
  target: target.toString(),
  concurrency,
  durationSeconds,
  requests: total,
  requestsPerSecond: Number((total / elapsedSeconds).toFixed(1)),
  failures,
  statusCodes: Object.fromEntries([...statuses].sort()),
  latencyMs: {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    max: latencies.at(-1) ?? null,
  },
};

console.log(JSON.stringify(summary, null, 2));
if (failures > 0) process.exitCode = 1;

async function worker() {
  while (performance.now() < deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = performance.now();

    try {
      const response = await fetch(target, {
        signal: controller.signal,
        headers: { "user-agent": "xmansx-authorized-load-test/1.0" },
      });
      await response.arrayBuffer();
      const status = String(response.status);
      statuses.set(status, (statuses.get(status) ?? 0) + 1);
      if (!response.ok) failures += 1;
      latencies.push(Number((performance.now() - startedAt).toFixed(2)));
    } catch {
      failures += 1;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function percentile(values, ratio) {
  if (values.length === 0) return null;
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
}
