import { EventEnvelope } from '../../contracts/src';

/** Publica un evento en su topic, con customerId como clave. */
export interface EventPublisher {
  publish(event: EventEnvelope): Promise<void>;
}

/** Registro de eventos ya procesados por un consumidor (base de la idempotencia). */
export interface ProcessedEvents {
  has(eventId: string): Promise<boolean>;
  mark(eventId: string, eventType: string): Promise<void>;
}
