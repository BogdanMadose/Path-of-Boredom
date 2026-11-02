namespace Path_of_Boredom.Itch;

/// <summary>Public deployment identifiers shared with the mobile head; nothing here is secret.</summary>
public static class ItchCloudConfiguration
{
    public const string ApiBaseUrl = "https://pob-api-438780560503.europe-west1.run.app";
    public const string WebClientId = "438780560503-uup7hl29a2ldf9p7p3q9ps1gebcdvtuu.apps.googleusercontent.com";
    /// <summary>Must be listed in the API's AppleIdentity:AllowedReturnUrls.</summary>
    public const string AppleReturnUrl = ApiBaseUrl + "/signin-web/complete";

    public static bool IsConfigured => Uri.TryCreate(ApiBaseUrl, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps
        && WebClientId.EndsWith(".apps.googleusercontent.com", StringComparison.Ordinal);
}
