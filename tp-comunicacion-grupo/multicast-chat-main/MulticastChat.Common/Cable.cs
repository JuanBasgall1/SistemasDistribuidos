using System.Text;
using System.Text.Json;

namespace MulticastChat.Common;

public static class Cable
{
    static readonly JsonSerializerOptions Opciones = new(JsonSerializerDefaults.Web);

    public static byte[] Serializar(Mensaje msg)
        => Encoding.UTF8.GetBytes(JsonSerializer.Serialize(msg, Opciones));

    public static Mensaje? Deserializar(ReadOnlySpan<byte> bytes)
        => JsonSerializer.Deserialize<Mensaje>(bytes, Opciones);
}
