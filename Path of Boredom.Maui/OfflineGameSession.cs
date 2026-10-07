using System.Text.Json;
using Path_of_Boredom.Game;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.Maui;

/// <summary>
/// Placeholder <see cref="IGameSession"/> for the mobile head until Google/Apple sign-in lands in
/// 005b. Every call fails closed with a message explaining why, so the game is playable offline
/// and the save/rankings UI degrades honestly rather than appearing to work.
/// </summary>
/// <remarks>
/// Deliberately does NOT talk to ApiService. The existing API trusts whatever identity a caller
/// claims as long as the caller knows the shared SaveService secret, so shipping that secret inside
/// an installable app would let anyone read or overwrite any player's save. The mobile head stays
/// offline until it can authenticate as a real user with a provider-issued token the API validates
/// itself.
/// </remarks>
public sealed class OfflineGameSession : IGameSession
{
    private const string SignInRequired = "Sign-in is not available yet in the mobile preview. Your run is local to this device and will not be saved.";

    public Task<string> GetPlayerNameAsync() => Task.FromResult("Mobile preview");

    public Task<bool> RegisterPlayerAsync() => Task.FromResult(false);

    public Task<GameSaveResult> SaveAsync(JsonElement snapshot) => Task.FromResult(new GameSaveResult(false, SignInRequired));

    public Task<GameSaveResult> LoadAsync() => Task.FromResult(new GameSaveResult(false, SignInRequired));

    public Task<bool> SubmitScoreAsync(ScoreSubmission submission) => Task.FromResult(false);

    public Task<IReadOnlyList<RankingRow>?> GetRankingsAsync(string difficulty, string mode, string heroClass = "all", string patch = RankingRules.CurrentPatch) =>
        Task.FromResult<IReadOnlyList<RankingRow>?>(null);
}
