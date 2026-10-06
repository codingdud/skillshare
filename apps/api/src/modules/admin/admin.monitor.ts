import type { RequestHandler } from 'express';
const startedAt = new Date().toISOString();
const latencies: number[] = [];
let requests = 0,
  serverErrors = 0,
  rejected = 0,
  totalMs = 0;
export const monitorRequests: RequestHandler = (_req, res, next) => {
  const started = performance.now();
  res.once('finish', () => {
    const elapsed = performance.now() - started;
    requests++;
    totalMs += elapsed;
    if (res.statusCode >= 500) serverErrors++;
    else if (res.statusCode >= 400) rejected++;
    if (latencies.length >= 2000) latencies.shift();
    latencies.push(elapsed);
  });
  next();
};
export function processMetrics() {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    requests,
    serverErrors,
    rejected,
    averageMs: requests ? Math.round(totalMs / requests) : 0,
    p95Ms: Math.round(sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0),
    startedAt,
  };
}
