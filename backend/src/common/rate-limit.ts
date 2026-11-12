import { createHash } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export const RATE_LIMIT_MESSAGE = 'Bạn thao tác quá nhanh. Vui lòng thử lại sau!';

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  /** Hard cap on tracked keys so memory stays bounded under a key-flooding attack. */
  maxKeys?: number;
  now?: () => number;
}

export interface RateLimitResult { allowed: boolean; retryAfterSeconds: number }

/**
 * In-memory fixed-window limiter. PER-PROCESS: with more than one app instance each instance counts separately,
 * so multi-instance deployments need a shared store (e.g. Redis) behind the same interface.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly now: () => number;
  private readonly maxKeys: number;
  private lastSweep = 0;

  constructor(private readonly options: RateLimiterOptions) {
    this.now = options.now ?? Date.now;
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  get size() { return this.hits.size; }

  check(key: string): RateLimitResult {
    const now = this.now();
    this.sweep(now);
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (!entry && this.hits.size >= this.maxKeys) this.evict(now);
      entry = { count: 0, resetAt: now + this.options.windowMs };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    return { allowed: entry.count <= this.options.max, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  /** Drop expired keys at most once per window, or whenever the map is full. */
  private sweep(now: number) {
    if (now - this.lastSweep < this.options.windowMs && this.hits.size < this.maxKeys) return;
    this.lastSweep = now;
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }

  private evict(now: number) {
    this.sweep(now);
    // Still full of live keys: drop the oldest-inserted ones to make room.
    let excess = this.hits.size - this.maxKeys + 1;
    for (const key of this.hits.keys()) { if (excess-- <= 0) break; this.hits.delete(key); }
  }
}

export const clientIp = (req: Request) => req.ip ?? req.socket?.remoteAddress ?? 'unknown';

/** Key for authenticated routes: a hash of the session credential (never stored raw), falling back to the IP. */
export function sessionKey(req: Request): string {
  const bearer = typeof req.headers.authorization === 'string' ? req.headers.authorization.replace(/^Bearer /, '') : undefined;
  const token = (req.cookies?.access_token as string | undefined) ?? bearer;
  return token ? `u:${createHash('sha256').update(token).digest('hex').slice(0, 32)}` : `ip:${clientIp(req)}`;
}

export function rateLimitMiddleware(limiter: RateLimiter, keyOf: (req: Request) => string = (r) => `ip:${clientIp(r)}`) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = limiter.check(keyOf(req));
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      res.status(429).json({ message: RATE_LIMIT_MESSAGE });
      return;
    }
    next();
  };
}

const positiveInt = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n > 0 ? n : fallback;
};

export interface RateLimitSettings { enabled: boolean; windowMs: number; webhook: number; intent: number; login: number; upload: number }

export function readRateLimitSettings(env: NodeJS.ProcessEnv = process.env): RateLimitSettings {
  return {
    enabled: env.RATE_LIMIT_ENABLED !== 'false',
    windowMs: positiveInt(env.RATE_LIMIT_WINDOW_SECONDS, 60) * 1000,
    webhook: positiveInt(env.RATE_LIMIT_WEBHOOK_PER_WINDOW, 300),
    intent: positiveInt(env.RATE_LIMIT_INTENT_PER_WINDOW, 20),
    login: positiveInt(env.RATE_LIMIT_LOGIN_PER_WINDOW, 20),
    upload: positiveInt(env.RATE_LIMIT_UPLOAD_PER_WINDOW, 30),
  };
}
