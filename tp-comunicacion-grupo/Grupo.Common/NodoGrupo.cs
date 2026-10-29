using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;

namespace Grupo.Common;

public record ResultadoEnvio(
    bool Entregado,
    IReadOnlyCollection<string> Destinatarios,
    IReadOnlyCollection<string> SinRespuesta);

/// <summary>
/// Miembro de un grupo IP multicast con entrega atómica (todos o ninguno).
///
/// Protocolo (compromiso en dos fases):
///   1. El emisor multidifunde una PROPUESTA. Cada miembro la guarda como pendiente
///      (sin entregarla) y responde con un ACK.
///   2. Si llegan los ACK de todos los miembros conocidos, el emisor multidifunde
///      CONFIRMAR y todos la entregan. Si falta alguno tras varios reintentos,
///      multidifunde ABORTAR y todos la descartan.
///
/// La membresía se mantiene con latidos (PRESENTE): un miembro que deja de latir
/// se considera caído.
/// </summary>
public sealed class NodoGrupo : IDisposable
{
    static readonly TimeSpan IntervaloLatido = TimeSpan.FromSeconds(1);
    static readonly TimeSpan VencimientoMiembro = TimeSpan.FromSeconds(4);
    static readonly TimeSpan EsperaAcks = TimeSpan.FromMilliseconds(800);
    static readonly TimeSpan VencimientoPendiente = TimeSpan.FromSeconds(10);
    const int IntentosPropuesta = 3;
    const int RepeticionesCierre = 3;

    readonly UdpClient udp;
    readonly IPEndPoint grupo = new(ConfigRed.DireccionMulticast, ConfigRed.PuertoMulticast);
    readonly CancellationTokenSource cts = new();
    readonly SemaphoreSlim envioEnCurso = new(1, 1);

    readonly ConcurrentDictionary<string, DateTimeOffset> miembros = new();
    readonly ConcurrentDictionary<Guid, Mensaje> pendientes = new();
    readonly ConcurrentDictionary<Guid, byte> resueltos = new();
    readonly ConcurrentDictionary<Guid, ConcurrentDictionary<string, byte>> acks = new();
    long secuencia;

    public string Id { get; }

    /// Simula un fallo por omisión: el nodo sigue en el grupo pero no responde propuestas.
    public bool Silenciado { get; set; }

    public event Action<Mensaje>? MensajeEntregado;
    public event Action<string>? Evento;

    public IReadOnlyCollection<string> Miembros => miembros.Keys.OrderBy(m => m).ToArray();

    public NodoGrupo(string id)
    {
        Id = id;
        udp = new UdpClient(AddressFamily.InterNetwork);
        // Varios procesos en la misma máquina comparten el puerto del grupo
        udp.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
        udp.Client.Bind(new IPEndPoint(IPAddress.Any, ConfigRed.PuertoMulticast));
        udp.JoinMulticastGroup(ConfigRed.DireccionMulticast);
        udp.MulticastLoopback = true;
    }

    public void Iniciar()
    {
        _ = Task.Run(RecibirAsync);
        _ = Task.Run(LatirAsync);
    }

    public async Task<ResultadoEnvio> EnviarAtomicoAsync(string texto, bool esExterno = false)
    {
        await envioEnCurso.WaitAsync();
        try
        {
            var destinatarios = Miembros;
            var propuesta = Nuevo(TipoMensaje.Propuesta, texto,
                numeroSecuencia: Interlocked.Increment(ref secuencia), esExterno: esExterno);
            var recibidos = acks[propuesta.IdMensaje] = new();

            bool TodosRespondieron() => destinatarios.All(recibidos.ContainsKey);

            // Fase 1: propuesta + espera de ACKs (con reintentos ante pérdidas)
            for (int intento = 1; intento <= IntentosPropuesta && !TodosRespondieron(); intento++)
            {
                if (intento > 1)
                    Evento?.Invoke($"Reintento {intento}/{IntentosPropuesta}: faltan ACK de {string.Join(", ", destinatarios.Except(recibidos.Keys))}");
                await EnviarAsync(propuesta);

                var limite = DateTime.UtcNow + EsperaAcks;
                while (!TodosRespondieron() && DateTime.UtcNow < limite)
                    await Task.Delay(20);
            }
            acks.TryRemove(propuesta.IdMensaje, out _);

            // Fase 2: confirmar o abortar en todos
            var faltan = destinatarios.Except(recibidos.Keys).ToArray();
            bool entregado = faltan.Length == 0;
            var cierre = Nuevo(entregado ? TipoMensaje.Confirmar : TipoMensaje.Abortar, "", referencia: propuesta.IdMensaje);
            for (int i = 0; i < RepeticionesCierre; i++) // se repite por si se pierde algún datagrama
                await EnviarAsync(cierre);

            if (entregado) MensajeEntregado?.Invoke(propuesta);
            return new ResultadoEnvio(entregado, destinatarios, faltan);
        }
        finally
        {
            envioEnCurso.Release();
        }
    }

