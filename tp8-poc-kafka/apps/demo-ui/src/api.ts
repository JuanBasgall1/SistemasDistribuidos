import { io, Socket } from 'socket.io-client';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type FailureMode = 'none' | 'billing' | 'provisioning';
export type Status = 'PENDING' | 'IN_PROGRESS' | 'ACTIVE' | 'FAILED';

export interface HistoryEntry {
  eventId: string;
  eventType: string;
  source: string;
  at: string;
  payload: Record<string, unknown>;
}

export interface Activation {
  activationId: string;
  customerId: string;
  planId: string;
  status: Status;
  simulateFailure: FailureMode;
  steps: Partial<Record<'billing' | 'provisioning', { status: 'OK' | 'FAILED'; at: string; reason?: string }>>;
  history: HistoryEntry[];
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export async function createActivation(body: { customerId: string; planId: string; simulateFailure: FailureMode }) {
  const res = await fetch(`${API_URL}/activations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`);
  return (await res.json()) as { activationId: string; status: Status };
}

export async function listActivations(): Promise<Activation[]> {
  const res = await fetch(`${API_URL}/activations?limit=20`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function connectSocket(): Socket {
  return io(API_URL, { transports: ['websocket'] });
}
