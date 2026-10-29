using System.Net.Sockets;
using System.Text;

Console.Title = "Cliente Externo";

// Parámetros: ip puerto
string ip = args.Length > 0 ? args[0] : "127.0.0.1";
int puerto = args.Length > 1 ? int.Parse(args[1]) : 6000;

using var client = new TcpClient();
await client.ConnectAsync(ip, puerto);

using var stream = client.GetStream();
using var writer = new StreamWriter(stream, Encoding.UTF8) { AutoFlush = true };

Console.WriteLine($"[Cliente Externo] Conectado al coordinador en {ip}:{puerto}");
Console.WriteLine("Escribí un mensaje y Enter para enviarlo. /q para salir.");

while (true)
{
    string? line = Console.ReadLine();
    if (string.IsNullOrWhiteSpace(line)) continue;
    if (line.Trim() == "/q") break;

    await writer.WriteLineAsync(line);
    Console.WriteLine($"[Cliente Externo] Enviado: {line}");
}
