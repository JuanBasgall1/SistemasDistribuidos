import 'reflect-metadata';
import { Controller, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClientKafka, ClientsModule, EventPattern, MicroserviceOptions, Payload } from '@nestjs/microservices';
import { Db } from 'mongodb';
import { EventEnvelope, TOPICS } from '../../../libs/contracts/src';
import {
  connectMongo, consumerOptions, KAFKA_CLIENT, KafkaEventPublisher, MONGO_DB, MongoProcessedEvents, producerOptions,
} from '../../../libs/kafka-toolkit/src';
import { BillingLogic } from './billing.logic';
import { MongoBillingStore } from './mongo-billing.store';

const SERVICE = 'billing-service';

@Controller()
class BillingConsumer {
  constructor(private readonly logic: BillingLogic) {}

  @EventPattern(TOPICS.ACTIVATION_REQUESTED)
  onRequested(@Payload() event: EventEnvelope) {
    return this.logic.onActivationRequested(event);
  }

  /** Compensación: ActivationFailed anula la cuenta si se había creado. */
  @EventPattern(TOPICS.ACTIVATION_EVENTS)
  onActivationEvent(@Payload() event: EventEnvelope) {
    return this.logic.onActivationEvent(event);
  }
}

@Module({
  imports: [ClientsModule.register([producerOptions(SERVICE)])],
  controllers: [BillingConsumer],
  providers: [
    { provide: MONGO_DB, useFactory: () => connectMongo('billing') },
    {
      provide: BillingLogic,
      inject: [MONGO_DB, KAFKA_CLIENT],
      useFactory: async (db: Db, client: ClientKafka) => {
        await client.connect();
        return new BillingLogic(
          await new MongoBillingStore(db).init(),
          new KafkaEventPublisher(client),
          await new MongoProcessedEvents(db).init(),
        );
      },
    },
  ],
})
class BillingModule {}

NestFactory.createMicroservice<MicroserviceOptions>(BillingModule, consumerOptions(SERVICE)).then((app) => app.listen());
