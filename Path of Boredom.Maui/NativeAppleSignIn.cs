namespace Path_of_Boredom.Maui;

/// <summary>
/// Sign in with Apple. iOS uses the native Apple sheet and exchanges the identity token at
/// <c>/game/auth/apple</c>; Android uses Apple's web flow via the API's <c>/signin-apple/start</c>,
/// which returns to <c>pathofboredom://apple-signin#token=…</c>. Returns a game session token or null.
/// </summary>
public static class NativeAppleSignIn
{
    public const string CallbackScheme = "pathofboredom";
    public const string CallbackUrl = CallbackScheme + "://apple-signin";

    public static async Task<string?> SignInAsync(string apiBaseUrl, HttpClient http)
    {
        var api = apiBaseUrl.TrimEnd('/');
        try
        {
#if IOS || MACCATALYST
            var result = await AppleSignInAuthenticator.AuthenticateAsync(new AppleSignInAuthenticator.Options
            {
                IncludeEmailScope = false,
                IncludeFullNameScope = false
            });
            if (result?.IdToken is not { Length: > 0 } identityToken) return null;
            using var response = await http.PostAsJsonAsync($"{api}/game/auth/apple", new { identityToken });
            if (!response.IsSuccessStatusCode) return null;
            var session = await response.Content.ReadFromJsonAsync<SessionResponse>();
            return session?.Token;
#else
            _ = http;
            var start = new Uri($"{api}/signin-apple/start?returnUrl={Uri.EscapeDataString(CallbackUrl)}");
            var result = await WebAuthenticator.Default.AuthenticateAsync(new WebAuthenticatorOptions
            {
                Url = start,
                CallbackUrl = new Uri(CallbackUrl)
            });
            return result.Properties.TryGetValue("token", out var token) && token.Length > 0 ? token : null;
#endif
        }
        catch (TaskCanceledException) { return null; }
        catch (OperationCanceledException) { return null; }
    }

    private sealed record SessionResponse(string Token, DateTimeOffset Expires);
}
