/**
 * Dobles en memoria para probar la lógica de la saga sin Kafka ni Mongo:
 * un bus que imita topics + consumer groups y stores con la misma semántica que los de Mongo.
 */
import { EventEnvelope, Topic, TOPIC_OF } from '../libs/contracts/src';
import { EventPublisher, ProcessedEvents } from '../libs/kafka-toolkit/src';
import { Activation, ActivationNotifier, ActivationStore, HistoryEntry, Step, StepResult } from '../apps/activation-api/src/activation.model';
import { BillingAccount, BillingStore } from '../apps/billing-service/src/billing.logic';
import { ProvisioningOrder, ProvisioningStore } from '../apps/provisioning-service/src/provisioning.logic';
import { Mail, Mailer, NotificationRecord, NotificationStore } from '../apps/notification-service/src/notification.logic';
import { EventLogStore } from '../apps/crm-analytics-service/src/crm.logic';

type Handler = (e: EventEnvelope, topic: string) => Promise<void>;

export class InMemoryBus implements EventPublisher {
  readonly log: { topic: Topic; event: EventEnvelope }[] = [];
  private readonly queue: { topic: Topic; event: EventEnvelope }[] = [];
  private readonly subs: { topic: Topic; handler: Handler }[] = [];

  subscribe(topic: Topic, handler: Handler) {
    this.subs.push({ topic, handler });
  }
  async publish(event: EventEnvelope) {
    const topic = TOPIC_OF[event.eventType];
    this.log.push({ topic, event });
    this.queue.push({ topic, event });
  }
  /** Entrega cada mensaje a cada consumidor suscripto (un consumer group por servicio). */
  async drain() {
    while (this.queue.length) {
      const { topic, event } = this.queue.shift()!;
      for (const s of this.subs.filter((x) => x.topic === topic)) await s.handler(structuredClone(event), topic);
    }
  }
  types() {
    return this.log.map((l) => l.event.eventType);
  }
}

export class MemProcessed implements ProcessedEvents {
  readonly ids = new Set<string>();
  async has(id: string) { return this.ids.has(id); }
  async mark(id: string) { this.ids.add(id); }
}

export class MemActivationStore implements ActivationStore {
  readonly docs = new Map<string, Activation>();
  private seq = 0;
  async nextId() { return `act-${String(++this.seq).padStart(4, '0')}`; }
  async insert(a: Activation) { this.docs.set(a._id, structuredClone(a)); }
  async get(id: string) { return this.docs.has(id) ? structuredClone(this.docs.get(id)!) : null; }
  async list(n: number) { return [...this.docs.values()].slice(-n).reverse(); }
  async saveStep(id: string, step: Step, result: StepResult, entry: HistoryEntry) {
    const a = this.docs.get(id);
    if (!a) return null;
    a.steps[step] = result;
    a.history.push(entry);
    if (a.status === 'PENDING') a.status = 'IN_PROGRESS';
    return structuredClone(a);
  }
  async appendHistory(id: string, entry: HistoryEntry) {
    const a = this.docs.get(id);
    if (!a) return null;
    a.history.push(entry);
    return structuredClone(a);
  }
  async finish(id: string, status: 'ACTIVE' | 'FAILED', entry: HistoryEntry, reason?: string) {
    const a = this.docs.get(id);
    if (!a || (a.status !== 'PENDING' && a.status !== 'IN_PROGRESS')) return false;
    a.status = status;
    if (reason) a.failureReason = reason;
    a.history.push(entry);
    return true;
  }
}

export class MemBillingStore implements BillingStore {
  readonly accounts = new Map<string, BillingAccount>();
  readonly failed = new Set<string>();
  async findByActivation(id: string) { return this.accounts.get(id) ?? null; }
  async create(acc: BillingAccount) {
    if (this.accounts.has(acc.activationId)) return false;
    this.accounts.set(acc.activationId, { ...acc });
    return true;
  }
  async cancel(id: string) {
    const acc = this.accounts.get(id);
    if (!acc || acc.status !== 'CREATED') return null;
    acc.status = 'CANCELLED';
    return { ...acc };
  }
  async markFailed(id: string) { this.failed.add(id); }
  async isFailed(id: string) { return this.failed.has(id); }
}

export class MemProvisioningStore implements ProvisioningStore {
  readonly orders = new Map<string, ProvisioningOrder>();
  async save(o: ProvisioningOrder) {
    if (this.orders.has(o.activationId)) return false;
    this.orders.set(o.activationId, o);
    return true;
  }
}

export class MemNotificationStore implements NotificationStore {
  readonly keys = new Set<string>();
  async save(r: NotificationRecord) {
    const k = `${r.activationId}|${r.eventType}`;
    if (this.keys.has(k)) return false;
    this.keys.add(k);
    return true;
  }
  async remove(id: string, type: string) { this.keys.delete(`${id}|${type}`); }
}

export class FakeMailer implements Mailer {
  readonly sent: Mail[] = [];
  async send(m: Mail) { this.sent.push(m); }
}

export class MemEventLog implements EventLogStore {
  readonly events = new Map<string, EventEnvelope>();
  async append(e: EventEnvelope) {
    if (this.events.has(e.eventId)) return false;
    this.events.set(e.eventId, e);
    return true;
  }
  async count() { return this.events.size; }
}

export class SpyNotifier implements ActivationNotifier {
  readonly pushes: string[] = [];
  changed(a: Activation, e: EventEnvelope) { this.pushes.push(`${a._id}:${e.eventType}:${a.status}`); }
}
