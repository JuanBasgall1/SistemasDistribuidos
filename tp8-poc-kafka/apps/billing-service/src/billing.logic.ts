import { Logger } from '@nestjs/common';
import { createEvent, EventEnvelope, isEvent } from '../../../libs/contracts/src';
import { EventPublisher, handleOnce, ProcessedEvents, randomBetween, sleep } from '../../../libs/kafka-toolkit/src';

export const SOURCE = 'billing-service';

export interface BillingAccount {
  billingAccountId: string;
  activationId: string;
  customerId: string;
  planId: string;
  status: 'CREATED' | 'CANCELLED';
  createdAt: string;
  cancelledAt?: string;
}

export interface BillingStore {
  findByActivation(activationId: string): Promise<BillingAccount | null>;
  /** Devuelve false si ya existía una cuenta para la activación (índice único). */
  create(account: BillingAccount): Promise<boolean>;
  /** CREATED -> CANCELLED. Devuelve la cuenta solo si la anuló en esta llamada. */
  cancel(activationId: string): Promise<BillingAccount | null>;
  /** Recuerda que la activación falló, para el caso borde. */
  markFailed(activationId: string): Promise<void>;
  isFailed(activationId: string): Promise<boolean>;
}

/**
 * billing-service: crea la cuenta de facturación simulada y la anula cuando la activación
 * falla (compensación de la saga).
 */
export class BillingLogic {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly store: BillingStore,
    private readonly publisher: EventPublisher,
    private readonly processed: ProcessedEvents,
    private readonly delay: () => Promise<void> = () => sleep(randomBetween(300, 800)),
  ) {}

  /** Consume activation.requested. */
  async onActivationRequested(event: EventEnvelope) {
    if (!isEvent(event, 'ActivationRequested')) return;
    await handleOnce(this.processed, event, async () => {
      const { correlationId: activationId, customerId } = event;
      await this.delay();

      // Error de negocio simulado: se publica como evento, no es un error técnico.
      if (event.payload.simulateFailure === 'billing') {
        await this.publish('BillingFailed', event, { reason: 'Fallo simulado en facturación' });
        return;
      }

      const account: BillingAccount = {
        billingAccountId: `BA-${activationId}`,
        activationId,
        customerId,
        planId: event.payload.planId,
        status: 'CREATED',
        createdAt: new Date().toISOString(),
      };
      if (!(await this.store.create(account))) {
        this.logger.warn(`La cuenta de ${activationId} ya existía; no se duplica`);
        return;
      }
      await this.publish('BillingAccountCreated', event, { billingAccountId: account.billingAccountId });

      // Caso borde: ActivationFailed llegó antes de que terminara de crear la cuenta.
      if (await this.store.isFailed(activationId)) {
        await this.compensate(event, 'La activación ya había fallado cuando se creó la cuenta');
      }
    });
  }

  /** Consume activation.events: solo le interesa ActivationFailed (compensación). */
  async onActivationEvent(event: EventEnvelope) {
    if (!isEvent(event, 'ActivationFailed')) return;
    await handleOnce(this.processed, event, async () => {
      await this.store.markFailed(event.correlationId);
      await this.compensate(event, `Activación fallida en ${event.payload.failedStep}`);
    });
  }

  private async compensate(cause: EventEnvelope, reason: string) {
    const cancelled = await this.store.cancel(cause.correlationId);
    if (!cancelled) return; // no había cuenta (por ejemplo, falló el propio billing) o ya estaba anulada
    await this.publish('BillingAccountCancelled', cause, { billingAccountId: cancelled.billingAccountId, reason });
  }

  private publish(type: 'BillingFailed' | 'BillingAccountCreated' | 'BillingAccountCancelled', cause: EventEnvelope, payload: any) {
    return this.publisher.publish(
      createEvent(type, { correlationId: cause.correlationId, customerId: cause.customerId, source: SOURCE, payload }),
    );
  }
}
