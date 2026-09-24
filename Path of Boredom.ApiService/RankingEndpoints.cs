using System.Security.Claims;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.ApiService;

public static class RankingEndpoints
{
    public static void MapRankings(this WebApplication app)
    {
        var group = app.MapGroup("/game/rankings").RequireAuthorization();
        group.MapPost("/profile", async (HttpContext context, RankingStore store) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            await store.RegisterAsync(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!,
                context.User.Identity!.Name!, context.RequestAborted);
            return Results.NoContent();
        });
        group.MapGet("/", async (string difficulty, string mode, string? heroClass, string? patch, HttpContext context, RankingStore store) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            patch ??= RankingRules.CurrentPatch;
            if (!RankingRules.IsDifficulty(difficulty) || !RankingRules.IsMode(mode)
                || !RankingRules.IsPatch(patch) || heroClass is not (null or "all") && !RankingRules.IsClass(heroClass)) return Results.BadRequest();
            return Results.Ok(await store.ReadAsync(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!,
                difficulty, mode, heroClass, patch, context.RequestAborted));
        });
        group.MapPut("/", async (ScoreSubmission submission, HttpContext context, RankingStore store) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            if (!RankingRules.IsValid(submission)) return Results.BadRequest();
            await store.UpdateAsync(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!,
                context.User.Identity!.Name!, submission, context.RequestAborted);
            return Results.NoContent();
        }).WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(16 * 1024));
    }
}
