import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setup } from './setup';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setup(app);
  const document = SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('Flower Lantern Spa').setVersion('0.1.0').build());
  SwaggerModule.setup('api/docs',app,document);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000),'127.0.0.1');
}
void bootstrap();
