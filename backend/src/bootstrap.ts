import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setup } from './setup';

/**
 * Builds the configured Nest application without listening. Shared by the long-running server (main.ts)
 * and the Vercel Function entry (serverless.ts) so both run identical middleware, guards and validation.
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { rawBody: true, logger: ['error', 'warn', 'log'] });
  setup(app);
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Flower Lantern Spa').setVersion('0.1.0').build());
  SwaggerModule.setup('api/docs', app, document);
  return app;
}
