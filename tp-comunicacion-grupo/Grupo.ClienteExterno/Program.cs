using System.Net.Sockets;
using System.Text;

// Proceso externo al grupo (la "cuarta computadora"): no se une al grupo
// multicast, le envía los mensajes al coordinador por TCP.
Console.Title = "Cliente Externo";

string ip = args.Length > 0 ? args[0] : "127.0.0.1";
int puerto = args.Length > 1 ? int.Parse(args[1]) : 6000;

using var client = new TcpClient();
await client.ConnectAsync(ip, puerto);

var stream = client.GetStream();
using var reader = new StreamReader(stream, Encoding.UTF8);
using var writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true };

Console.WriteLine($"[Cliente Externo] conectado al coordinador en {ip}:{puerto}");
Console.WriteLine("Escribí un mensaje y Enter para enviarlo al grupo. /q para salir.");

while (Console.ReadLine() is string linea)
{
    linea = linea.Trim();
    if (linea.Length == 0) continue;
    if (linea == "/q") break;

    await writer.WriteLineAsync(linea);
    var respuesta = await reader.ReadLineAsync();
    if (respuesta is null)
    {
        Console.WriteLine("[Cliente Externo] el coordinador cerró la conexión");
        break;
    }
    Console.WriteLine($"[Cliente Externo] {respuesta}");
}
