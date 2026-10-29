namespace Grupo.Common;

public enum TipoMensaje
{
    Presente,   // latido periódico: "sigo en el grupo" (membresía)
    Salida,     // abandono voluntario del grupo
    Propuesta,  // fase 1: el mensaje viaja pero todavía NO se entrega
    Ack,        // un miembro confirma que recibió la propuesta
    Confirmar,  // fase 2: respondieron todos -> se entrega en todos
    Abortar     // faltó alguno -> se descarta en todos
}

public record Mensaje(
    Guid IdMensaje,
    long NumeroSecuencia,
    string EmisorId,
    TipoMensaje Tipo,
    string Contenido,
    DateTimeOffset FechaEnvioUtc,
    Guid? Referencia = null,   // para Ack/Confirmar/Abortar: id de la propuesta
    bool EsExterno = false);   // true si lo originó un cliente fuera del grupo
