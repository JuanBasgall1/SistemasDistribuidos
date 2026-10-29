import { Logger } from '@nestjs/common';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { TOPICS } from '../libs/contracts/src';
import { ActivationSaga } from '../apps/activation-api/src/activation.saga';
import { BillingLogic } from '../apps/billing-service/src/billing.logic';
import { ProvisioningLogic } from '../apps/provisioning-service/src/provisioning.logic';
import { NotificationLogic } from '../apps/notification-service/src/notification.logic';
import { CrmAnalyticsLogic } from '../apps/crm-analytics-service/src/crm.logic';
import {
  FakeMailer, InMemoryBus, MemActivationStore, MemBillingStore, MemEventLog, MemNotificationStore, MemProcessed,
  MemProvisioningStore, SpyNotifier,
} from './support';

Logger.overrideLogger(false);
const noDelay = async () => {};

function world() {
  const bus = new InMemoryBus();
  const activations = new MemActivationStore();
  const billingStore = new MemBillingStore();
  const provStore = new MemProvisioningStore();
  const mailer = new FakeMailer();
  const eventLog = new MemEventLog();
  const notifier = new SpyNotifier();

  const saga = new ActivationSaga(activations, bus, new MemProcessed(), notifier);
  const billing = new BillingLogic(billingStore, bus, new MemProcessed(), noDelay);
  const provisioning = new ProvisioningLogic(provStore, bus, new MemProcessed(), noDelay);
  const notification = new NotificationLogic(new MemNotificationStore(), mailer, new MemProcessed());
  const crm = new CrmAnalyticsLogic(eventLog);

  // Mismas suscripciones que los @EventPattern de cada servicio.
  bus.subscribe(TOPICS.ACTIVATION_REQUESTED, (e) => billing.onActivationRequested(e));
  bus.subscribe(TOPICS.ACTIVATION_REQUESTED, (e) => provisioning.onActivationRequested(e));
  bus.subscribe(TOPICS.BILLING_EVENTS, (e) => saga.onResult(e));
  bus.subscribe(TOPICS.PROVISIONING_EVENTS, (e) => saga.onResult(e));
  bus.subscribe(TOPICS.ACTIVATION_EVENTS, (e) => notification.onActivationEvent(e));
  bus.subscribe(TOPICS.ACTIVATION_EVENTS, (e) => billing.onActivationEvent(e));
  for (const t of Object.values(TOPICS)) bus.subscribe(t, (e, topic) => crm.onEvent(e, topic));

  return { bus, activations, billingStore, provStore, mailer, eventLog, notifier, saga, billing, provisioning };
}

describe('Escenario 1: camino feliz', () => {
  it('termina en ACTIVE, con 4 eventos en la timeline y un email de bienvenida', async () => {
    const w = world();
    const a = await w.saga.request({ customerId: 'C-1234', planId: 'PLAN DIGITAL', simulateFailure: 'none' });
    assert.equal(a.status, 'PENDING'); // RF-02: responde antes de que trabajen los demás
    await w.bus.drain();

    const final = (await w.activations.get(a._id))!;
    assert.equal(final.status, 'ACTIVE');
    assert.deepEqual(final.history.map((h) => h.eventType), [
      'ActivationRequested', 'BillingAccountCreated', 'ProvisioningCompleted', 'ActivationCompleted',
    ]);
    assert.equal(w.mailer.sent.length, 1);
    assert.match(w.mailer.sent[0].subject, /Bienvenido/);
    assert.equal(w.billingStore.accounts.get(a._id)?.status, 'CREATED');
    // crm-analytics registró todo lo publicado
    assert.equal(w.eventLog.events.size, w.bus.log.length);
    // todos los eventos comparten correlationId y usan customerId como clave
    assert.ok(w.bus.log.every((l) => l.event.correlationId === a._id && l.event.customerId === 'C-1234'));
  });
});

describe('Escenario 2: fallo y compensación', () => {
  it('fallo en provisioning: FAILED, ActivationFailed y billing anula la cuenta', async () => {
    const w = world();
    const a = await w.saga.request({ customerId: 'C-1', planId: 'PLAN FULL', simulateFailure: 'provisioning' });
    await w.bus.drain();

    const final = (await w.activations.get(a._id))!;
    assert.equal(final.status, 'FAILED');
    assert.deepEqual(final.history.map((h) => h.eventType), [
      'ActivationRequested', 'BillingAccountCreated', 'ProvisioningFailed', 'ActivationFailed', 'BillingAccountCancelled',
    ]);
    assert.equal(w.billingStore.accounts.get(a._id)?.status, 'CANCELLED');
    assert.equal(w.mailer.sent.length, 1);
    assert.match(w.mailer.sent[0].subject, /No pudimos/);
  });

  it('fallo en billing: FAILED sin compensación (no había cuenta)', async () => {
    const w = world();
    const a = await w.saga.request({ customerId: 'C-2', planId: 'PLAN FULL', simulateFailure: 'billing' });
    await w.bus.drain();

    const final = (await w.activations.get(a._id))!;
    assert.equal(final.status, 'FAILED');
    assert.ok(!w.bus.types().includes('BillingAccountCancelled'));
    assert.equal(w.billingStore.accounts.size, 0);
    // provisioning terminó después del fallo: queda en el historial pero no cambia el estado
    assert.equal(final.history.at(-1)?.eventType, 'ProvisioningCompleted');
    assert.equal(w.bus.types().filter((t) => t === 'ActivationFailed').length, 1);
  });
});

describe('Idempotencia (RNF-03)', () => {
  it('reentregar eventos no duplica cuentas, órdenes, emails ni cierres', async () => {
    const w = world();
    const a = await w.saga.request({ customerId: 'C-3', planId: 'PLAN DIGITAL', simulateFailure: 'none' });
    await w.bus.drain();
    const published = w.bus.log.length;

    // Kafka "al menos una vez": se vuelve a entregar todo lo que ya se procesó.
    for (const { event } of [...w.bus.log]) {
      await w.billing.onActivationRequested(event);
      await w.provisioning.onActivationRequested(event);
      await w.saga.onResult(event);
      await w.billing.onActivationEvent(event);
    }
    await w.bus.drain();

    assert.equal(w.bus.log.length, published, 'no se publicó nada nuevo');
    assert.equal(w.billingStore.accounts.size, 1);
    assert.equal(w.provStore.orders.size, 1);
    assert.equal(w.mailer.sent.length, 1);
    assert.equal((await w.activations.get(a._id))!.history.length, 4);
  });
});

describe('Caso borde: ActivationFailed llega a billing antes de crear la cuenta', () => {
  it('billing crea la cuenta y la anula enseguida', async () => {
    const w = world();
    const a = await w.saga.request({ customerId: 'C-4', planId: 'PLAN FULL', simulateFailure: 'provisioning' });
    const requested = w.bus.log[0].event;

    // Simulamos que billing está atrasado: provisioning falla y la activación se cierra antes.
    await w.provisioning.onActivationRequested(requested);
    const provFailed = w.bus.log.find((l) => l.event.eventType === 'ProvisioningFailed')!.event;
    await w.saga.onResult(provFailed);
    const activationFailed = w.bus.log.find((l) => l.event.eventType === 'ActivationFailed')!.event;
    await w.billing.onActivationEvent(activationFailed); // todavía no hay cuenta
    assert.equal(w.billingStore.accounts.size, 0);

    await w.billing.onActivationRequested(requested); // billing se pone al día
    assert.equal(w.billingStore.accounts.get(a._id)?.status, 'CANCELLED');
    assert.ok(w.bus.types().includes('BillingAccountCancelled'));
  });
});
