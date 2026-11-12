import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createApp } from './bootstrap';

/**
 * Vercel Function entry (see backend/api/index.js). The Nest application is created once per function
 * instance and reused across invocations (Vercel Fluid compute keeps instances warm), so the DataSource pool
 * and in-memory caches survive between requests. Requests are handed to the underlying Express instance.
 */
let ready: Promise<Express> | undefined;

async function getExpress(): Promise<Express> {
  if (!ready) {
    ready = createApp()
      .then(async (app) => {
        await app.init();
        return app.getHttpAdapter().getInstance() as Express;
      })
      .catch((error) => {
        ready = undefined; // allow the next request to retry a failed cold start
        throw error;
      });
  }
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const app = await getExpress();
    app(req as Parameters<Express>[0], res as Parameters<Express>[1]);
  } catch {
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ message: 'Hệ thống đang khởi động. Vui lòng thử lại sau!' }));
    }
  }
}
