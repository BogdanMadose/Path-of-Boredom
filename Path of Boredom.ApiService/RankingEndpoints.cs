using System.Security.Claims;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.ApiService;

/// <summary>
/// Maps the /game/rankings/... endpoint group. All three endpoints require authorization (the
/// same SaveService scheme as the save endpoints) and all rely on RankingRules for validation
/// rather than duplicating rules here — this file is mostly HTTP plumbing around RankingStore.
/// </summary>
public static class RankingEndpoints
{
    public static void MapRankings(this WebApplication app)
    {
        var group = app.MapGroup("/game/rankings").RequireAuthorization();

        // POST /game/rankings/profile — "touch" the caller's ranking profile so it exists even
        // before they've submitted a score. Called once per page load (Home.razor's OnInitializedAsync).
        group.MapPost("/profile", async (HttpContext context, RankingStore store) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            await store.RegisterAsync(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!,
                context.User.Identity!.Name!, context.RequestAborted);
            return Results.NoContent();
        });

        // GET /game/rankings/?difficulty=...&mode=...&heroClass=...&patch=... — fetch a leaderboard
        // slice. Query parameters are validated against RankingRules before ever touching the store,
        // since these come from a URL and can't be trusted just because the caller is authenticated.
        group.MapGet("/", async (string difficulty, string mode, string? heroClass, string? patch, HttpContext context, RankingStore store) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            patch ??= RankingRules.CurrentPatch;
            if (!RankingRules.IsDifficulty(difficulty) || !RankingRules.IsMode(mode)
                || !RankingRules.IsPatch(patch) || heroClass is not (null or "all") && !RankingRules.IsClass(heroClass)) return Results.BadRequest();
            return Results.Ok(await store.ReadAsync(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!,
                difficulty, mode, heroClass, patch, context.RequestAborted));
        });

        // PUT /game/rankings/ — submit a score/build for the leaderboard. This is the real gate for
        // ranking data (the client-side check in GameSaveClient.SubmitScoreAsync is just an
        // optimization to avoid an obviously-doomed round trip); RequestSizeLimitAttribute caps the
        // body well above what a legitimate build snapshot needs, purely to stop an absurdly bloated request.
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