import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventEnvelope } from '../../../libs/contracts/src';
import { Activation, ActivationNotifier } from './activation.model';

/** Empuja cada cambio de una activación a la UI (timeline en vivo). */
@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements ActivationNotifier, OnGatewayConnection {
  private readonly logger = new Logger('EventsGateway');
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(`UI conectada: ${client.id}`);
  }

  changed(activation: Activation, event: EventEnvelope): void {
    this.server?.emit('activation', { activation: serialize(activation), event });
  }
}

export const serialize = ({ _id, ...rest }: Activation) => ({ activationId: _id, ...rest });
