namespace Path_of_Boredom.ServiceDefaults;

/// <summary>
/// Shared configuration contract for the private "save service" trust relationship between
/// <c>Path of Boredom.Web</c> (the caller) and <c>Path of Boredom.ApiService</c> (the callee).
/// Both projects bind this same options type from configuration and must be given the exact
/// same <see cref="ApiKey"/> value, otherwise every save/load/ranking request will be rejected
/// with 401/403 by <c>SaveServiceAuthenticationHandler</c> on the API side.
/// </summary>
public sealed class SaveServiceOptions
{
    /// <summary>
    /// The configuration section name both projects bind this options type from
    /// (e.g. appsettings.json -> "SaveService": { "ApiKey": "..." }, or injected by AppHost for local dev).
    /// </summary>
    public const string SectionName = "SaveService";

    /// <summary>
    /// The name registered for the custom authentication scheme on the API side. Used when
    /// wiring up <c>AddAuthentication(SaveServiceOptions.AuthenticationScheme)</c> so the scheme
    /// name doesn't get typo'd in two different places.
    /// </summary>
    public const string AuthenticationScheme = "SaveService";

    /// <summary>
    /// HTTP header name Web sends the authenticated Windows username under (domain prefix stripped)
    /// so the API can attribute the save/ranking record without doing its own Negotiate handshake.
    /// </summary>
    public const string UserNameHeader = "X-Windows-User";

    /// <summary>
    /// HTTP header name Web sends the authenticated Windows security identifier (SID) under.
    /// The SID is what actually keys a player's save file / ranking row, since usernames can
    /// theoretically be reused/renamed but SIDs are stable per Windows account.
    /// </summary>
    public const string UserSidHeader = "X-Windows-Sid";

    /// <summary>
    /// The shared secret both Web and ApiService must be configured with identically.
    /// Sent by Web as a Bearer token on every request; validated by the API's authentication
    /// handler. Must be a 64-character hex string (see <see cref="IsValidApiKey"/>).
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Validates that a candidate API key is exactly 64 hex characters (i.e. a 256-bit secret
    /// encoded as hex). Both Web's and ApiService's startup validation call this via
    /// <c>ValidateOnStart()</c> so a misconfigured or missing secret fails fast at boot instead
    /// of surfacing as a confusing runtime 401 during gameplay.
    /// </summary>
    /// <param name="key">The candidate API key to check, or null.</param>
    /// <returns>True if the key is exactly 64 characters and every character is a valid hex digit.</returns>
    public static bool IsValidApiKey(string? key) => key is { Length: 64 } && key.All(char.IsAsciiHexDigit);
}