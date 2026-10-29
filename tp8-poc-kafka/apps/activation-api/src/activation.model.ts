import { EventEnvelope, FailureMode } from '../../../libs/contracts/src';

export type ActivationStatus = 'PENDING' | 'IN_PROGRESS' | 'ACTIVE' | 'FAILED';
export type Step = 'billing' | 'provisioning';

export interface StepResult {
  status: 'OK' | 'FAILED';
  at: string;
  reason?: string;
}

export interface HistoryEntry {
  eventId: string;
  eventType: string;
  source: string;
  at: string;
  payload: unknown;
}

export interface Activation {
  _id: string; // activationId = correlationId de todos sus eventos
  customerId: string;
  planId: string;
  status: ActivationStatus;
  simulateFailure: FailureMode;
  steps: Partial<Record<Step, StepResult>>;
  history: HistoryEntry[];
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** Persistencia del estado de la saga (MongoDB en producción, memoria en los tests). */
export interface ActivationStore {
  nextId(): Promise<string>;
  insert(activation: Activation): Promise<void>;
  get(id: string): Promise<Activation | null>;
  list(limit: number): Promise<Activation[]>;
  /** Guarda el resultado de un paso, agrega la entrada al historial y pasa PENDING -> IN_PROGRESS. */
  saveStep(id: string, step: Step, result: StepResult, entry: HistoryEntry): Promise<Activation | null>;
  appendHistory(id: string, entry: HistoryEntry): Promise<Activation | null>;
  /** Pasa a un estado final solo si todavía no terminó. Devuelve false si ya estaba en ACTIVE o FAILED. */
  finish(id: string, status: 'ACTIVE' | 'FAILED', entry: HistoryEntry, reason?: string): Promise<boolean>;
}

/** Aviso a la UI (WebSocket) de cada cambio de una activación. */
export interface ActivationNotifier {
  changed(activation: Activation, event: EventEnvelope): void;
}

export const toHistoryEntry = (e: EventEnvelope): HistoryEntry => ({
  eventId: e.eventId,
  eventType: e.eventType,
  source: e.source,
  at: e.occurredAt,
  payload: e.payload,
});

export const ACTIVATION_STORE = 'ACTIVATION_STORE';
export const EVENT_PUBLISHER = 'EVENT_PUBLISHER';
export const PROCESSED_EVENTS = 'PROCESSED_EVENTS';
