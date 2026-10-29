import 'reflect-metadata';
import { Controller, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventPattern, MicroserviceOptions, Payload } from '@nestjs/microservices';
import { Db } from 'mongodb';
import { EventEnvelope, TOPICS } from '../../../libs/contracts/src';
import { connectMongo, consumerOptions, MONGO_DB, MongoProcessedEvents } from '../../../libs/kafka-toolkit/src';
import { MongoNotificationStore, SmtpMailer } from './infra';
import { NotificationLogic } from './notification.logic';

const SERVICE = 'notification-service';

@Controller()
class NotificationConsumer {
  constructor(private readonly logic: NotificationLogic) {}

  @EventPattern(TOPICS.ACTIVATION_EVENTS)
  onActivationEvent(@Payload() event: EventEnvelope) {
    return this.logic.onActivationEvent(event);
  }
}

@Module({
  controllers: [NotificationConsumer],
  providers: [
    { provide: MONGO_DB, useFactory: () => connectMongo('notification') },
    {
      provide: NotificationLogic,
      inject: [MONGO_DB],
      useFactory: async (db: Db) =>
        new NotificationLogic(await new MongoNotificationStore(db).init(), new SmtpMailer(), await new MongoProcessedEvents(db).init()),
    },
  ],
})
class NotificationModule {}

NestFactory.createMicroservice<MicroserviceOptions>(NotificationModule, consumerOptions(SERVICE)).then((app) => app.listen());
