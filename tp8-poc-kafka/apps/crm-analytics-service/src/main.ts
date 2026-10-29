import 'reflect-metadata';
import { Controller, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Ctx, EventPattern, KafkaContext, MicroserviceOptions, Payload } from '@nestjs/microservices';
import { Db } from 'mongodb';
import { EventEnvelope, TOPICS } from '../../../libs/contracts/src';
import { connectMongo, consumerOptions, MONGO_DB } from '../../../libs/kafka-toolkit/src';
import { CrmAnalyticsLogic } from './crm.logic';
import { MongoEventLogStore } from './mongo-event-log.store';

const SERVICE = 'crm-analytics-service';

/** Escucha los cuatro topics de negocio; no publica nada. */
@Controller()
class CrmConsumer {
  constructor(private readonly logic: CrmAnalyticsLogic) {}

  @EventPattern(TOPICS.ACTIVATION_REQUESTED)
  requested(@Payload() e: EventEnvelope, @Ctx() ctx: KafkaContext) {
    return this.logic.onEvent(e, ctx.getTopic());
  }
  @EventPattern(TOPICS.BILLING_EVENTS)
  billing(@Payload() e: EventEnvelope, @Ctx() ctx: KafkaContext) {
    return this.logic.onEvent(e, ctx.getTopic());
  }
  @EventPattern(TOPICS.PROVISIONING_EVENTS)
  provisioning(@Payload() e: EventEnvelope, @Ctx() ctx: KafkaContext) {
    return this.logic.onEvent(e, ctx.getTopic());
  }
  @EventPattern(TOPICS.ACTIVATION_EVENTS)
  activation(@Payload() e: EventEnvelope, @Ctx() ctx: KafkaContext) {
    return this.logic.onEvent(e, ctx.getTopic());
  }
}

@Module({
  controllers: [CrmConsumer],
  providers: [
    { provide: MONGO_DB, useFactory: () => connectMongo('crm_analytics') },
    {
      provide: CrmAnalyticsLogic,
      inject: [MONGO_DB],
      useFactory: async (db: Db) => new CrmAnalyticsLogic(await new MongoEventLogStore(db).init()),
    },
  ],
})
class CrmModule {}

// fromBeginning: un consumer group nuevo lee todo el historial retenido (RF-10).
NestFactory.createMicroservice<MicroserviceOptions>(CrmModule, consumerOptions(SERVICE, { fromBeginning: true })).then((app) =>
  app.listen(),
);
