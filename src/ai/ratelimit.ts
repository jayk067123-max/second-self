/**
 * 极简内存限流 —— 保护模型调用不被刷爆（每次调用是要花钱的）。
 * 限制：单实例内存计数，多实例部署时需换成 Redis，这里在注释里写明边界。
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function checkRateLimit(
  key: string,
  limit = 12,
  windowMs = 60_000,
  now: number = Date.now(),
): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

/** 从请求头里取一个尽力而为的调用方标识（本地开发全部落在 "local"） */
export function clientKeyOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "local";
}

/** 测试用：清空计数 */
export function resetRateLimit(): void {
  buckets.clear();
}
