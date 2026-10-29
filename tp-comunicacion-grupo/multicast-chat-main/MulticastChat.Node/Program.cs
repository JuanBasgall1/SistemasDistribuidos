using System.Net;
using System.Net.Sockets;
using MulticastChat.Common;

string nodoId = args.Length > 0 ? args[0] : $"Nodo-{Environment.ProcessId}";
Console.Title = nodoId;

// Crear socket ligado al puerto multicast
using var udp = new UdpClient();
udp.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
udp.Client.Bind(new IPEndPoint(IPAddress.Any, ConfigRed.PuertoMulticast));
udp.JoinMulticastGroup(ConfigRed.DireccionMulticast);

// Hilo para recibir
_ = Task.Run(async () =>
{
    while (true)
    {
        var res = await udp.ReceiveAsync();
        var msg = Cable.Deserializar(res.Buffer);
        if (msg != null)
        {
            Console.WriteLine($"[RECIBIDO] ({msg.Tipo}) {msg.EmisorId}: {msg.Contenido}");
        }
    }
});

// Bucle de envío
Console.WriteLine($"[{nodoId}] listo. Escribí un mensaje y Enter para enviar. /q para salir.");

while (true)
{
    var linea = Console.ReadLine();
    if (string.IsNullOrWhiteSpace(linea)) continue;
    if (linea.Trim() == "/q") break;

    var mensaje = new Mensaje(
        Guid.NewGuid(),
        0,
        nodoId,
        TipoMensaje.Interno,
        linea,
        DateTimeOffset.UtcNow
    );

    var data = Cable.Serializar(mensaje);
    await udp.SendAsync(
        data,
        data.Length,
        new IPEndPoint(ConfigRed.DireccionMulticast, ConfigRed.PuertoMulticast)
    );
}

