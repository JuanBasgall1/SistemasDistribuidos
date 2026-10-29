using System.Net;
using System.Net.Sockets;
using System.Text;
using MulticastChat.Common;

Console.Title = "Coordinador";

// Configuración multicast
using var udp = new UdpClient();
udp.JoinMulticastGroup(ConfigRed.DireccionMulticast);

// Escuchar el grupo multicast (mensajes internos de nodos)
_ = Task.Run(async () =>
{
    using var udpListener = new UdpClient(ConfigRed.PuertoMulticast);
    udpListener.JoinMulticastGroup(ConfigRed.DireccionMulticast);

    Console.WriteLine("[Coordinador] Escuchando mensajes multicast...");

    while (true)
    {
        var res = await udpListener.ReceiveAsync();
        var msg = Cable.Deserializar(res.Buffer);
        if (msg != null)
        {
            Console.WriteLine($"[Coordinador] (Multicast) {msg.EmisorId}: {msg.Contenido}");
        }
    }
});

// Servidor TCP para mensajes externos
var listener = new TcpListener(IPAddress.Any, 6000);
listener.Start();
Console.WriteLine("[Coordinador] Esperando conexiones externas en puerto 6000...");

while (true)
{
    using var client = listener.AcceptTcpClient();
    using var stream = client.GetStream();
    using var reader = new StreamReader(stream, Encoding.UTF8);

    string? texto = reader.ReadLine();
    if (!string.IsNullOrWhiteSpace(texto))
    {
        var mensaje = new Mensaje(
            Guid.NewGuid(),
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), 
            "COORDINADOR",
            TipoMensaje.Externo,
            texto,
            DateTimeOffset.UtcNow
        );

        var data = Cable.Serializar(mensaje);
        await udp.SendAsync(data, data.Length,
            new IPEndPoint(ConfigRed.DireccionMulticast, ConfigRed.PuertoMulticast));

        Console.WriteLine($"[Coordinador] Difundido mensaje externo: {texto}");
    }
}
