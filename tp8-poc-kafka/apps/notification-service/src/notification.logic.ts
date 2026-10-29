import { Logger } from '@nestjs/common';
import { EventEnvelope, isEvent } from '../../../libs/contracts/src';
import { handleOnce, ProcessedEvents } from '../../../libs/kafka-toolkit/src';

export interface Mail { to: string; subject: string; text: string }
export interface Mailer { send(mail: Mail): Promise<void> }

export interface NotificationRecord {
  activationId: string;
  eventType: string;
  to: string;
  subject: string;
  sentAt: string;
}

export interface NotificationStore {
  /** Devuelve false si ya se había enviado el email para ese activationId + eventType. */
  save(record: NotificationRecord): Promise<boolean>;
  remove(activationId: string, eventType: string): Promise<void>;
}

/** Dirección simulada del cliente: no hay servicio de clientes en la POC. */
export const emailOf = (customerId: string) => `${customerId.toLowerCase()}@clientes.demo`;

/** notification-service: un email por cada ActivationCompleted o ActivationFailed (RF-07). */
export class NotificationLogic {
  private readonly logger = new Logger('Notification');

  constructor(
    private readonly store: NotificationStore,
    private readonly mailer: Mailer,
    private readonly processed: ProcessedEvents,
  ) {}

  async onActivationEvent(event: EventEnvelope) {
    await handleOnce(this.processed, event, async () => {
      let mail: Mail;
      if (isEvent(event, 'ActivationCompleted')) {
        mail = {
          to: emailOf(event.customerId),
          subject: `¡Bienvenido! Tu plan ${event.payload.planId} está activo`,
          text: `Hola ${event.customerId}: tu plan ${event.payload.planId} quedó activo.\nActivación: ${event.correlationId}`,
        };
      } else if (isEvent(event, 'ActivationFailed')) {
        mail = {
          to: emailOf(event.customerId),
          subject: `No pudimos activar tu plan ${event.payload.planId}`,
          text: `Hola ${event.customerId}: hubo un problema en ${event.payload.failedStep} (${event.payload.reason}).\n` +
            `No se te va a cobrar nada. Activación: ${event.correlationId}`,
        };
      } else {
        return;
      }
      // Registrar primero con índice único evita mandar dos veces el mismo email.
      const first = await this.store.save({
        activationId: event.correlationId, eventType: event.eventType, to: mail.to, subject: mail.subject,
        sentAt: new Date().toISOString(),
      });
      if (!first) return;
      try {
        await this.mailer.send(mail);
      } catch (e) {
        // Si el envío falla, se borra el registro para que el reintento vuelva a mandarlo.
        await this.store.remove(event.correlationId, event.eventType);
        throw e;
      }
      this.logger.log(`Email "${mail.subject}" -> ${mail.to}`);
    });
  }
}
