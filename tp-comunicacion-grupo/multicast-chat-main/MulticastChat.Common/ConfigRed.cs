using System.Net;

namespace MulticastChat.Common;

public static class ConfigRed
{
    public static readonly IPAddress DireccionMulticast = IPAddress.Parse("239.0.0.222");
    public const int PuertoMulticast = 5000;
}
