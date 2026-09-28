using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.ApiService;

/// <summary>
/// Custom authentication scheme for the API — there's no cookie/JWT/OAuth here, just a shared
/// secret (Bearer token) proving the caller is the trusted Web front end, plus a pair of headers
/// carrying the already-Negotiate-authenticated Windows identity that Web wants this request
/// attributed to. In other words: Web does the real Windows auth handshake with the browser, then
/// vouches for the result to the API using this scheme. The API never talks Negotiate itself.
/// </summary>
public sealed class SaveServiceAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> schemeOptions,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IOptions<SaveServiceOptions> serviceOptions)
    : AuthenticationHandler<AuthenticationSchemeOptions>(schemeOptions, logger, encoder)
{
    /// <summary>
    /// Runs on every authenticated request. Validates the shared-secret Bearer token first (fails
    /// closed on anything wrong with it), then validates and extracts the Windows identity headers,
    /// and finally builds a ClaimsPrincipal representing that identity for the rest of the pipeline
    /// (endpoint handlers in GameSaveEndpoints.cs / RankingEndpoints.cs) to use.
    /// </summary>
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // No Authorization header at all — treat this as "not attempted" rather than "failed", which
        // is the correct signal for ASP.NET Core's auth middleware when a scheme simply doesn't apply.
        if (!Request.Headers.ContainsKey("Authorization")) return Task.FromResult(AuthenticateResult.NoResult());

        // The header must be a well-formed "Bearer <64-hex-char-secret>" value — anything else
        // (wrong scheme, malformed value, wrong-shaped secret) is rejected outright before we even
        // look at the actual secret value, to avoid doing the expensive comparison below for
        // obviously-invalid input.
        if (!AuthenticationHeaderValue.TryParse(Request.Headers.Authorization, out var authorization)
            || !string.Equals(authorization.Scheme, "Bearer", StringComparison.OrdinalIgnoreCase)
            || !SaveServiceOptions.IsValidApiKey(authorization.Parameter))
            return Task.FromResult(AuthenticateResult.Fail("A trusted web service credential is required."));

        // Constant-time comparison (CryptographicOperations.FixedTimeEquals) rather than a normal
        // string/array equality check — this avoids a timing side-channel that could otherwise let
        // an attacker guess the secret one byte at a time by measuring response times.
        if (!CryptographicOperations.FixedTimeEquals(
            Convert.FromHexString(authorization.Parameter!),
            Convert.FromHexString(serviceOptions.Value.ApiKey)))
            return Task.FromResult(AuthenticateResult.Fail("Invalid service credential."));

        // The secret is valid, meaning we trust this caller is really our own Web front end — now
        // extract the Windows identity it's vouching for. Exactly one username header is required;
        // the SID header is optional but if present must appear exactly once.
        var nameHeader = Request.Headers[SaveServiceOptions.UserNameHeader];
        var sidHeader = Request.Headers[SaveServiceOptions.UserSidHeader];
        if (nameHeader.Count != 1 || nameHeader[0] is not { Length: > 0 and <= 2048 } encodedName || sidHeader.Count > 1)
            return Task.FromResult(AuthenticateResult.Fail("A Windows identity is required."));

        // The username arrives URL-encoded (GameSaveClient.CreateRequest escapes it, since raw HTTP
        // header values can't safely carry arbitrary characters like spaces). Unicode-normalize it
        // too, so equivalent-but-differently-encoded usernames can't be used to create duplicate
        // save files / ranking rows for what's really the same person.
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
            return Task.FromResult(AuthenticateResult.Fail("Invalid Windows identity."));

        var sid = sidHeader.ToString();
        if (sid.Length > 0 && !ValidSid(sid)) return Task.FromResult(AuthenticateResult.Fail("Invalid Windows SID."));

        // Prefer the SID as the durable storage key when we have one — it's stable even if a
        // Windows account gets renamed, unlike the display name. Fall back to an uppercased name
        // key only for identities that somehow don't carry a SID (defensive; Negotiate normally
        // always provides one). This ownerId is what GameSaveStore/RankingStore actually use to
        // look up a player's file/row.
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

    /// <summary>
    /// Loosely validates that a string looks like a real Windows SID (e.g.
    /// "S-1-5-21-...-...-...-1001") without fully parsing it: must start with "S-", stay under a
    /// sane length, and have at least 3 dash-separated numeric components after the "S". This is
    /// just enough validation to stop obviously-bogus values from being trusted as a storage key —
    /// it's not a full SID format validator.
    /// </summary>
    private static bool ValidSid(string sid)
    {
        if (sid.Length > 184 || !sid.StartsWith("S-", StringComparison.Ordinal)) return false;
        var parts = sid.Split('-');
        return parts.Length >= 4 && parts.Skip(1).All(part => part.Length > 0 && part.All(char.IsAsciiDigit));
    }
}
