using Microsoft.Extensions.Options;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Path_of_Boredom.ApiService;

/// <summary>Browser (itch.io) hosts allowed to call the API and receive sign-in results.</summary>
public sealed class WebSignInOptions
{
    /// <summary>Exact origins, e.g. https://html-classic.itch.zone.</summary>
    public string[] AllowedOrigins { get; set; } = [];
}

/// <summary>
/// Popup bridge for browser sign-in. Google's implicit flow redirects here with the ID token in the
/// URL fragment; Apple's form_post hand-back (an https return URL) posts the game session here. The
/// page forwards the token to <c>window.opener</c> with <c>postMessage</c>, targeting each allowed
/// origin explicitly so the browser drops the message for any other opener.
/// </summary>
public static class WebSignInEndpoints
{
    public const string CompletePath = "/signin-web/complete";

    public static void MapWebSignIn(this WebApplication app)
    {
        app.MapGet(CompletePath, (IOptions<WebSignInOptions> options) => Page(options.Value, null, null));
        app.MapPost(CompletePath, async (HttpContext context, IOptions<WebSignInOptions> options) =>
        {
            var form = await context.Request.ReadFormAsync(context.RequestAborted);
            var token = form["token"].ToString();
            return Page(options.Value, token.Length is > 0 and < 8192 ? token : null, form["expires"].ToString());
        }).DisableAntiforgery().RequireRateLimiting("PlayerRequests");
    }

    private static IResult Page(WebSignInOptions options, string? appleToken, string? expires)
    {
        var origins = JsonSerializer.Serialize(options.AllowedOrigins);
        var apple = JsonSerializer.Serialize(appleToken);
        var appleExpires = JsonSerializer.Serialize(long.TryParse(expires, out var value) ? value : 0);
        var body = $$"""
            <!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Path of Boredom</title></head>
            <body style="background:#0e1619;color:#f1d49b;font-family:sans-serif;text-align:center;padding-top:20vh">
            <p id="m">Returning to the game…</p>
            <script>
            (function () {
                var origins = {{origins}}, apple = {{apple}}, appleExpires = {{appleExpires}};
                var hash = new URLSearchParams(location.hash.slice(1));
                var message = apple ? { type: "pob-auth", provider: "apple", token: apple, expires: appleExpires }
                    : hash.get("id_token") ? { type: "pob-auth", provider: "google", token: hash.get("id_token"), state: hash.get("state") || "" }
                    : { type: "pob-auth", error: hash.get("error") || "cancelled", state: hash.get("state") || "" };
                history.replaceState(null, "", location.pathname);
                if (window.opener) origins.forEach(function (origin) { try { window.opener.postMessage(message, origin); } catch (e) { } });
                document.getElementById("m").textContent = window.opener ? "Signed in. You can close this window." : "Open the game and sign in from there.";
                setTimeout(function () { window.close(); }, 400);
            })();
            </script></body></html>
            """;
        return Results.Content(body, "text/html; charset=utf-8");
    }
}
