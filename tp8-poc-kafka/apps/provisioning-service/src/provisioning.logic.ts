import { Logger } from '@nestjs/common';
import { createEvent, EventEnvelope, isEvent } from '../../../libs/contracts/src';
import { EventPublisher, handleOnce, ProcessedEvents, randomBetween, sleep } from '../../../libs/kafka-toolkit/src';

export const SOURCE = 'provisioning-service';

export interface ProvisioningOrder {
  provisioningOrderId: string;
  activationId: string;
  customerId: string;
  planId: string;
  status: 'COMPLETED' | 'FAILED';
  reason?: string;
  at: string;
}

export interface ProvisioningStore {
  /** Devuelve false si ya existía una orden para la activación. */
  save(order: ProvisioningOrder): Promise<boolean>;
}

/** provisioning-service: simula el aprovisionamiento con un retardo de 1 a 3 segundos. */
export class ProvisioningLogic {
  private readonly logger = new Logger('Provisioning');

  constructor(
    private readonly store: ProvisioningStore,
    private readonly publisher: EventPublisher,
    private readonly processed: ProcessedEvents,
    private readonly delay: () => Promise<void> = () => sleep(randomBetween(1000, 3000)),
  ) {}

  async onActivationRequested(event: EventEnvelope) {
    if (!isEvent(event, 'ActivationRequested')) return;
    await handleOnce(this.processed, event, async () => {
      await this.delay();
      const fail = event.payload.simulateFailure === 'provisioning';
      const order: ProvisioningOrder = {
        provisioningOrderId: `PO-${event.correlationId}`,
        activationId: event.correlationId,
        customerId: event.customerId,
        planId: event.payload.planId,
        status: fail ? 'FAILED' : 'COMPLETED',
        reason: fail ? 'Fallo simulado en aprovisionamiento' : undefined,
        at: new Date().toISOString(),
      };
      if (!(await this.store.save(order))) {
        this.logger.warn(`La orden de ${event.correlationId} ya existía; no se duplica`);
        return;
      }
      const base = { correlationId: event.correlationId, customerId: event.customerId, source: SOURCE };
      await this.publisher.publish(
        fail
          ? createEvent('ProvisioningFailed', { ...base, payload: { reason: order.reason! } })
          : createEvent('ProvisioningCompleted', { ...base, payload: { provisioningOrderId: order.provisioningOrderId } }),
      );
    });
  }
}
