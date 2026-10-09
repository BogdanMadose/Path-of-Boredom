namespace Path_of_Boredom.Maui;

/// <summary>Public Android OAuth registration details; sign-in is not enabled by this configuration alone.</summary>
public static class GoogleSignInConfiguration
{
    // Public deployment identifiers only. Supply the actual Cloud Run HTTPS URL and Web OAuth
    // client ID before release. Never use the Android client ID as the backend audience.
    public const string ApiBaseUrl = "https://pob-api-438780560503.europe-west1.run.app";
    public const string WebClientId = "438780560503-uup7hl29a2ldf9p7p3q9ps1gebcdvtuu.apps.googleusercontent.com";
    public static bool IsConfigured => Uri.TryCreate(ApiBaseUrl, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps && string.IsNullOrEmpty(uri.UserInfo)
        && WebClientId.EndsWith(".apps.googleusercontent.com", StringComparison.Ordinal);

    public const string AndroidClientId = "438780560503-fbflm3m2m0j59117194k1q0plb16t7hi.apps.googleusercontent.com";
    public const string ProjectNumber = "438780560503";
    public const string AndroidPackageName = "com.madbone.pathofboredom";
    public const string SigningCertificateSha1 = "60:D4:BF:BA:A5:0C:43:90:43:36:DE:A1:78:86:C5:E1:CD:44:EC:98";
    public const string SigningCertificateSha256 = "EE:9A:5B:51:C1:94:50:37:53:68:C2:63:57:BF:88:3B:A0:0C:2C:C5:16:DA:E3:98:23:05:21:5A:2A:25:36:F6";
}
