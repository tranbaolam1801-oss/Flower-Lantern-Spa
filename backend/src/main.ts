import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setup } from './setup';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  setup(app);
  const document = SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('Flower Lantern Spa').setVersion('0.1.0').build());
  SwaggerModule.setup('api/docs',app,document);
  app.enableShutdownHooks();
  // HOST defaults to loopback. A reverse proxy in another container/host needs HOST=0.0.0.0 (see docs-deploy/STAGING_CONFIGURATION.md).
  await app.listen(Number(process.env.PORT ?? 3000),process.env.HOST?.trim() || '127.0.0.1');
}
void bootstrap();
