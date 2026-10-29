import { Logger } from '@nestjs/common';
import { EventEnvelope } from '../../../libs/contracts/src';

export interface EventLogStore {
  /** Devuelve false si el eventId ya estaba registrado. */
  append(event: EventEnvelope, topic: string): Promise<boolean>;
  count(): Promise<number>;
}

/**
 * crm-analytics-service: consume todos los topics y no publica nada.
 * Demuestra que se puede sumar un consumidor sin tocar a los demás servicios.
 */
export class CrmAnalyticsLogic {
  private readonly logger = new Logger('CrmAnalytics');

  constructor(private readonly store: EventLogStore) {}

  async onEvent(event: EventEnvelope, topic: string) {
    // El índice único sobre eventId ya hace idempotente el registro.
    if (await this.store.append(event, topic)) {
      this.logger.log(`[${event.correlationId}] ${event.eventType} (${topic}) · total ${await this.store.count()}`);
    }
  }
}
