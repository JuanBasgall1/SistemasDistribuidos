# Sistemas Distribuidos · UTN

Trabajos prácticos de la materia. Cada uno es independiente y tiene su propio README.

| Carpeta | Qué es | Tecnología |
|---|---|---|
| [`base-catedra/`](base-catedra) | Esqueleto inicial que dio la cátedra: comunicación con sockets UDP y sincronización de relojes (algoritmo de Cristian, NTP). Punto de partida del TP de sockets. | Java (Eclipse) |
| [`tp-comunicacion-grupo/`](tp-comunicacion-grupo) | Comunicación en grupo por IP multicast con entrega atómica (compromiso en dos fases), coordinador y cliente externo. | C# / .NET 9 |
| [`tp8-poc-kafka/`](tp8-poc-kafka) | POC de activación de servicios con Kafka: un evento `ActivationRequested` y cinco servicios que reaccionan por su cuenta, con saga de compensación e idempotencia. | TypeScript + Docker |

Las notebooks de la cátedra (`GdRottoli/notebooks`) se clonan aparte en `notebooks/` y no forman parte de este repo.
