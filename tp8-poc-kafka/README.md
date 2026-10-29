# POC Activación de Servicios con Kafka · fase 2

Sistemas Distribuidos 2026 · Ingeniería en Sistemas de Información

Un cliente contrata un plan desde la UI; `activation-api` publica **un único evento** (`ActivationRequested`) y
facturación, aprovisionamiento, notificación y CRM reaccionan por su cuenta. Ningún servicio llama a otro.

Esta entrega cubre la **fase 2**: camino feliz y fallo con compensación (escenarios 1 y 2 del guion), con
idempotencia en todos los consumidores. Reintentos con espera, DLQ, escalado y replay son la fase 3; el outbox
transaccional es la fase 4 (ver [Qué falta](#qué-falta-fases-3-y-4)).

## Levantar todo

Requisitos: Docker con Docker Compose.

```bash
docker compose up --build
```

| Qué | Dónde |
| --- | --- |
| Demo UI | http://localhost:5173 |
| API (activation-api) | http://localhost:3000 |
| Kafka UI | http://localhost:8080 |
| Mailhog (emails) | http://localhost:8025 |
| Kafka (desde el host) | localhost:9092 |
| MongoDB | localhost:27017 |

El primer arranque tarda un poco: Compose espera a que Kafka esté sano, `kafka-init` crea los topics y recién
ahí arrancan los servicios.

## Arquitectura

```
Demo UI ──POST /activations──▶ activation-api ──ActivationRequested──▶ [activation.requested]
   ▲                               │   ▲                                   │            │
   └──── WebSocket (timeline) ─────┘   │                              billing   provisioning
                                       │                                   │            │
                    [billing.events] ◀─┼───────────────────────────────────┘            │
               [provisioning.events] ◀─┴────────────────────────────────────────────────┘
                                       │
                      ActivationCompleted / ActivationFailed ──▶ [activation.events]
                                                                    │        │
                                                          notification   billing (compensación)
crm-analytics escucha los cuatro topics y no publica nada.
```

| Servicio | Consume | Publica | Base Mongo |
| --- | --- | --- | --- |
| activation-api | billing.events, provisioning.events | ActivationRequested, ActivationCompleted, ActivationFailed | `activation` |
| billing-service | activation.requested, activation.events | BillingAccountCreated, BillingFailed, BillingAccountCancelled | `billing` |
| provisioning-service | activation.requested | ProvisioningCompleted, ProvisioningFailed | `provisioning` |
| notification-service | activation.events | (emails a Mailhog) | `notification` |
| crm-analytics-service | los cuatro | nada | `crm_analytics` |

Topics: 3 particiones, retención de 7 días, clave = `customerId` (orden por cliente). Los crea
`docker/create-topics.sh`.

Más detalle en [docs/architecture.md](docs/architecture.md); guion de la demo en
[docs/demo-script.md](docs/demo-script.md).

## API

```bash
# Contratar (responde 202 enseguida, sin esperar a los demás servicios)
curl -X POST localhost:3000/activations -H 'Content-Type: application/json' \
  -d '{"customerId":"C-1234","planId":"PLAN DIGITAL","simulateFailure":"none"}'
# -> {"activationId":"act-0001","status":"PENDING"}

# Estado e historial
curl localhost:3000/activations/act-0001

# Últimas activaciones
curl localhost:3000/activations?limit=20
```

`simulateFailure`: `none`, `billing` o `provisioning`.

WebSocket (socket.io, mismo puerto 3000): evento `activation` con `{ activation, event }` en cada cambio.

## Estructura

```
activation-poc/
├── apps/
│   ├── activation-api/          REST + WebSocket + agregador de la saga
│   ├── billing-service/         cuenta simulada y compensación
│   ├── provisioning-service/    aprovisionamiento simulado (1 a 3 s)
│   ├── notification-service/    emails a Mailhog
│   ├── crm-analytics-service/   registra todos los eventos
│   └── demo-ui/                 React + Vite + socket.io-client
├── libs/
│   ├── contracts/               topics, tipos de evento y sobre común (única fuente de verdad)
│   └── kafka-toolkit/           publicador Kafka, opciones, Mongo, idempotencia
├── docker/create-topics.sh
├── test/                        pruebas de la saga con un bus en memoria
├── docker-compose.yml
└── docs/
```

Cada servicio separa la **lógica** (`*.logic.ts`, `activation.saga.ts`), que depende de interfaces, de la
**infraestructura** (stores de Mongo, publicador Kafka y cableado Nest en `main.ts`). Así la lógica se prueba
sin Kafka ni Mongo.

## Pruebas

```bash
npm install
npm test
```

Prueban la saga completa con un bus en memoria que imita topics y consumer groups:

- camino feliz: `ACTIVE`, cuatro eventos en la timeline y un email de bienvenida;
- fallo en provisioning: `FAILED`, `ActivationFailed` y anulación de la cuenta en billing;
- fallo en billing: `FAILED` sin compensación; el resultado tardío de provisioning queda solo en el historial;
- idempotencia: reentregar todos los eventos no duplica cuentas, órdenes, emails ni cierres;
- caso borde: `ActivationFailed` llega a billing antes de que cree la cuenta, y billing la anula al crearla.

### Probar la UI sin Docker

```bash
npx ts-node test/demo-server.ts        # API + WebSocket con la lógica real y un bus en memoria
cd apps/demo-ui && npm install && npm run dev
```

## Decisiones de la fase 2

- **Coreografía con agregador:** billing y provisioning reaccionan solos; `activation-api` solo junta resultados.
  La transición a `ACTIVE` o `FAILED` es un update condicional (`status ∈ {PENDING, IN_PROGRESS}`), así ocurre
  una sola vez aunque lleguen resultados tardíos o repetidos.
- **Idempotencia:** cada consumidor registra el `eventId` en `processed_events` (índice único, TTL de 7 días =
  retención de los topics). Además los efectos tienen índices únicos (una cuenta y una orden por `activationId`,
  un email por `activationId + eventType`), así un reproceso no duplica nada.
- **Orden por cliente:** la clave de cada mensaje es `customerId`.
- **Productor idempotente** de kafkajs (`idempotent: true`) para evitar duplicados al reintentar el envío.
- **Consumer groups con nombre exacto** (`postfixId: ''`): en Kafka UI se ven como `billing-service`,
  `provisioning-service`, etc.
- **crm-analytics lee desde el inicio** (`fromBeginning`): un group nuevo procesa todo el historial retenido.

## Qué falta (fases 3 y 4)

| Fase | Pendiente |
| --- | --- |
| 3 | Reintentos con espera creciente (1, 2 y 4 s) y DLQ `<topic>.dlq`; commit manual del offset; escenarios 4 (escalar billing) y 5 (servicio loyalty con replay). El escenario 3 (servicio caído) ya funciona: Kafka guarda los mensajes y el group retoma desde su offset. |
| 4 | Outbox transaccional en Mongo (el replica set ya está configurado). Hoy se publica justo después de guardar; si el proceso se cae entre las dos cosas, la activación queda en `PENDING`. |

## Limitaciones conocidas

- La marca en `processed_events` y el efecto no son atómicos (sin transacciones hasta la fase 4); lo compensan
  los índices únicos de cada efecto.
- Los handlers que fallan con un error técnico no tienen todavía reintentos controlados ni DLQ.
- Las versiones de las imágenes de Kafka UI (`latest`) conviene fijarlas antes de presentar.
