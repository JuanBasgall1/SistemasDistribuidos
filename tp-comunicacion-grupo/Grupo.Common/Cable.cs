using System.Text;
using System.Text.Json;

namespace Grupo.Common;

// Serialización de mensajes a bytes (JSON en UTF-8) para viajar en un datagrama UDP.
public static class Cable
{
    static readonly JsonSerializerOptions Opciones = new(JsonSerializerDefaults.Web);

    public static byte[] Serializar(Mensaje msg)
        => Encoding.UTF8.GetBytes(JsonSerializer.Serialize(msg, Opciones));

    public static Mensaje? Deserializar(byte[] bytes)
    {
        try { return JsonSerializer.Deserialize<Mensaje>(bytes, Opciones); }
        catch (JsonException) { return null; } // datagrama ajeno al protocolo: se ignora
    }
}
