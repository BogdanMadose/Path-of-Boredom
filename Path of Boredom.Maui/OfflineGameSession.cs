using System.Text;
using System.Text.Json;
using Path_of_Boredom.Game;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.Maui;

/// <summary>
/// Stores one offline run in the app's private data directory, including the offline fallback
/// used by the cloud session. Local files never serve as backend persistence.
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
    private const int CurrentSaveVersion = 16;
    private const int MaximumSaveBytes = 128 * 1024;
    private readonly SemaphoreSlim saveLock = new(1, 1);
    private readonly string savePath = Path.Combine(FileSystem.AppDataDirectory, "offline-run.json");

    public Task<string> GetPlayerNameAsync() => Task.FromResult("Offline player");

    public Task<bool> RegisterPlayerAsync() => Task.FromResult(false);

    public async Task<GameSaveResult> SaveAsync(JsonElement snapshot)
    {
        if (!IsSnapshot(snapshot) || Encoding.UTF8.GetByteCount(snapshot.GetRawText()) > MaximumSaveBytes)
            return new(false, "The save is invalid. Your previous local save is unchanged.");

        await saveLock.WaitAsync();
        try
        {
            var unlocked = IsEndlessUnlocked(snapshot);
            var recovered = false;
            if (File.Exists(savePath))
            {
                try
                {
                    if (new FileInfo(savePath).Length > MaximumSaveBytes) throw new JsonException();
                    using var previous = JsonDocument.Parse(await File.ReadAllTextAsync(savePath));
                    if (!IsSnapshot(previous.RootElement)) throw new JsonException();
                    unlocked |= IsEndlessUnlocked(previous.RootElement);
                }
                catch (JsonException)
                {
                    File.Copy(savePath, savePath + ".corrupt-" + Guid.NewGuid().ToString("N") + ".json");
                    recovered = true;
                }
            }
            var envelope = new
            {
                version = snapshot.GetProperty("version").GetInt32(),
                state = snapshot.GetProperty("state"),
                endlessUnlocked = unlocked
            };
            Directory.CreateDirectory(Path.GetDirectoryName(savePath)!);
            var temporary = savePath + ".tmp";
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(envelope));
            File.Move(temporary, savePath, overwrite: true);
            return new(true, recovered ? "Saved on this device. The previous damaged save was preserved as a backup."
                : "Saved on this device. Cloud sync is not enabled.", EndlessUnlocked: unlocked);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return new(false, "Could not write the local save. Your previous save is unchanged.");
        }
        finally { saveLock.Release(); }
    }

    public async Task<GameSaveResult> LoadAsync()
    {
        await saveLock.WaitAsync();
        try
        {
            if (!File.Exists(savePath)) return new(false, "No local save yet. Start a campaign and save from the pause menu.");
            if (new FileInfo(savePath).Length > MaximumSaveBytes) return new(false, "The local save is invalid. Your current run is unchanged.");
            using var document = JsonDocument.Parse(await File.ReadAllTextAsync(savePath));
            var snapshot = document.RootElement;
            if (!IsSnapshot(snapshot)) return new(false, "The local save is damaged or unsupported. Your current run is unchanged.");
            return new(true, "Loaded the save from this device.", snapshot.Clone(), IsEndlessUnlocked(snapshot));
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return new(false, "Could not read the local save. Your current run is unchanged.");
        }
        finally { saveLock.Release(); }
    }

    private static bool IsSnapshot(JsonElement snapshot) =>
        snapshot.ValueKind == JsonValueKind.Object
        && snapshot.TryGetProperty("version", out var version)
        && version.ValueKind == JsonValueKind.Number && version.TryGetInt32(out var number) && number is >= 1 and <= CurrentSaveVersion
        && snapshot.TryGetProperty("state", out var state) && state.ValueKind == JsonValueKind.Object;

    private static bool IsEndlessUnlocked(JsonElement snapshot) =>
        snapshot.ValueKind == JsonValueKind.Object
        && ((snapshot.TryGetProperty("endlessUnlocked", out var unlocked) && unlocked.ValueKind == JsonValueKind.True)
            || (snapshot.TryGetProperty("state", out var state) && state.ValueKind == JsonValueKind.Object
                && state.TryGetProperty("campaignComplete", out var completed) && completed.ValueKind == JsonValueKind.Number
                && completed.TryGetInt32(out var number) && number == 1));

    public Task<bool> SubmitScoreAsync(ScoreSubmission submission) => Task.FromResult(false);

    public async Task BackupAsync()
    {
        await saveLock.WaitAsync();
        try
        {
            if (File.Exists(savePath)) File.Copy(savePath, savePath + ".before-cloud.json", overwrite: true);
        }
        finally { saveLock.Release(); }
    }

    public async Task ClearAsync()
    {
        await saveLock.WaitAsync();
        try
        {
            foreach (var path in new[] { savePath, savePath + ".tmp", savePath + ".before-cloud.json" })
                if (File.Exists(path)) File.Delete(path);
            var directory = Path.GetDirectoryName(savePath)!;
            if (Directory.Exists(directory))
                foreach (var path in Directory.EnumerateFiles(directory, "offline-run.json.corrupt-*.json")) File.Delete(path);
        }
        finally { saveLock.Release(); }
    }

    public Task<IReadOnlyList<RankingRow>?> GetRankingsAsync(string difficulty, string mode, string heroClass = "all", string patch = RankingRules.CurrentPatch) =>
        Task.FromResult<IReadOnlyList<RankingRow>?>(null);
}
