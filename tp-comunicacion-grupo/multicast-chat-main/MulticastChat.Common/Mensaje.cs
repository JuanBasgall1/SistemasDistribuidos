namespace MulticastChat.Common;

public enum TipoMensaje { Interno, Externo, Ack }

public record Mensaje(
    Guid IdMensaje,
    long NumeroSecuencia,
    string EmisorId,
    TipoMensaje Tipo,
    string Contenido,
    DateTimeOffset FechaEnvioUtc
);