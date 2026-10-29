#!/bin/bash
# Crea los cuatro topics de negocio: 3 particiones, retención de 7 días.
# La clave de cada mensaje es el customerId, así los eventos de un cliente van a la misma partición.
set -e
BOOTSTRAP="${BOOTSTRAP:-kafka:29092}"
KT=/opt/kafka/bin/kafka-topics.sh
RETENTION_MS=604800000

for topic in activation.requested billing.events provisioning.events activation.events; do
  $KT --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
    --topic "$topic" --partitions 3 --replication-factor 1 \
    --config retention.ms=$RETENTION_MS
done

echo "Topics creados:"
$KT --bootstrap-server "$BOOTSTRAP" --list
