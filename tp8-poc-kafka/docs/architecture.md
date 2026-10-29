# Arquitectura · fase 2

## Flujo

1. La UI hace `POST /activations`. `activation-api` guarda la activación en `PENDING`, publica
   `ActivationRequested` en `activation.requested` y responde **202** con el `activationId` (RF-01 a RF-03).
2. billing y provisioning consumen el mismo evento **en paralelo**, cada uno en su consumer group (RF-04):
   - billing crea la cuenta simulada (`BA-<activationId>`) y publica `BillingAccountCreated`, o `BillingFailed`
     si se pidió el fallo;
   - provisioning espera de 1 a 3 s y publica `ProvisioningCompleted` o `ProvisioningFailed`.
3. `activation-api` consume `billing.events` y `provisioning.events`, guarda cada resultado y aplica la regla de
   agregación:
   - el primer resultado pasa la activación a `IN_PROGRESS`;
   - con los dos OK: `ACTIVE` y `ActivationCompleted` (RF-05);
   - con el primer fallo: `FAILED` y `ActivationFailed`; los resultados posteriores solo se registran en el
     historial (RF-06).
4. billing consume `ActivationFailed` y anula la cuenta si la había creado: `BillingAccountCancelled`
   (compensación).
5. notification consume `activation.events` y manda el email de bienvenida o de error a Mailhog (RF-07).
6. crm-analytics registra todos los eventos en `event_log` (RF-10).
7. Cada cambio se empuja a la UI por WebSocket (RF-08); `GET /activations/:id` devuelve estado e historial (RF-09).

## Estados

| Estado | Cuándo | Siguiente |
| --- | --- | --- |
| PENDING | Al crear la activación | IN_PROGRESS |
| IN_PROGRESS | Llegó el primer resultado | ACTIVE o FAILED |
| ACTIVE | Billing y provisioning confirmaron | final |
| FAILED | Alguno falló | final (con compensación) |

## Caso borde

Si provisioning falla y la activación se cierra antes de que billing cree la cuenta, billing recibe
`ActivationFailed` sin cuenta que anular. Guarda el `activationId` en `failed_activations` y, cuando termina de
crear la cuenta, ve que la activación ya había fallado y la anula enseguida.

## Contrato de eventos

Todos comparten el sobre de `libs/contracts`:

```json
{
  "eventId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "eventType": "ActivationRequested",
  "version": 1,
  "occurredAt": "2026-09-27T16:40:00Z",
  "correlationId": "act-0001",
  "customerId": "C-1234",
  "source": "activation-api",
  "payload": { "planId": "PLAN DIGITAL", "channel": "web", "simulateFailure": "none" }
}
```

Además, cada mensaje lleva en los headers de Kafka `correlationId` y `eventType`, y usa `customerId` como clave.

## Datos (MongoDB, una base por servicio)

| Colección | Servicio | Índices |
| --- | --- | --- |
| activations | activation-api | `_id` = activationId; customerId; createdAt |
| counters | activation-api | contador de `act-NNNN` |
| billing_accounts | billing | activationId único |
| failed_activations | billing | `_id` = activationId |
| provisioning_orders | provisioning | activationId único |
| notifications | notification | activationId + eventType único |
| event_log | crm-analytics | eventId único; correlationId |
| processed_events | todos los consumidores | eventId único; TTL 7 días |
