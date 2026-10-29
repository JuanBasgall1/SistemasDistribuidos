/**
 * Backend de demo SIN Kafka ni Mongo: el mismo controller REST, el mismo gateway WebSocket y la
 * misma lógica de los cinco servicios, conectados por el bus en memoria de los tests.
 * Sirve para probar la UI sin Docker:  npx ts-node test/demo-server.ts
 */
import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TOPICS } from '../libs/contracts/src';
import { ACTIVATION_STORE } from '../apps/activation-api/src/activation.model';
import { ActivationSaga } from '../apps/activation-api/src/activation.saga';
import { ActivationsController } from '../apps/activation-api/src/activations.controller';
import { EventsGateway } from '../apps/activation-api/src/events.gateway';
import { BillingLogic } from '../apps/billing-service/src/billing.logic';
import { ProvisioningLogic } from '../apps/provisioning-service/src/provisioning.logic';
import { NotificationLogic } from '../apps/notification-service/src/notification.logic';
import { CrmAnalyticsLogic } from '../apps/crm-analytics-service/src/crm.logic';
import {
  FakeMailer, InMemoryBus, MemActivationStore, MemBillingStore, MemEventLog, MemNotificationStore, MemProcessed,
  MemProvisioningStore,
} from './support';

const store = new MemActivationStore();
const bus = new InMemoryBus();

@Module({
  controllers: [ActivationsController],
  providers: [
    EventsGateway,
    { provide: ACTIVATION_STORE, useValue: store },
    {
      provide: ActivationSaga,
      inject: [EventsGateway],
      useFactory: (gw: EventsGateway) => {
        const saga = new ActivationSaga(store, bus, new MemProcessed(), gw);
        const billing = new BillingLogic(new MemBillingStore(), bus, new MemProcessed());
        const prov = new ProvisioningLogic(new MemProvisioningStore(), bus, new MemProcessed());
        const notif = new NotificationLogic(new MemNotificationStore(), new FakeMailer(), new MemProcessed());
        const crm = new CrmAnalyticsLogic(new MemEventLog());
        // Cada "servicio" procesa en paralelo, como consumer groups distintos.
        const async = (fn: (e: any, t: string) => Promise<void>) => (e: any, t: string) => { void fn(e, t); return Promise.resolve(); };
        bus.subscribe(TOPICS.ACTIVATION_REQUESTED, async((e) => billing.onActivationRequested(e)));
        bus.subscribe(TOPICS.ACTIVATION_REQUESTED, async((e) => prov.onActivationRequested(e)));
        bus.subscribe(TOPICS.BILLING_EVENTS, async((e) => saga.onResult(e)));
        bus.subscribe(TOPICS.PROVISIONING_EVENTS, async((e) => saga.onResult(e)));
        bus.subscribe(TOPICS.ACTIVATION_EVENTS, async((e) => notif.onActivationEvent(e)));
        bus.subscribe(TOPICS.ACTIVATION_EVENTS, async((e) => billing.onActivationEvent(e)));
        for (const t of Object.values(TOPICS)) bus.subscribe(t, async((e, topic) => crm.onEvent(e, topic)));
        setInterval(() => void bus.drain(), 50);
        return saga;
      },
    },
  ],
})
class DemoModule {}

async function main() {
  const app = await NestFactory.create(DemoModule);
  app.enableCors();
  await app.listen(Number(process.env.PORT ?? 3000));
  Logger.log('Backend de demo en memoria en http://localhost:3000', 'Demo');
}
main();
