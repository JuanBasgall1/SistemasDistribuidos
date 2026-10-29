using System.Net;

namespace Grupo.Common;

public static class ConfigRed
{
    // Dirección de grupo (rango multicast administrado localmente 239.0.0.0/8)
    public static readonly IPAddress DireccionMulticast = IPAddress.Parse("239.0.0.222");
    public const int PuertoMulticast = 5000;

    // Puerto TCP del coordinador para clientes externos al grupo
    public const int PuertoCoordinador = 6000;
}
