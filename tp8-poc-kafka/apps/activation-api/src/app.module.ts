import { Module } from '@nestjs/common';
import { ClientKafka, ClientsModule } from '@nestjs/microservices';
import { Db } from 'mongodb';
import { connectMongo, KAFKA_CLIENT, KafkaEventPublisher, MONGO_DB, MongoProcessedEvents, producerOptions, ProcessedEvents, EventPublisher } from '../../../libs/kafka-toolkit/src';
import { ACTIVATION_STORE, ActivationStore, EVENT_PUBLISHER, PROCESSED_EVENTS } from './activation.model';
import { ActivationSaga } from './activation.saga';
import { ActivationsController } from './activations.controller';
import { EventsGateway } from './events.gateway';
import { MongoActivationStore } from './mongo-activation.store';
import { ResultsConsumer } from './results.consumer';

@Module({
  imports: [ClientsModule.register([producerOptions('activation-api')])],
  controllers: [ActivationsController, ResultsConsumer],
  providers: [
    EventsGateway,
    { provide: MONGO_DB, useFactory: () => connectMongo('activation') },
    { provide: ACTIVATION_STORE, inject: [MONGO_DB], useFactory: (db: Db) => new MongoActivationStore(db).init() },
    { provide: PROCESSED_EVENTS, inject: [MONGO_DB], useFactory: (db: Db) => new MongoProcessedEvents(db).init() },
    {
      provide: EVENT_PUBLISHER,
      inject: [KAFKA_CLIENT],
      useFactory: async (client: ClientKafka) => {
        await client.connect();
        return new KafkaEventPublisher(client);
      },
    },
    {
      provide: ActivationSaga,
      inject: [ACTIVATION_STORE, EVENT_PUBLISHER, PROCESSED_EVENTS, EventsGateway],
      useFactory: (store: ActivationStore, pub: EventPublisher, processed: ProcessedEvents, gw: EventsGateway) =>
        new ActivationSaga(store, pub, processed, gw),
    },
  ],
})
export class AppModule {}
