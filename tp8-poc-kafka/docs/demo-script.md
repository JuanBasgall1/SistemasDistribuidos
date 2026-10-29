# Guion de la demo · fase 2

Pantalla dividida: Demo UI (http://localhost:5173) a la izquierda, Kafka UI (http://localhost:8080) a la derecha.
Tener Mailhog (http://localhost:8025) en otra pestaña. Duración: unos 8 minutos.

## Antes de empezar

```bash
docker compose up --build -d
docker compose ps        # todos "running", kafka-init "exited (0)"
```

En Kafka UI, mostrar los cuatro topics con 3 particiones y los consumer groups (`billing-service`,
`provisioning-service`, `activation-api`, `notification-service`, `crm-analytics-service`).

## Escenario 1 · Camino feliz (fan-out)

1. Contratar `PLAN DIGITAL` para `C-1234`, sin fallo.
2. La API responde al instante; la timeline se completa sola en 1 a 3 segundos:
   `ActivationRequested` → `BillingAccountCreated` → `ProvisioningCompleted` → `ActivationCompleted`.
3. Mailhog: email de bienvenida.
4. Kafka UI: abrir `activation.requested` y mostrar que el mensaje tiene clave `C-1234`; un solo mensaje fue
   consumido por tres groups (billing, provisioning y crm-analytics).

**Concepto:** un evento, varias reacciones. Nadie llamó a nadie.

## Escenario 2 · Fallo y compensación (saga)

1. Contratar con **Fallo en provisioning**.
2. Timeline: `BillingAccountCreated` → `ProvisioningFailed` → `ActivationFailed` → `BillingAccountCancelled`.
3. Mailhog: email de error.
4. Repetir con **Fallo en billing**: no hay compensación porque nunca se creó la cuenta; el
   `ProvisioningCompleted` que llega después queda en el historial pero no cambia el estado.

**Concepto:** saga coreografiada; la compensación también es un evento.

## Extra · Servicio caído (ya funciona en esta fase)

```bash
docker compose stop notification-service
# crear 3 activaciones desde la UI
docker compose start notification-service
```

Kafka UI muestra lag de 3 en `notification-service`; al volver, llegan los 3 emails.

**Concepto:** el offset del consumer group; nadie pierde mensajes.
