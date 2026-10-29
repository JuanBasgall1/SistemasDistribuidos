import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { consumerOptions } from '../../../libs/kafka-toolkit/src';
import { AppModule } from './app.module';

/** App híbrida: API REST + WebSocket + consumidor Kafka (billing.events y provisioning.events). */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.connectMicroservice(consumerOptions('activation-api'));
  await app.startAllMicroservices();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`activation-api escuchando en http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
