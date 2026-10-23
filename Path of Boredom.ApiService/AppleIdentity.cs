using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;

namespace Path_of_Boredom.ApiService;

/// <summary>
/// Sign in with Apple. Non-secret identifiers live in appsettings.json; the private key comes only
/// from configuration <c>AppleIdentity:PrivateKey</c> (Secret Manager → <c>AppleIdentity__PrivateKey</c>
/// on Cloud Run, user-secrets locally). Apple sign-in is simply disabled when the key is missing.
/// </summary>
public sealed class AppleIdentityOptions
{
    public string TeamId { get; set; } = "";
    public string KeyId { get; set; } = "";
    /// <summary>Services ID used by the browser flow (Web and Android).</summary>
    public string ServicesId { get; set; } = "";
    /// <summary>App bundle ID; the audience of tokens issued to the native iOS app.</summary>
    public string BundleId { get; set; } = "";
    /// <summary>Apple's form_post target, registered as the Services ID return URL.</summary>
    public string RedirectUri { get; set; } = "";
    /// <summary>Where a finished browser sign-in may hand the game session back to.</summary>
    public string[] AllowedReturnUrls { get; set; } = [];
    public string PrivateKey { get; set; } = "";
}

/// <summary>
/// Verifies Apple identity tokens and issues/validates the game's own session tokens. Apple's ID
/// tokens are short-lived, so after verifying one the API hands out a 30-day session token signed
/// with the Apple key (ES256). Those sessions use the same "sub"/"iat" claims as Google tokens, so
/// saves, rankings and account deletion work identically for both providers.
/// </summary>
public sealed class AppleIdentityService
{
    public const string AppleIssuer = "https://appleid.apple.com";
    public const string SessionIssuer = "pob-api";
    public const string SessionAudience = "pob-game";
    public const string SubjectPrefix = "apple:";
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(30);

    private readonly AppleIdentityOptions options;
    private readonly ECDsaSecurityKey? signingKey;
    private readonly ConfigurationManager<OpenIdConnectConfiguration> appleConfiguration =
        new($"{AppleIssuer}/.well-known/openid-configuration", new OpenIdConnectConfigurationRetriever(), new HttpDocumentRetriever());
    private readonly JsonWebTokenHandler handler = new();

    public AppleIdentityService(IOptions<AppleIdentityOptions> options)
    {
        this.options = options.Value;
        if (string.IsNullOrWhiteSpace(this.options.PrivateKey)) return;
        var ecdsa = ECDsa.Create();
        var key = this.options.PrivateKey.Trim().Replace("\\n", "\n");
        if (key.Contains("BEGIN", StringComparison.Ordinal)) ecdsa.ImportFromPem(key);
        else ecdsa.ImportPkcs8PrivateKey(Convert.FromBase64String(key), out _);
        signingKey = new ECDsaSecurityKey(ecdsa) { KeyId = this.options.KeyId };
    }

    public bool Enabled => signingKey is not null && options.TeamId.Length > 0 && options.ServicesId.Length > 0;
    public AppleIdentityOptions Options => options;

    /// <summary>Validates an Apple ID token for the given audience and returns Apple's stable user id.</summary>
    public async Task<string?> ValidateAppleTokenAsync(string token, string audience, string? expectedNonce, CancellationToken cancellationToken)
    {
        var configuration = await appleConfiguration.GetConfigurationAsync(cancellationToken);
        var result = await handler.ValidateTokenAsync(token, new TokenValidationParameters
        {
            ValidIssuer = AppleIssuer,
            ValidAudience = audience,
            IssuerSigningKeys = configuration.SigningKeys,
            ClockSkew = TimeSpan.FromSeconds(30)
        });
        if (!result.IsValid || result.ClaimsIdentity.FindFirst("sub")?.Value is not { Length: > 0 and <= 200 } subject) return null;
        if (expectedNonce is not null && result.ClaimsIdentity.FindFirst("nonce")?.Value != expectedNonce) return null;
        return subject;
    }

    /// <summary>Issues the game's own session token for a verified Apple user.</summary>
    public (string Token, DateTimeOffset Expires) IssueSession(string appleSubject)
    {
        var now = DateTimeOffset.UtcNow;
        var expires = now + SessionLifetime;
        var token = handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = SessionIssuer,
            Audience = SessionAudience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expires.UtcDateTime,
            Claims = new Dictionary<string, object> { ["sub"] = SubjectPrefix + appleSubject },
            SigningCredentials = new SigningCredentials(signingKey, SecurityAlgorithms.EcdsaSha256)
        });
        return (token, expires);
    }

    /// <summary>Validates a game session token; returns its subject and issued-at time.</summary>
    public async Task<(string Subject, long IssuedAt)?> ValidateSessionAsync(string token)
    {
        if (signingKey is null) return null;
        var result = await handler.ValidateTokenAsync(token, new TokenValidationParameters
        {
            ValidIssuer = SessionIssuer,
            ValidAudience = SessionAudience,
            IssuerSigningKey = signingKey,
            ClockSkew = TimeSpan.FromSeconds(30)
        });
        if (!result.IsValid || result.ClaimsIdentity.FindFirst("sub")?.Value is not { } subject
            || !subject.StartsWith(SubjectPrefix, StringComparison.Ordinal)
            || !long.TryParse(result.ClaimsIdentity.FindFirst("iat")?.Value, out var issuedAt)) return null;
        return (subject, issuedAt);
    }

    /// <summary>Signed, short-lived state for the browser flow, so no server-side storage is needed.</summary>
    public string CreateState(string returnUrl, string nonce) => handler.CreateToken(new SecurityTokenDescriptor
    {
        Issuer = SessionIssuer,
        Audience = "apple-state",
        Expires = DateTime.UtcNow.AddMinutes(10),
        Claims = new Dictionary<string, object> { ["ret"] = returnUrl, ["nonce"] = nonce },
        SigningCredentials = new SigningCredentials(signingKey, SecurityAlgorithms.EcdsaSha256)
    });

    public async Task<(string ReturnUrl, string Nonce)?> ReadStateAsync(string state)
    {
        var result = await handler.ValidateTokenAsync(state, new TokenValidationParameters
        {
            ValidIssuer = SessionIssuer,
            ValidAudience = "apple-state",
            IssuerSigningKey = signingKey,
            ClockSkew = TimeSpan.FromSeconds(30)
        });
        if (!result.IsValid || result.ClaimsIdentity.FindFirst("ret")?.Value is not { } returnUrl
            || result.ClaimsIdentity.FindFirst("nonce")?.Value is not { } nonce || !IsAllowedReturnUrl(returnUrl)) return null;
        return (returnUrl, nonce);
    }

    public bool IsAllowedReturnUrl(string url) => options.AllowedReturnUrls.Contains(url, StringComparer.Ordinal);

    public static bool LooksLikeSession(string token)
    {
        try { return new JsonWebToken(token).Issuer == SessionIssuer; }
        catch (ArgumentException) { return false; }
    }
}

