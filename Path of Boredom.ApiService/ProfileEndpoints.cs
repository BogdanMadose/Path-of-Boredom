using System.Security.Claims;
using System.Text.Json;

namespace Path_of_Boredom.ApiService;

/// <summary>
/// Account-wide meta progression (Embers, camp upgrades, class mastery, class unlocks, relic codex).
/// Stored separately from the run save so progress earned on death, or spent at the Ember Camp,
/// reaches the account even when there is no saveable run. Writes that would lose lifetime Embers
/// are rejected with 409 and the stored profile, so a stale device merges instead of overwriting.
/// </summary>
public static class ProfileEndpoints
{
    private const int MaximumBytes = 8 * 1024;

    public static void MapPlayerProfile(this WebApplication app)
    {
        app.MapGet("/game/profile", async (HttpContext context, FirestorePersistence persistence) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var ownerId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var snapshot = await persistence.Profile(ownerId).GetSnapshotAsync(context.RequestAborted);
            return snapshot.Exists ? Results.Text(snapshot.GetValue<string>("json"), "application/json") : Results.NotFound();
        }).RequireAuthorization().RequireRateLimiting("PlayerRequests");

        app.MapPut("/game/profile", async (HttpContext context, FirestorePersistence persistence) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var ownerId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
            if (!context.Request.HasJsonContentType()) return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);
            var buffer = new byte[MaximumBytes + 1];
            var length = 0;
            while (length < buffer.Length)
            {
                var read = await context.Request.Body.ReadAsync(buffer.AsMemory(length), context.RequestAborted);
                if (read == 0) break;
                length += read;
            }
            if (length > MaximumBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            JsonDocument document;
            try { document = JsonDocument.Parse(buffer.AsMemory(0, length), new JsonDocumentOptions { MaxDepth = 6 }); }
            catch (JsonException) { return Results.BadRequest(new { code = "InvalidProfile" }); }
            using (document)
            {
                var root = document.RootElement;
                if (!IsValid(root)) return Results.BadRequest(new { code = "InvalidProfile" });
                var incoming = Lifetime(root);
                var json = root.GetRawText();
                try
                {
                    var stored = await persistence.Database.RunTransactionAsync(async transaction =>
                    {
                        await persistence.EnsureActiveAsync(transaction, ownerId, GoogleTokenAuthenticationHandler.IssuedAt(context.User), context.RequestAborted);
                        var reference = persistence.Profile(ownerId);
                        var current = await transaction.GetSnapshotAsync(reference, context.RequestAborted);
                        if (current.Exists)
                        {
                            var existing = current.GetValue<string>("json");
                            using var previous = JsonDocument.Parse(existing);
                            if (Lifetime(previous.RootElement) > incoming) return existing;
                        }
                        transaction.Set(reference, new Dictionary<string, object> { ["json"] = json });
                        return null;
                    }, cancellationToken: context.RequestAborted);
                    return stored is null ? Results.NoContent() : Results.Text(stored, "application/json", statusCode: StatusCodes.Status409Conflict);
                }
                catch (AccountDeletedException) { return Results.Unauthorized(); }
            }
        }).RequireAuthorization().RequireRateLimiting("PlayerRequests");
    }

    private static long Lifetime(JsonElement profile) =>
        profile.TryGetProperty("lifetimeEmbers", out var value) && value.TryGetInt64(out var number) ? number : 0;

    // Shape check only: the client sanitizes every field on load, so the server just bounds it.
    private static bool IsValid(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) return false;
        foreach (var name in new[] { "embers", "lifetimeEmbers" })
            if (!root.TryGetProperty(name, out var value) || !value.TryGetInt64(out var number) || number < 0 || number > 1_000_000_000) return false;
        foreach (var name in new[] { "camp", "mastery", "unlocked", "victories", "trim" })
            if (!root.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Object) return false;
        return Lifetime(root) >= root.GetProperty("embers").GetInt64();
    }
}
