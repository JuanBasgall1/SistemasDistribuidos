/**
 * Contratos de eventos compartidos: la única fuente de verdad de topics,
 * tipos de evento y sobre común. Todos los servicios importan desde acá.
 */
import { randomUUID } from 'crypto';

export const TOPICS = {
  ACTIVATION_REQUESTED: 'activation.requested',
  BILLING_EVENTS: 'billing.events',
  PROVISIONING_EVENTS: 'provisioning.events',
  ACTIVATION_EVENTS: 'activation.events',
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

export type FailureMode = 'none' | 'billing' | 'provisioning';

export interface ActivationRequestedPayload {
  planId: string;
  channel: string;
  simulateFailure: FailureMode;
}
export interface BillingAccountCreatedPayload { billingAccountId: string }
export interface BillingFailedPayload { reason: string }
export interface BillingAccountCancelledPayload { billingAccountId: string; reason: string }
export interface ProvisioningCompletedPayload { provisioningOrderId: string }
export interface ProvisioningFailedPayload { reason: string }
export interface ActivationCompletedPayload { planId: string }
export interface ActivationFailedPayload { planId: string; failedStep: 'billing' | 'provisioning'; reason: string }

/** Tipo de evento -> payload. Los nombres van en pasado: describen un hecho. */
export interface EventPayloads {
  ActivationRequested: ActivationRequestedPayload;
  BillingAccountCreated: BillingAccountCreatedPayload;
  BillingFailed: BillingFailedPayload;
  BillingAccountCancelled: BillingAccountCancelledPayload;
  ProvisioningCompleted: ProvisioningCompletedPayload;
  ProvisioningFailed: ProvisioningFailedPayload;
  ActivationCompleted: ActivationCompletedPayload;
  ActivationFailed: ActivationFailedPayload;
}

export type EventType = keyof EventPayloads;

/** Topic donde se publica cada tipo de evento. */
export const TOPIC_OF: Record<EventType, Topic> = {
  ActivationRequested: TOPICS.ACTIVATION_REQUESTED,
  BillingAccountCreated: TOPICS.BILLING_EVENTS,
  BillingFailed: TOPICS.BILLING_EVENTS,
  BillingAccountCancelled: TOPICS.BILLING_EVENTS,
  ProvisioningCompleted: TOPICS.PROVISIONING_EVENTS,
  ProvisioningFailed: TOPICS.PROVISIONING_EVENTS,
  ActivationCompleted: TOPICS.ACTIVATION_EVENTS,
  ActivationFailed: TOPICS.ACTIVATION_EVENTS,
};

/** Sobre común a todos los eventos. Cambios compatibles suman campos opcionales; los incompatibles suben version. */
export interface EventEnvelope<T extends EventType = EventType> {
  eventId: string;
  eventType: T;
  version: number;
  occurredAt: string;
  correlationId: string; // = activationId
  customerId: string; // = clave del mensaje en Kafka (orden por cliente)
  source: string;
  payload: EventPayloads[T];
}

export const CONTRACT_VERSION = 1;

export function createEvent<T extends EventType>(
  eventType: T,
  args: { correlationId: string; customerId: string; source: string; payload: EventPayloads[T] },
): EventEnvelope<T> {
  return {
    eventId: randomUUID(),
    eventType,
    version: CONTRACT_VERSION,
    occurredAt: new Date().toISOString(),
    correlationId: args.correlationId,
    customerId: args.customerId,
    source: args.source,
    payload: args.payload,
  };
}

/** Narrowing de un sobre recibido a un tipo concreto. */
export function isEvent<T extends EventType>(e: EventEnvelope, type: T): e is EventEnvelope<T> {
  return e.eventType === type;
}
