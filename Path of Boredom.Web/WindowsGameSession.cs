using System.Text.Json;
using Microsoft.AspNetCore.Components.Authorization;
using Path_of_Boredom.Game;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.Web;

/// <summary>
/// The Blazor Server implementation of <see cref="IGameSession"/>, preserving the original
/// behavior exactly: every call re-reads the current <c>ClaimsPrincipal</c> from the circuit's
/// authentication state rather than caching it, so a stale or expired Windows identity can never
/// be reused for a later request.
/// </summary>
public sealed class WindowsGameSession(GameSaveClient saves, AuthenticationStateProvider authenticationState) : IGameSession
{
    private async Task<System.Security.Claims.ClaimsPrincipal> GetUserAsync() =>
        (await authenticationState.GetAuthenticationStateAsync()).User;

    public async Task<string> GetPlayerNameAsync() =>
        (await GetUserAsync()).Identity?.Name?.Split('\\').Last() ?? string.Empty;

    public async Task<bool> RegisterPlayerAsync() => await saves.RegisterPlayerAsync(await GetUserAsync());

    public async Task<GameSaveResult> SaveAsync(JsonElement snapshot) => await saves.SaveAsync(await GetUserAsync(), snapshot);

    public async Task<GameSaveResult> LoadAsync() => await saves.LoadAsync(await GetUserAsync());

    public async Task<bool> SubmitScoreAsync(ScoreSubmission submission) => await saves.SubmitScoreAsync(await GetUserAsync(), submission);

    public async Task<IReadOnlyList<RankingRow>?> GetRankingsAsync(string difficulty, string mode, string heroClass = "all", string patch = RankingRules.CurrentPatch) =>
        await saves.GetRankingsAsync(await GetUserAsync(), difficulty, mode, heroClass, patch);
}