    async Task RecibirAsync()
    {
        while (!cts.IsCancellationRequested)
        {
            UdpReceiveResult res;
            try { res = await udp.ReceiveAsync(cts.Token); }
            catch (OperationCanceledException) { break; }
            catch (SocketException) { continue; }

            var msg = Cable.Deserializar(res.Buffer);
            if (msg is null || msg.EmisorId == Id) continue; // ignorar el eco de lo propio
            Procesar(msg);
        }
    }

    void Procesar(Mensaje msg)
    {
        if (msg.Tipo == TipoMensaje.Salida)
        {
            if (miembros.TryRemove(msg.EmisorId, out _))
                Evento?.Invoke($"{msg.EmisorId} salió del grupo");
            return;
        }

        if (miembros.TryAdd(msg.EmisorId, DateTimeOffset.UtcNow))
            Evento?.Invoke($"{msg.EmisorId} se unió al grupo");
        else
            miembros[msg.EmisorId] = DateTimeOffset.UtcNow;

        switch (msg.Tipo)
        {
            case TipoMensaje.Propuesta:
                if (Silenciado) return;
                if (!resueltos.ContainsKey(msg.IdMensaje))
                    pendientes.TryAdd(msg.IdMensaje, msg); // si es un reintento, no se duplica
                Enviar(Nuevo(TipoMensaje.Ack, "", referencia: msg.IdMensaje));
                break;

            case TipoMensaje.Ack:
                if (msg.Referencia is Guid idAck && acks.TryGetValue(idAck, out var recibidos))
                    recibidos.TryAdd(msg.EmisorId, 0);
                break;

            case TipoMensaje.Confirmar:
                if (msg.Referencia is Guid idOk && pendientes.TryRemove(idOk, out var aEntregar))
                {
                    resueltos.TryAdd(idOk, 0);
                    MensajeEntregado?.Invoke(aEntregar);
                }
                break;

            case TipoMensaje.Abortar:
                if (msg.Referencia is Guid idNo && pendientes.TryRemove(idNo, out var descartado))
                {
                    resueltos.TryAdd(idNo, 0);
                    Evento?.Invoke($"Descartado (abortado) mensaje de {descartado.EmisorId}: \"{descartado.Contenido}\"");
                }
                break;
        }
    }

    async Task LatirAsync()
    {
        while (!cts.IsCancellationRequested)
        {
            Enviar(Nuevo(TipoMensaje.Presente, ""));

            var ahora = DateTimeOffset.UtcNow;
            foreach (var (miembro, visto) in miembros)
                if (ahora - visto > VencimientoMiembro && miembros.TryRemove(miembro, out _))
                    Evento?.Invoke($"{miembro} dejó de responder: se lo considera caído");

            foreach (var (id, msg) in pendientes)
                if (ahora - msg.FechaEnvioUtc > VencimientoPendiente && pendientes.TryRemove(id, out _))
                    Evento?.Invoke($"Descartado por timeout mensaje de {msg.EmisorId}: \"{msg.Contenido}\"");

            try { await Task.Delay(IntervaloLatido, cts.Token); }
            catch (OperationCanceledException) { break; }
        }
    }

    Mensaje Nuevo(TipoMensaje tipo, string contenido, long numeroSecuencia = 0,
                  Guid? referencia = null, bool esExterno = false)
        => new(Guid.NewGuid(), numeroSecuencia, Id, tipo, contenido, DateTimeOffset.UtcNow, referencia, esExterno);

    void Enviar(Mensaje msg)
    {
        var data = Cable.Serializar(msg);
        udp.Send(data, data.Length, grupo);
    }

    async Task EnviarAsync(Mensaje msg)
    {
        var data = Cable.Serializar(msg);
        await udp.SendAsync(data, data.Length, grupo);
    }

    public void Dispose()
    {
        try { Enviar(Nuevo(TipoMensaje.Salida, "")); } catch (SocketException) { }
        cts.Cancel();
        udp.DropMulticastGroup(ConfigRed.DireccionMulticast);
        udp.Dispose();
    }
}