public static class AppleSignInEndpoints
{
    public static void MapAppleSignIn(this WebApplication app)
    {
        // 1. Browser flow start (Web/Android): /signin-apple/start?returnUrl=<allowed url>
        app.MapGet("/signin-apple/start", (string? returnUrl, AppleIdentityService apple) =>
        {
            if (!apple.Enabled) return Results.NotFound();
            if (returnUrl is null || !apple.IsAllowedReturnUrl(returnUrl)) return Results.BadRequest();
            var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
            var query = new Dictionary<string, string?>
            {
                ["client_id"] = apple.Options.ServicesId,
                ["redirect_uri"] = apple.Options.RedirectUri,
                ["response_type"] = "code id_token",
                ["response_mode"] = "form_post",
                ["scope"] = "",
                ["state"] = apple.CreateState(returnUrl, nonce),
                ["nonce"] = nonce
            };
            return Results.Redirect(Microsoft.AspNetCore.WebUtilities.QueryHelpers.AddQueryString(
                "https://appleid.apple.com/auth/authorize", query));
        }).RequireRateLimiting("PlayerRequests");

        // 2. Apple posts the result here (the Services ID return URL).
        app.MapPost("/signin-apple", async (HttpContext context, AppleIdentityService apple) =>
        {
            if (!apple.Enabled) return Results.NotFound();
            var form = await context.Request.ReadFormAsync(context.RequestAborted);
            if (await apple.ReadStateAsync(form["state"].ToString()) is not { } state)
                return Results.BadRequest("Sign-in expired. Close this page and try again.");
            if (form["error"].Count > 0) return HandBack(state.ReturnUrl, null, null);
            var appleSubject = await apple.ValidateAppleTokenAsync(form["id_token"].ToString(),
                apple.Options.ServicesId, state.Nonce, context.RequestAborted);
            if (appleSubject is null) return Results.BadRequest("Apple sign-in could not be verified.");
            var session = apple.IssueSession(appleSubject);
            return HandBack(state.ReturnUrl, session.Token, session.Expires);
        }).DisableAntiforgery().RequireRateLimiting("PlayerRequests");

        // Native iOS: exchange an Apple identity token (audience = bundle ID) for a game session.
        app.MapPost("/game/auth/apple", async (NativeAppleRequest request, HttpContext context, AppleIdentityService apple) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            if (!apple.Enabled) return Results.NotFound();
            if (request.IdentityToken is not { Length: > 0 and < 8192 } token) return Results.BadRequest();
            var nonce = request.Nonce is { Length: > 0 } raw
                ? Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant() : null;
            var subject = await apple.ValidateAppleTokenAsync(token, apple.Options.BundleId, nonce, context.RequestAborted);
            if (subject is null) return Results.Unauthorized();
            var session = apple.IssueSession(subject);
            return Results.Ok(new { token = session.Token, expires = session.Expires });
        }).RequireRateLimiting("PlayerRequests").WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(16 * 1024));
    }

    // Web return URLs (https) receive the session via an auto-submitted POST so it never appears in
    // URLs or logs; app return URLs (custom scheme) receive it in the fragment, which WebAuthenticator reads.
    private static IResult HandBack(string returnUrl, string? token, DateTimeOffset? expires)
    {
        if (!returnUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            var fragment = token is null ? "error=cancelled"
                : $"token={Uri.EscapeDataString(token)}&expires={expires!.Value.ToUnixTimeSeconds()}";
            return Results.Redirect($"{returnUrl}#{fragment}");
        }
        var html = HtmlEncoder.Default;
        var body = $"""
            <!doctype html><html><head><meta charset="utf-8"><title>Path of Boredom</title></head>
            <body onload="document.forms[0].submit()" style="background:#0e1619;color:#f1d49b;font-family:sans-serif">
            <form method="post" action="{html.Encode(returnUrl)}">
            <input type="hidden" name="token" value="{html.Encode(token ?? "")}">
            <input type="hidden" name="expires" value="{expires?.ToUnixTimeSeconds()}">
            <noscript><button type="submit">Continue</button></noscript></form><p>Returning to the game…</p></body></html>
            """;
        return Results.Content(body, "text/html; charset=utf-8");
    }

    public sealed record NativeAppleRequest(string? IdentityToken, string? Nonce);
}
