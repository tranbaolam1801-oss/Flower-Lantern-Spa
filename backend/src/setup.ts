import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express, { Request, Response, NextFunction } from 'express';
import { RateLimiter, rateLimitMiddleware, readRateLimitSettings, sessionKey } from './common/rate-limit';
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from './uploads/image-storage';

/** TRUST_PROXY: unset/false = off (default). Integer = number of trusted proxy hops. Otherwise an Express trust-proxy value (e.g. "loopback, 10.0.0.0/8"). */
export function parseTrustProxy(value: string | undefined): boolean | number | string | undefined {
  const v = value?.trim();
  if (!v || v === 'false') return undefined;
  if (v === 'true') return true;
  return /^\d+$/.test(v) ? Number(v) : v;
}

const routeOf = (req: Request) => `${req.method} ${req.path.replace(/\/+$/, '').toLowerCase()}`;

export function setup(app: INestApplication) {
  app.setGlobalPrefix('api');
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  if (trustProxy !== undefined) (app.getHttpAdapter().getInstance() as express.Express).set('trust proxy', trustProxy);
  app.use(helmet());
  app.use(cookieParser());
  const limits = readRateLimitSettings();
  if (limits.enabled) {
    const make = (max: number) => new RateLimiter({ windowMs: limits.windowMs, max });
    const byRoute: Record<string, ReturnType<typeof rateLimitMiddleware>> = {
      'POST /api/payments/sepay/webhook': rateLimitMiddleware(make(limits.webhook)),
      'POST /api/payments/sepay/intent': rateLimitMiddleware(make(limits.intent), sessionKey),
      'POST /api/auth/login': rateLimitMiddleware(make(limits.login)),
      'POST /api/admin/services/image': rateLimitMiddleware(make(limits.upload), sessionKey),
      // Per-instance only (serverless); the OTP service enforces the real per-phone/per-IP limits in the database.
      'POST /api/auth/otp/request': rateLimitMiddleware(make(limits.otp)),
      'POST /api/auth/otp/verify': rateLimitMiddleware(make(limits.otp * 2)),
      'POST /api/auth/register': rateLimitMiddleware(make(limits.otp)),
      'POST /api/auth/password/reset': rateLimitMiddleware(make(limits.otp)),
      'POST /api/internal/notifications/dispatch': rateLimitMiddleware(make(limits.dispatch)),
    };
    app.use((req: Request, res: Response, next: NextFunction) => (byRoute[routeOf(req)] ?? ((_q, _s, n) => n()))(req, res, next));
  }
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Server-to-server webhook: no browser cookie/origin; the handler authenticates the caller (SePay API key or HMAC) and fails closed.
    // The internal dispatch endpoint is called by a scheduler (n8n / GitHub Actions), not a browser; it authenticates with a Bearer INTERNAL_API_KEY.
    const sepayWebhook = req.method === 'POST' && (req.path === '/api/payments/sepay/webhook' || req.path === '/api/internal/notifications/dispatch');
    if (!sepayWebhook && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173';
      if (req.headers['x-spa-request'] !== '1' || (req.headers.origin && req.headers.origin !== origin)) {
        res.status(403).json({ message: 'Yêu cầu không hợp lệ.' });
        return;
      }
    }
    next();
  });
  // Raw image body for exactly one route; other routes keep the normal JSON parser.
  const rawImage = express.raw({ type: [...IMAGE_MIME_TYPES], limit: MAX_IMAGE_BYTES });
  app.use((req: Request, res: Response, next: NextFunction) => (routeOf(req) === 'POST /api/admin/services/image' ? rawImage(req, res, next) : next()));
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.enableCors({origin:process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173',credentials:true});
}
