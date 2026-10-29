import { Logger } from '@nestjs/common';
import { createEvent, EventEnvelope, FailureMode } from '../../../libs/contracts/src';
import { EventPublisher, handleOnce, ProcessedEvents } from '../../../libs/kafka-toolkit/src';
import { Activation, ActivationNotifier, ActivationStore, Step, toHistoryEntry } from './activation.model';

export const SOURCE = 'activation-api';

export interface NewActivation {
  customerId: string;
  planId: string;
  simulateFailure: FailureMode;
}

/**
 * Agregador de la saga (coreografía): no le da órdenes a nadie.
 * Publica ActivationRequested, junta los resultados de billing y provisioning
 * y decide si la activación terminó bien o mal.
 */
export class ActivationSaga {
  private readonly logger = new Logger('ActivationSaga');

  constructor(
    private readonly store: ActivationStore,
    private readonly publisher: EventPublisher,
    private readonly processed: ProcessedEvents,
    private readonly notifier: ActivationNotifier,
  ) {}

  /** POST /activations: guarda, publica y responde sin esperar a los demás servicios (202). */
  async request(input: NewActivation): Promise<Activation> {
    const id = await this.store.nextId();
    const event = createEvent('ActivationRequested', {
      correlationId: id,
      customerId: input.customerId,
      source: SOURCE,
      payload: { planId: input.planId, channel: 'web', simulateFailure: input.simulateFailure },
    });
    const now = event.occurredAt;
    const activation: Activation = {
      _id: id,
      customerId: input.customerId,
      planId: input.planId,
      status: 'PENDING',
      simulateFailure: input.simulateFailure,
      steps: {},
      history: [toHistoryEntry(event)],
      createdAt: now,
      updatedAt: now,
    };
    await this.store.insert(activation);
    // Fase 2: se publica directo después de guardar. Riesgo documentado: si el proceso se cae
    // entre las dos líneas, la activación queda en PENDING. La fase 4 lo resuelve con outbox.
    await this.publisher.publish(event);
    this.notifier.changed(activation, event);
    return activation;
  }

  /** Consume billing.events y provisioning.events. */
  async onResult(event: EventEnvelope): Promise<void> {
    await handleOnce(this.processed, event, () => this.apply(event));
  }

  private async apply(event: EventEnvelope): Promise<void> {
    const id = event.correlationId;
    const entry = toHistoryEntry(event);

    if (event.eventType === 'BillingAccountCancelled') {
      // La compensación no cambia el estado (ya es FAILED); solo queda en la timeline.
      const updated = await this.store.appendHistory(id, entry);
      if (updated) this.notifier.changed(updated, event);
      return;
    }

    const outcome = this.classify(event);
    if (!outcome) {
      this.logger.warn(`Evento ignorado: ${event.eventType}`);
      return;
    }

    const updated = await this.store.saveStep(id, outcome.step, {
      status: outcome.ok ? 'OK' : 'FAILED',
      at: event.occurredAt,
      reason: outcome.reason,
    }, entry);
    if (!updated) {
      this.logger.warn(`Activación desconocida: ${id}`);
      return;
    }
    this.notifier.changed(updated, event);

    // Regla de agregación: con el primer fallo, FAILED; con los dos OK, ACTIVE.
    // finish() solo transiciona una vez: los resultados que lleguen después quedan solo en el historial.
    if (!outcome.ok) {
      await this.finishFailed(updated, outcome.step, outcome.reason ?? 'error');
    } else if (updated.steps.billing?.status === 'OK' && updated.steps.provisioning?.status === 'OK') {
      await this.finishCompleted(updated);
    }
  }

  private classify(event: EventEnvelope): { step: Step; ok: boolean; reason?: string } | null {
    const p = event.payload as { reason?: string };
    switch (event.eventType) {
      case 'BillingAccountCreated': return { step: 'billing', ok: true };
      case 'BillingFailed': return { step: 'billing', ok: false, reason: p.reason };
      case 'ProvisioningCompleted': return { step: 'provisioning', ok: true };
      case 'ProvisioningFailed': return { step: 'provisioning', ok: false, reason: p.reason };
      default: return null;
    }
  }

  private async finishCompleted(a: Activation) {
    const event = createEvent('ActivationCompleted', {
      correlationId: a._id, customerId: a.customerId, source: SOURCE, payload: { planId: a.planId },
    });
    if (await this.store.finish(a._id, 'ACTIVE', toHistoryEntry(event))) {
      await this.publisher.publish(event);
      await this.notifyLatest(a._id, event);
    }
  }

  private async finishFailed(a: Activation, failedStep: Step, reason: string) {
    const event = createEvent('ActivationFailed', {
      correlationId: a._id, customerId: a.customerId, source: SOURCE,
      payload: { planId: a.planId, failedStep, reason },
    });
    if (await this.store.finish(a._id, 'FAILED', toHistoryEntry(event), reason)) {
      await this.publisher.publish(event);
      await this.notifyLatest(a._id, event);
    }
  }

  private async notifyLatest(id: string, event: EventEnvelope) {
    const latest = await this.store.get(id);
    if (latest) this.notifier.changed(latest, event);
  }
}
