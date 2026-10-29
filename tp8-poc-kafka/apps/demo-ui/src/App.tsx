import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Activation, connectSocket, createActivation, FailureMode, HistoryEntry, listActivations } from './api';

const PLANS = ['PLAN DIGITAL', 'PLAN FULL', 'PLAN EMPRESA'];
const FAILURES: { value: FailureMode; label: string }[] = [
  { value: 'none', label: 'Sin fallo' },
  { value: 'billing', label: 'Fallo en billing' },
  { value: 'provisioning', label: 'Fallo en provisioning' },
];

const STATUS_LABEL: Record<Activation['status'], string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  ACTIVE: 'Activa',
  FAILED: 'Fallida',
};

/** Color de cada evento en la timeline. */
function tone(eventType: string): 'ok' | 'fail' | 'comp' | 'info' {
  if (eventType.endsWith('Failed')) return 'fail';
  if (eventType.endsWith('Cancelled')) return 'comp';
  if (eventType === 'ActivationRequested') return 'info';
  return 'ok';
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export default function App() {
  const [activations, setActivations] = useState<Record<string, Activation>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ customerId: 'C-1234', planId: PLANS[0], simulateFailure: 'none' as FailureMode });

  useEffect(() => {
    listActivations()
      .then((list) => setActivations(Object.fromEntries(list.map((a) => [a.activationId, a]))))
      .catch(() => setError('No se pudo conectar con activation-api (¿está levantado en el puerto 3000?)'));

    const socket = connectSocket();
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('activation', ({ activation }: { activation: Activation }) => {
      setActivations((prev) => {
        const current = prev[activation.activationId];
        // Los avisos pueden llegar desordenados: nos quedamos con el más nuevo.
        if (current && current.history.length > activation.history.length) return prev;
        return { ...prev, [activation.activationId]: activation };
      });
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const sorted = useMemo(
    () => Object.values(activations).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [activations],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await createActivation(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page">
      <header>
        <div>
          <h1>Activación de servicios</h1>
          <p className="sub">POC Kafka · un evento, varias reacciones, ninguna llamada directa</p>
        </div>
        <div className="links">
          <span className={`dot ${connected ? 'on' : 'off'}`} />
          {connected ? 'Timeline en vivo' : 'Sin conexión'}
          <a href="http://localhost:8080" target="_blank" rel="noreferrer">Kafka UI</a>
          <a href="http://localhost:8025" target="_blank" rel="noreferrer">Mailhog</a>
        </div>
      </header>

      <main>
        <form className="card form" onSubmit={submit}>
          <h2>Contratar plan</h2>
          <label>
            Cliente
            <input
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              placeholder="C-1234"
              required
            />
          </label>
          <label>
            Plan
            <select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
              {PLANS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Forzar fallo</legend>
            {FAILURES.map((f) => (
              <label key={f.value} className="radio">
                <input
                  type="radio"
                  name="failure"
                  checked={form.simulateFailure === f.value}
                  onChange={() => setForm({ ...form, simulateFailure: f.value })}
                />
                {f.label}
              </label>
            ))}
          </fieldset>
          <button disabled={sending}>{sending ? 'Enviando…' : 'Contratar'}</button>
          {error && <p className="error">{error}</p>}
          <p className="hint">
            La API responde 202 al instante; el resto llega por eventos. Billing y provisioning trabajan en paralelo
            (provisioning tarda de 1 a 3 s).
          </p>
        </form>

        <section className="list">
          {sorted.length === 0 && <p className="empty">Todavía no hay activaciones.</p>}
          {sorted.map((a) => (
            <ActivationCard key={a.activationId} activation={a} />
          ))}
        </section>
      </main>
    </div>
  );
}

function ActivationCard({ activation: a }: { activation: Activation }) {
  return (
    <article className="card activation">
      <div className="head">
        <div>
          <strong>{a.activationId}</strong> · {a.customerId} · {a.planId}
          {a.simulateFailure !== 'none' && <span className="tag">fallo forzado: {a.simulateFailure}</span>}
        </div>
        <span className={`status ${a.status}`}>{STATUS_LABEL[a.status]}</span>
      </div>
      <ol className="timeline">
        {a.history.map((h) => (
          <TimelineItem key={h.eventId} entry={h} />
        ))}
      </ol>
      {a.failureReason && <p className="reason">Motivo: {a.failureReason}</p>}
    </article>
  );
}

function TimelineItem({ entry }: { entry: HistoryEntry }) {
  return (
    <li className={tone(entry.eventType)}>
      <span className="when">{time(entry.at)}</span>
      <span className="what">{entry.eventType}</span>
      <span className="who">{entry.source}</span>
    </li>
  );
}
