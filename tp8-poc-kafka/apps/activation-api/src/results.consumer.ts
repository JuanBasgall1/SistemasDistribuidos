import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EventEnvelope, TOPICS } from '../../../libs/contracts/src';
import { ActivationSaga } from './activation.saga';

/** activation-api consume los resultados de billing y provisioning. */
@Controller()
export class ResultsConsumer {
  constructor(private readonly saga: ActivationSaga) {}

  @EventPattern(TOPICS.BILLING_EVENTS)
  onBilling(@Payload() event: EventEnvelope) {
    return this.saga.onResult(event);
  }

  @EventPattern(TOPICS.PROVISIONING_EVENTS)
  onProvisioning(@Payload() event: EventEnvelope) {
    return this.saga.onResult(event);
  }
}
