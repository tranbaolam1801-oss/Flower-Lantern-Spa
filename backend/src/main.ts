import 'dotenv/config';
import { createApp } from './bootstrap';

async function bootstrap() {
  const app = await createApp();
  app.enableShutdownHooks();
  // HOST defaults to loopback. A reverse proxy in another container/host needs HOST=0.0.0.0 (see docs-deploy/STAGING_CONFIGURATION.md).
  await app.listen(Number(process.env.PORT ?? 3000), process.env.HOST?.trim() || '127.0.0.1');
}
void bootstrap();
