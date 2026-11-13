import 'server-only';
import { getStore } from './store';

/**
 * Simple rate limiter using the order store (Redis or memory).
 * Limits requests per IP address or identifier.
 */

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix: string;
}

export class RateLimitError extends Error {
  constructor(message: string, readonly retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Check if a request is allowed under the rate limit.
 * @param identifier - Usually the IP address or user ID
 * @param config - Rate limit configuration
 * @returns true if allowed, throws RateLimitError if exceeded
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<boolean> {
  const store = getStore();
  const key = `${config.keyPrefix}:${identifier}`;
  const now = Date.now();
  
  // Get current count
  const data = await store.get<{ count: number; resetAt: number }>(key);
  
  if (!data) {
    // First request in this window
    await store.set(
      key,
      { count: 1, resetAt: now + config.windowMs },
      Math.ceil(config.windowMs / 1000)
    );
    return true;
  }
  
  // Window expired, reset
  if (now > data.resetAt) {
    await store.set(
      key,
      { count: 1, resetAt: now + config.windowMs },
      Math.ceil(config.windowMs / 1000)
    );
    return true;
  }
  
  // Within window, check limit
  if (data.count >= config.maxRequests) {
    const retryAfter = Math.ceil((data.resetAt - now) / 1000);
    throw new RateLimitError(
      `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      retryAfter
    );
  }
  
  // Increment count
  await store.set(
    key,
    { count: data.count + 1, resetAt: data.resetAt },
    Math.ceil((data.resetAt - now) / 1000)
  );
  
  return true;
}

/**
 * Extract IP address from request headers, with fallback
 */
export function getClientIp(req: Request): string {
  // Check common headers used by proxies
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  
  // Fallback
  return 'unknown';
}

// Pre-configured rate limiters
export const RATE_LIMITS = {
  quote: { maxRequests: 10, windowMs: 60_000, keyPrefix: 'rl:quote' }, // 10 quotes per minute
  order: { maxRequests: 5, windowMs: 60_000, keyPrefix: 'rl:order' }, // 5 orders per minute
  verify: { maxRequests: 20, windowMs: 60_000, keyPrefix: 'rl:verify' }, // 20 meter verifications per minute
};
