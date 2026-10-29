using Grupo.Common;

string nodoId = args.Length > 0 ? args[0] : $"Nodo-{Environment.ProcessId}";
Console.Title = nodoId;

using var nodo = new NodoGrupo(nodoId);
nodo.MensajeEntregado += m =>
    Console.WriteLine(m.EsExterno
        ? $"[ENTREGADO] #{m.NumeroSecuencia} (externo, vía {m.EmisorId}): {m.Contenido}"
        : $"[ENTREGADO] #{m.NumeroSecuencia} {m.EmisorId}: {m.Contenido}");
nodo.Evento += e => Console.WriteLine($"[GRUPO] {e}");
nodo.Iniciar();

Console.WriteLine($"[{nodoId}] unido a {ConfigRed.DireccionMulticast}:{ConfigRed.PuertoMulticast}");
Console.WriteLine("Escribí un mensaje y Enter para enviarlo al grupo.");
Console.WriteLine("Comandos: /miembros  /silencio (simula fallo por omisión)  /q");

while (Console.ReadLine() is string linea)
{
    linea = linea.Trim();
    if (linea.Length == 0) continue;
    if (linea == "/q") break;

    if (linea == "/miembros")
    {
        Console.WriteLine($"[GRUPO] Miembros: {nodoId} (yo), {string.Join(", ", nodo.Miembros)}");
        continue;
    }
    if (linea == "/silencio")
    {
        nodo.Silenciado = !nodo.Silenciado;
        Console.WriteLine(nodo.Silenciado
            ? "[GRUPO] Silenciado: no se responderán propuestas (fallo por omisión)"
            : "[GRUPO] Funcionamiento normal");
        continue;
    }

    var r = await nodo.EnviarAtomicoAsync(linea);
    Console.WriteLine(r.Entregado
        ? $"[ENVÍO] Confirmado por todos ({string.Join(", ", r.Destinatarios)})"
        : $"[ENVÍO] ABORTADO: no respondieron {string.Join(", ", r.SinRespuesta)}. Nadie lo entregó.");
}
