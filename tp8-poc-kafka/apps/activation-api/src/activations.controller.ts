import { BadRequestException, Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { FailureMode } from '../../../libs/contracts/src';
import { ACTIVATION_STORE, ActivationStore } from './activation.model';
import { ActivationSaga } from './activation.saga';
import { serialize } from './events.gateway';

const FAILURE_MODES: FailureMode[] = ['none', 'billing', 'provisioning'];

interface CreateActivationDto {
  customerId?: string;
  planId?: string;
  simulateFailure?: FailureMode;
}

@Controller('activations')
export class ActivationsController {
  constructor(
    private readonly saga: ActivationSaga,
    @Inject(ACTIVATION_STORE) private readonly store: ActivationStore,
  ) {}

  /** RF-02: responde 202 con el activationId y PENDING, sin esperar a los demás servicios. */
  @Post()
  @HttpCode(202)
  async create(@Body() body: CreateActivationDto) {
    const customerId = body?.customerId?.trim();
    const planId = body?.planId?.trim();
    const simulateFailure = body?.simulateFailure ?? 'none';
    if (!customerId || !planId) throw new BadRequestException('customerId y planId son obligatorios');
    if (!FAILURE_MODES.includes(simulateFailure)) {
      throw new BadRequestException(`simulateFailure debe ser uno de: ${FAILURE_MODES.join(', ')}`);
    }
    const activation = await this.saga.request({ customerId, planId, simulateFailure });
    return { activationId: activation._id, status: activation.status };
  }

  /** Últimas activaciones (para que la UI arranque con algo). */
  @Get()
  async list(@Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return (await this.store.list(n)).map(serialize);
  }

  /** RF-09: estado actual e historial de eventos. */
  @Get(':id')
  async get(@Param('id') id: string) {
    const activation = await this.store.get(id);
    if (!activation) throw new NotFoundException(`No existe la activación ${id}`);
    return serialize(activation);
  }
}
