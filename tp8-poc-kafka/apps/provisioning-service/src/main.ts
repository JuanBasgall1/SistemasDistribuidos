import 'reflect-metadata';
import { Controller, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClientKafka, ClientsModule, EventPattern, MicroserviceOptions, Payload } from '@nestjs/microservices';
import { Db } from 'mongodb';
import { EventEnvelope, TOPICS } from '../../../libs/contracts/src';
import {
  connectMongo, consumerOptions, KAFKA_CLIENT, KafkaEventPublisher, MONGO_DB, MongoProcessedEvents, producerOptions,
} from '../../../libs/kafka-toolkit/src';
import { MongoProvisioningStore } from './mongo-provisioning.store';
import { ProvisioningLogic } from './provisioning.logic';

const SERVICE = 'provisioning-service';

@Controller()
class ProvisioningConsumer {
  constructor(private readonly logic: ProvisioningLogic) {}

  @EventPattern(TOPICS.ACTIVATION_REQUESTED)
  onRequested(@Payload() event: EventEnvelope) {
    return this.logic.onActivationRequested(event);
  }
}

@Module({
  imports: [ClientsModule.register([producerOptions(SERVICE)])],
  controllers: [ProvisioningConsumer],
  providers: [
    { provide: MONGO_DB, useFactory: () => connectMongo('provisioning') },
    {
      provide: ProvisioningLogic,
      inject: [MONGO_DB, KAFKA_CLIENT],
      useFactory: async (db: Db, client: ClientKafka) => {
        await client.connect();
        return new ProvisioningLogic(
          await new MongoProvisioningStore(db).init(),
          new KafkaEventPublisher(client),
          await new MongoProcessedEvents(db).init(),
        );
      },
    },
  ],
})
class ProvisioningModule {}

NestFactory.createMicroservice<MicroserviceOptions>(ProvisioningModule, consumerOptions(SERVICE)).then((app) => app.listen());
