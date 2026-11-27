using Path_of_Boredom.Game;
using Path_of_Boredom.ServiceDefaults;
using System.Text.Json;

namespace Path_of_Boredom.Itch;

/// <summary>Local-only demo: never uploads limited progression to a full-game account.</summary>
public sealed class DemoGameSession(BrowserSaveStore local) : IGameSession
{
    private const string FullGameRequired = "This save requires the full game. The demo includes 10 campaign waves, Ember Knight and Dawn Ranger only. Your save is unchanged.";

    public Task<string> GetPlayerNameAsync() => Task.FromResult("Demo player");
    public Task<bool> RegisterPlayerAsync() => Task.FromResult(false);
    public Task<bool> SubmitScoreAsync(ScoreSubmission submission) => Task.FromResult(false);
    public Task<IReadOnlyList<RankingRow>?> GetRankingsAsync(string difficulty, string mode, string heroClass = "all", string patch = RankingRules.CurrentPatch) =>
        Task.FromResult<IReadOnlyList<RankingRow>?>(null);

    public async Task<IReadOnlyList<GameSaveSlotInfo>> GetSaveSlotsAsync() =>
        (await local.GetSaveSlotsAsync()).Select(slot => slot with { EndlessUnlocked = false }).ToArray();

    public Task<GameSaveResult> SaveAsync(JsonElement snapshot, int slot) => AllowsSave(snapshot)
        ? local.SaveAsync(snapshot, slot)
        : Task.FromResult(new GameSaveResult(false, FullGameRequired));

    public async Task<GameSaveResult> LoadAsync(int slot)
    {
        var result = await local.LoadAsync(slot);
        return result.Success && (result.Save is not { } snapshot || !AllowsSave(snapshot))
            ? new(false, FullGameRequired)
            : result with { EndlessUnlocked = false };
    }

    public static bool AllowsSave(JsonElement snapshot)
    {
        if (snapshot.ValueKind != JsonValueKind.Object || !snapshot.TryGetProperty("state", out var state)
            || state.ValueKind != JsonValueKind.Object) return false;
        return Text(state, "mode") == "campaign" && Text(state, "heroClass") is "knight" or "ranger"
            && Number(state, "wave") is >= 0 and <= 10 && Number(state, "campaignComplete") == 0
            && Text(state, "status") != "won" && !(Number(state, "wave") == 10 && Number(state, "travelPending") == 1);
    }

    private static string? Text(JsonElement state, string key) => state.TryGetProperty(key, out var value)
        && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static int? Number(JsonElement state, string key) => state.TryGetProperty(key, out var value)
        && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) ? number : null;
}
