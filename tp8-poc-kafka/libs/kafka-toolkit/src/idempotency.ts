import { EventEnvelope } from '../../contracts/src';
import { ProcessedEvents } from './ports';

/**
 * Ejecuta el efecto de un evento una sola vez.
 *
 * Kafka entrega "al menos una vez": si el consumidor se cae después de procesar y antes
 * de confirmar el offset, el mismo mensaje vuelve a llegar. Por eso cada consumidor
 * consulta processed_events antes de actuar y registra el eventId después.
 *
 * Fase 2: el efecto y la marca no son atómicos; los efectos usan además índices únicos
 * (por ejemplo, una cuenta por activationId) para que un reproceso no duplique nada.
 * En la fase 4 la marca y el efecto van en la misma transacción de Mongo.
 */
export async function handleOnce(
  processed: ProcessedEvents,
  event: EventEnvelope,
  effect: () => Promise<void>,
): Promise<'processed' | 'duplicate'> {
  if (await processed.has(event.eventId)) return 'duplicate';
  await effect();
  await processed.mark(event.eventId, event.eventType);
  return 'processed';
}

/** Espera simulada (procesamiento de un sistema externo). */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const randomBetween = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
