using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.ApiService;

public sealed class SaveServiceAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> schemeOptions,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IOptions<SaveServiceOptions> serviceOptions)
    : AuthenticationHandler<AuthenticationSchemeOptions>(schemeOptions, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!AuthenticationHeaderValue.TryParse(Request.Headers.Authorization, out var authorization)
            || !string.Equals(authorization.Scheme, "Bearer", StringComparison.OrdinalIgnoreCase)
            || !SaveServiceOptions.IsValidApiKey(authorization.Parameter))
        {
            return Task.FromResult(AuthenticateResult.Fail("A trusted web service credential is required."));
        }

        if (!CryptographicOperations.FixedTimeEquals(
            Convert.FromHexString(authorization.Parameter!),
            Convert.FromHexString(serviceOptions.Value.ApiKey)))
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid service credential."));
        }

        var nameHeader = Request.Headers[SaveServiceOptions.UserNameHeader];
        var sidHeader = Request.Headers[SaveServiceOptions.UserSidHeader];
        if (nameHeader.Count != 1 || nameHeader[0] is not { Length: > 0 and <= 2048 } encodedName || sidHeader.Count > 1)
        {
            return Task.FromResult(AuthenticateResult.Fail("A Windows identity is required."));
        }

        string name;
        try
        {
            name = Uri.UnescapeDataString(encodedName).Normalize(NormalizationForm.FormC);
        }
        catch (ArgumentException)
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid Windows identity."));
        }

        if (string.IsNullOrWhiteSpace(name) || name.Length > 256 || name.Any(char.IsControl))
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid Windows identity."));
        }

        var sid = sidHeader.ToString();
        if (sid.Length > 0 && !ValidSid(sid))
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid Windows SID."));
        }

        var ownerId = sid.Length > 0 ? $"windows-sid:{sid}" : $"windows-name:{name.ToUpperInvariant()}";
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, ownerId),
            new(ClaimTypes.Name, name)
        };
        if (sid.Length > 0) claims.Add(new(ClaimTypes.PrimarySid, sid));
        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    private static bool ValidSid(string sid)
    {
        if (sid.Length > 184 || !sid.StartsWith("S-", StringComparison.Ordinal)) return false;
        var parts = sid.Split('-');
        return parts.Length >= 4 && parts.Skip(1).All(part => part.Length > 0 && part.All(char.IsAsciiDigit));
    }
}
