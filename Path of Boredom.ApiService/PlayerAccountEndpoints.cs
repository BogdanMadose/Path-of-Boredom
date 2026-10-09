using System.Security.Claims;

namespace Path_of_Boredom.ApiService;

public static class PlayerAccountEndpoints
{
    public static void MapPlayerAccount(this WebApplication app)
    {
        var account = app.MapGroup("/game/account")
            .RequireAuthorization(GoogleTokenAuthenticationHandler.MobilePolicy)
            .RequireRateLimiting("PlayerRequests");
        account.MapGet("/", async (HttpContext context, RankingStore store) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var subject = context.User.FindFirstValue("sub")!;
            return Results.Ok(new { subject, name = await store.GetDisplayNameAsync(subject, context.RequestAborted) });
        });
        account.MapPut("/display-name", async (DisplayNameRequest request, HttpContext context, RankingStore store) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            if (!Path_of_Boredom.ServiceDefaults.PlayerDisplayNameRules.TryNormalize(request.Name, out var name))
                return Results.BadRequest(new { message = Path_of_Boredom.ServiceDefaults.PlayerDisplayNameRules.Guidance });
            if (!await store.SetDisplayNameAsync(context.User.FindFirstValue("sub")!, name, context.RequestAborted,
                GoogleTokenAuthenticationHandler.IssuedAt(context.User)))
                return Results.Conflict(new { message = "That player name is already taken. Choose another nickname." });
            return Results.Ok(new { name });
        }).WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(1024));
        account.MapDelete("/", async (HttpContext context, FirestorePersistence persistence) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            try
            {
                await persistence.DeleteAsync(context.User.FindFirstValue("sub")!,
                    GoogleTokenAuthenticationHandler.IssuedAt(context.User), context.RequestAborted);
                return Results.NoContent();
            }
            catch (AccountDeletedException) { return Results.Unauthorized(); }
        });
    }

    public sealed record DisplayNameRequest(string? Name);
}
