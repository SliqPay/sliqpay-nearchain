import 'server-only';
import { Redis } from '@upstash/redis';
import { env } from './env';

/**
 * Where orders live. Upstash Redis when configured (required on Vercel: serverless
 * instances share no memory), otherwise process memory for `npm run dev`.
 * `claim` is the one operation that must be atomic: it is what stops two polls
 * from both buying the airtime.
 */
interface Store {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Set only if absent. True when this caller won; the existing value otherwise via get. */
  claim(key: string, value: string, ttlSeconds: number): Promise<boolean>;
}

const TTL = 60 * 60 * 24 * 30; // 30 days — long enough to look an order up after the demo

function memoryStore(): Store {
  const g = globalThis as unknown as { __sliqStore?: Map<string, unknown> };
  g.__sliqStore ??= new Map();
  const m = g.__sliqStore;
  return {
    async get<T>(key: string) { return (m.get(key) as T | undefined) ?? null; },
    async set<T>(key: string, value: T) { m.set(key, value); },
    async claim(key, value) {
      if (m.has(key)) return false;
      m.set(key, value);
      return true;
    },
  };
}

function redisStore(url: string, token: string): Store {
  const r = new Redis({ url, token });
  return {
    async get<T>(key: string) { return (await r.get<T>(key)) ?? null; },
    async set<T>(key: string, value: T, ttl: number) { await r.set(key, value, { ex: ttl }); },
    async claim(key, value, ttl) { return (await r.set(key, value, { nx: true, ex: ttl })) === 'OK'; },
  };
}

let store: Store | undefined;

export function getStore(): Store {
  if (store) return store;
  const e = env();
  store = e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN
    ? redisStore(e.UPSTASH_REDIS_REST_URL, e.UPSTASH_REDIS_REST_TOKEN)
    : memoryStore();
  return store;
}

export { TTL };
