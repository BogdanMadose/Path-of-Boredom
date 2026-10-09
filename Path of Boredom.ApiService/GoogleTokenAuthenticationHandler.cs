using System.Security.Claims;
using System.Text.Encodings.Web;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Path_of_Boredom.ApiService;

public sealed class GoogleIdentityOptions
{
    public string Audience { get; set; } = "";
}

public interface IGoogleTokenValidator
{
    Task<GoogleJsonWebSignature.Payload> ValidateAsync(string token);
}

public sealed class GoogleTokenValidator(IOptions<GoogleIdentityOptions> options) : IGoogleTokenValidator
{
    // Google's library retrieves/rotates Google's public keys and checks signature, issuer,
    // audience and expiration. Never merely decode a JWT and treat its claims as verified.
    public Task<GoogleJsonWebSignature.Payload> ValidateAsync(string token) =>
        GoogleJsonWebSignature.ValidateAsync(token, new GoogleJsonWebSignature.ValidationSettings
        {
            Audience = [options.Value.Audience],
            ExpirationTimeClockTolerance = TimeSpan.Zero,
            IssuedAtClockTolerance = TimeSpan.FromSeconds(30)
        });
}

public sealed class GoogleTokenAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger,
    UrlEncoder encoder, IGoogleTokenValidator validator)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "GoogleIdToken";
    public const string MobilePolicy = "MobilePlayer";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var headers = Request.Headers.Authorization;
        if (headers.Count == 0) return AuthenticateResult.NoResult();
        if (headers.Count != 1 || headers[0] is not { } header
            || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            || header.Length is <= 7 or > 8192)
            return AuthenticateResult.Fail("A Google ID token is required.");
        try
        {
            var payload = await validator.ValidateAsync(header[7..]);
            if (string.IsNullOrWhiteSpace(payload.Subject) || payload.Subject.Length > 255
                || payload.IssuedAtTimeSeconds is not { } issuedAt
                || payload.ExpirationTimeSeconds is not { } expires
                || expires <= DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                || payload.Issuer is not ("accounts.google.com" or "https://accounts.google.com"))
                return AuthenticateResult.Fail("Invalid Google identity.");
            // Public profiles use a neutral alias, never the Google account's personal name.
            var name = RankingStore.DefaultDisplayName(payload.Subject);
            var claims = new[]
            {
                new Claim("sub", payload.Subject),
                new Claim(ClaimTypes.NameIdentifier, payload.Subject),
                new Claim(ClaimTypes.Name, name),
                new Claim("iat", issuedAt.ToString(System.Globalization.CultureInfo.InvariantCulture))
            };
            return AuthenticateResult.Success(new AuthenticationTicket(
                new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName)), SchemeName));
        }
        catch (InvalidJwtException) { return AuthenticateResult.Fail("Invalid or expired Google ID token."); }
        catch (HttpRequestException)
        {
            // Fail closed when Google's signing keys cannot be retrieved; never log bearer tokens.
            return AuthenticateResult.Fail("Identity verification unavailable.");
        }
    }

    public static long IssuedAt(ClaimsPrincipal principal) =>
        long.TryParse(principal.FindFirstValue("iat"), out var value) ? value : long.MaxValue;
}
