import { Logger } from '@nestjs/common';
import { ClientKafka, KafkaOptions, Transport } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { EventEnvelope, TOPIC_OF } from '../../contracts/src';
import { EventPublisher } from './ports';

export const KAFKA_CLIENT = 'KAFKA_CLIENT';

const brokers = () => (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');

/**
 * Opciones del servidor Kafka de Nest (consumidor).
 * postfixId vacío: el consumer group se llama exactamente como KAFKA_GROUP_ID,
 * así se ve claro en Kafka UI (Nest agrega "-server" por defecto).
 */
export function consumerOptions(service: string, opts: { fromBeginning?: boolean } = {}): KafkaOptions {
  return {
    transport: Transport.KAFKA,
    options: {
      postfixId: '',
      client: { clientId: process.env.KAFKA_CLIENT_ID ?? service, brokers: brokers() },
      consumer: { groupId: process.env.KAFKA_GROUP_ID ?? service, allowAutoTopicCreation: false },
      subscribe: { fromBeginning: opts.fromBeginning ?? false },
      run: { autoCommit: true },
    },
  };
}

/** Opciones del cliente Kafka de Nest (productor). */
export function producerOptions(service: string) {
  return {
    name: KAFKA_CLIENT,
    transport: Transport.KAFKA as const,
    options: {
      postfixId: '',
      producerOnlyMode: true,
      client: { clientId: `${process.env.KAFKA_CLIENT_ID ?? service}-producer`, brokers: brokers() },
      producer: { allowAutoTopicCreation: false, idempotent: true, maxInFlightRequests: 1 },
    },
  };
}

/** Publicador sobre ClientKafka: topic según el tipo de evento, clave = customerId. */
export class KafkaEventPublisher implements EventPublisher {
  private readonly logger = new Logger('KafkaEventPublisher');

  constructor(private readonly client: ClientKafka) {}

  async publish(event: EventEnvelope): Promise<void> {
    const topic = TOPIC_OF[event.eventType];
    await lastValueFrom(
      this.client.emit(topic, {
        key: event.customerId,
        value: event,
        headers: { correlationId: event.correlationId, eventType: event.eventType },
      }),
    );
    this.logger.log(`${event.eventType} -> ${topic} [${event.correlationId}]`);
  }
}
