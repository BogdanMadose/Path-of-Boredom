using Microsoft.Extensions.Options;
using System.Collections.Concurrent;
using System.Text.Json.Serialization;

namespace Path_of_Boredom.Web;

/// <summary>
/// Web OAuth client used for the desktop/browser sign-in. This is the same Google Web client the
/// API validates ID-token audiences against, so one Google account reaches the same cloud save on
/// mobile and PC. The secret is never in source: use user-secrets locally and an environment
/// variable (<c>Authentication__Google__ClientSecret</c>) when deployed.
/// </summary>
public sealed class GoogleAuthOptions
{
    public const string SectionName = "Authentication:Google";
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
}

/// <summary>
/// Keeps each signed-in player's Google ID/refresh tokens on the server only (never in the browser
/// cookie) and renews the ID token shortly before it expires, since the API accepts only fresh ones.
/// </summary>
public sealed class GoogleTokenStore(IHttpClientFactory httpFactory, IOptions<GoogleAuthOptions> options)
{
    private static readonly TimeSpan RenewBefore = TimeSpan.FromMinutes(2);
    private sealed record Entry(string IdToken, string? RefreshToken, DateTimeOffset Expires);
    private sealed record RefreshResponse(
        [property: JsonPropertyName("id_token")] string? IdToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn);

    private readonly ConcurrentDictionary<string, Entry> entries = new();
    private readonly SemaphoreSlim refreshGate = new(1, 1);

    public bool Has(string subject) => entries.ContainsKey(subject);

    /// <summary>Apple sessions are issued by the API, last 30 days and have no refresh token.</summary>
    public static bool IsApple(string subject) => subject.StartsWith("apple:", StringComparison.Ordinal);

    public void Remove(string subject) => entries.TryRemove(subject, out _);

    public void Save(string subject, string idToken, string? refreshToken, DateTimeOffset expires) =>
        entries[subject] = new(idToken, string.IsNullOrWhiteSpace(refreshToken)
            ? entries.GetValueOrDefault(subject)?.RefreshToken : refreshToken, expires);

    /// <summary>Returns a valid ID token for the player, or null when they must sign in again.</summary>
    public async Task<string?> GetIdTokenAsync(string subject, CancellationToken cancellationToken = default)
    {
        if (!entries.TryGetValue(subject, out var entry)) return null;
        if (entry.Expires - DateTimeOffset.UtcNow > RenewBefore) return entry.IdToken;
        if (entry.RefreshToken is null) return entry.Expires > DateTimeOffset.UtcNow ? entry.IdToken : null;

        await refreshGate.WaitAsync(cancellationToken);
        try
        {
            if (!entries.TryGetValue(subject, out entry)) return null;
            if (entry.Expires - DateTimeOffset.UtcNow > RenewBefore) return entry.IdToken;
            using var response = await httpFactory.CreateClient().PostAsync("https://oauth2.googleapis.com/token",
                new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["client_id"] = options.Value.ClientId,
                    ["client_secret"] = options.Value.ClientSecret,
                    ["refresh_token"] = entry.RefreshToken!,
                    ["grant_type"] = "refresh_token"
                }), cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                // Google revoked or rejected the grant: the player has to sign in again.
                if ((int)response.StatusCode is >= 400 and < 500) entries.TryRemove(subject, out _);
                return null;
            }
            var renewed = await response.Content.ReadFromJsonAsync<RefreshResponse>(cancellationToken);
            if (renewed?.IdToken is not { Length: > 0 } idToken) return null;
            entries[subject] = new(idToken, entry.RefreshToken, DateTimeOffset.UtcNow.AddSeconds(renewed.ExpiresIn));
            return idToken;
        }
        finally { refreshGate.Release(); }
    }
}
