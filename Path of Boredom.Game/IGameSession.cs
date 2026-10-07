using System.Text.Json;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.Game;

/// <summary>
/// Everything the shared game components need from their host, expressed without reference to
/// <i>how</i> the host authenticates or reaches the API. This exists because the components used to
/// call <c>GameSaveClient</c> and <c>AuthenticationStateProvider</c> directly — neither of which
/// exists in the MAUI Blazor Hybrid head, where there is no Negotiate handshake and no server-side
/// shared secret to hold. Web implements this over the existing Windows-auth + shared-secret path;
/// MAUI will implement it over Google/Apple tokens in 005b.
/// </summary>
public interface IGameSession
{
    /// <summary>
    /// Display name for the signed-in player, shown in the game header. Returns an empty string
    /// when there is no identity yet (MAUI before sign-in).
    /// </summary>
    Task<string> GetPlayerNameAsync();

    /// <summary>Ensures the player has a rankings profile row. Non-fatal if it fails.</summary>
    Task<bool> RegisterPlayerAsync();

    /// <summary>Persists a run snapshot as captured by <c>arpg-save.js</c>.</summary>
    Task<GameSaveResult> SaveAsync(JsonElement snapshot);

    /// <summary>Fetches the player's stored run, if any.</summary>
    Task<GameSaveResult> LoadAsync();

    /// <summary>Submits a score/build for the leaderboard.</summary>
    Task<bool> SubmitScoreAsync(ScoreSubmission submission);

    /// <summary>Fetches a leaderboard slice, or null when unavailable.</summary>
    Task<IReadOnlyList<RankingRow>?> GetRankingsAsync(string difficulty, string mode, string heroClass = "all", string patch = RankingRules.CurrentPatch);
}
