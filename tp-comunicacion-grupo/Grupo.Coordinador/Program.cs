using System.Net;
using System.Net.Sockets;
using System.Text;
using Grupo.Common;

// El coordinador es un miembro más del grupo multicast y además la única puerta
// de entrada para los procesos externos (grupo cerrado): los clientes de afuera
// le hablan por TCP y él difunde sus mensajes al grupo de forma atómica.
Console.Title = "Coordinador";

using var nodo = new NodoGrupo("COORDINADOR");
nodo.MensajeEntregado += m =>
    Console.WriteLine($"[ENTREGADO] #{m.NumeroSecuencia} {(m.EsExterno ? "(externo)" : m.EmisorId)}: {m.Contenido}");
nodo.Evento += e => Console.WriteLine($"[GRUPO] {e}");
nodo.Iniciar();

var listener = new TcpListener(IPAddress.Any, ConfigRed.PuertoCoordinador);
listener.Start();
Console.WriteLine($"[Coordinador] unido a {ConfigRed.DireccionMulticast}:{ConfigRed.PuertoMulticast}");
Console.WriteLine($"[Coordinador] esperando clientes externos en TCP {ConfigRed.PuertoCoordinador}...");

while (true)
{
    var cliente = await listener.AcceptTcpClientAsync();
    _ = Task.Run(() => AtenderAsync(cliente));
}

async Task AtenderAsync(TcpClient cliente)
{
    var origen = cliente.Client.RemoteEndPoint;
    Console.WriteLine($"[Coordinador] cliente externo conectado: {origen}");
    using (cliente)
    {
        var stream = cliente.GetStream();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        using var writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true };

        // Se atienden todas las líneas de la conexión, no solo la primera
        while (await reader.ReadLineAsync() is string texto)
        {
            if (string.IsNullOrWhiteSpace(texto)) continue;
            Console.WriteLine($"[Coordinador] de {origen}: \"{texto}\" -> difundiendo al grupo");

            var r = await nodo.EnviarAtomicoAsync(texto, esExterno: true);
            var respuesta = r.Entregado
                ? $"OK: entregado a {string.Join(", ", r.Destinatarios)}"
                : $"ABORTADO: no respondieron {string.Join(", ", r.SinRespuesta)}";
            Console.WriteLine($"[Coordinador] {respuesta}");
            await writer.WriteLineAsync(respuesta);
        }
    }
    Console.WriteLine($"[Coordinador] cliente externo desconectado: {origen}");
}
