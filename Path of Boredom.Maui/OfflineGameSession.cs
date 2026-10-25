using Path_of_Boredom.Game;
using Path_of_Boredom.ServiceDefaults;
using System.Globalization;
using System.Text;
using System.Text.Json;

namespace Path_of_Boredom.Maui;

/// <summary>Stores up to five independent offline runs in the app's private data directory.</summary>
/// <remarks>
/// Deliberately does NOT talk to ApiService. The mobile head stays offline until it can
/// authenticate as a real user with a provider-issued token the API validates itself.
/// </remarks>
public sealed class OfflineGameSession : IGameSession
{
    private const int CurrentSaveVersion = 20;
    private const int MaximumSaveBytes = 128 * 1024;
    private const int SlotCount = 5;
    private readonly SemaphoreSlim saveLock = new(1, 1);
    private readonly string directory = FileSystem.AppDataDirectory;
    private string LegacyPath => Path.Combine(directory, "offline-run.json");
    private string SlotPath(int slot) => Path.Combine(directory, $"offline-run-slot-{slot}.json");

    public Task<string> GetPlayerNameAsync() => Task.FromResult("Offline player");
    public Task<bool> RegisterPlayerAsync() => Task.FromResult(false);

    public async Task<IReadOnlyList<GameSaveSlotInfo>> GetSaveSlotsAsync()
    {
        await saveLock.WaitAsync();
        try
        {
            var slots = new List<GameSaveSlotInfo>(SlotCount);
            var unlocked = await IsEndlessUnlockedAnywhereAsync();
            for (var slot = 1; slot <= SlotCount; slot++)
            {
                var path = ExistingPath(slot);
                if (path is null) { slots.Add(new(slot, false, EndlessUnlocked: unlocked)); continue; }
                try
                {
                    using var document = await ReadDocumentAsync(path);
                    var snapshot = document.RootElement;
                    if (!IsSnapshot(snapshot)) { slots.Add(new(slot, false, EndlessUnlocked: unlocked)); continue; }
                    slots.Add(Summarize(slot, snapshot, path, unlocked));
                }
                catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
                { slots.Add(new(slot, false, EndlessUnlocked: unlocked)); }
            }
            return slots;
        }
        finally { saveLock.Release(); }
    }

    public async Task<GameSaveResult> SaveAsync(JsonElement snapshot, int slot)
    {
        if (!ValidSlot(slot) || !IsSnapshot(snapshot) || Encoding.UTF8.GetByteCount(snapshot.GetRawText()) > MaximumSaveBytes)
            return new(false, "The save is invalid. Your previous local save is unchanged.");

        await saveLock.WaitAsync();
        try
        {
            var savePath = SlotPath(slot);
            var unlocked = IsEndlessUnlocked(snapshot) || await IsEndlessUnlockedAnywhereAsync();
            var recovered = false;
            var previousPath = ExistingPath(slot);
            if (previousPath is not null)
            {
                try
                {
                    using var previous = await ReadDocumentAsync(previousPath);
                    if (!IsSnapshot(previous.RootElement)) throw new JsonException();
                    unlocked |= IsEndlessUnlocked(previous.RootElement);
                }
                catch (JsonException)
                {
                    File.Copy(previousPath, previousPath + ".corrupt-" + Guid.NewGuid().ToString("N") + ".json");
                    recovered = true;
                }
            }
            var envelope = new
            {
                version = snapshot.GetProperty("version").GetInt32(),
                state = snapshot.GetProperty("state"),
                endlessUnlocked = unlocked,
                savedAt = DateTimeOffset.UtcNow
            };
            Directory.CreateDirectory(directory);
            var temporary = savePath + ".tmp";
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(envelope));
            File.Move(temporary, savePath, overwrite: true);
            return new(true, recovered ? $"Saved to Slot {slot}. The previous damaged save was preserved as a backup."
                : $"Saved to Slot {slot} on this device. Cloud sync is not enabled.", EndlessUnlocked: unlocked);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        { return new(false, "Could not write the local save. Your previous save is unchanged."); }
        finally { saveLock.Release(); }
    }

    public async Task<GameSaveResult> LoadAsync(int slot)
    {
        if (!ValidSlot(slot)) return new(false, "Choose a valid save slot.");
        await saveLock.WaitAsync();
        try
        {
            var path = ExistingPath(slot);
            if (path is null) return new(false, $"Slot {slot} is empty.");
            using var document = await ReadDocumentAsync(path);
            var snapshot = document.RootElement;
            if (!IsSnapshot(snapshot)) return new(false, "The local save is damaged or unsupported. Your current run is unchanged.");
            return new(true, $"Loaded Slot {slot} from this device.", snapshot.Clone(), IsEndlessUnlocked(snapshot));
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        { return new(false, "Could not read the local save. Your current run is unchanged."); }
        finally { saveLock.Release(); }
    }

    private string? ExistingPath(int slot) => File.Exists(SlotPath(slot)) ? SlotPath(slot)
        : slot == 1 && File.Exists(LegacyPath) ? LegacyPath : null;

    private async Task<JsonDocument> ReadDocumentAsync(string path)
    {
        if (new FileInfo(path).Length > MaximumSaveBytes) throw new JsonException();
        return JsonDocument.Parse(await File.ReadAllTextAsync(path));
    }

    private async Task<bool> IsEndlessUnlockedAnywhereAsync()
    {
        for (var slot = 1; slot <= SlotCount; slot++)
        {
            var path = ExistingPath(slot);
            if (path is null) continue;
            try
            {
                using var document = await ReadDocumentAsync(path);
                if (IsEndlessUnlocked(document.RootElement)) return true;
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException) { }
        }
        return false;
    }

    private static GameSaveSlotInfo Summarize(int slot, JsonElement snapshot, string path, bool unlocked)
    {
        var state = snapshot.GetProperty("state");
        var player = state.TryGetProperty("player", out var value) ? value : default;
        var savedAt = snapshot.TryGetProperty("savedAt", out var date) && date.ValueKind == JsonValueKind.String
            && DateTimeOffset.TryParse(date.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed)
            ? parsed : new DateTimeOffset(File.GetLastWriteTimeUtc(path), TimeSpan.Zero);
        return new(slot, true, savedAt, Text(state, "heroClass"), Text(state, "difficulty"), Text(state, "mode"),
            Number(state, "wave"), Number(player, "level"), Decimal(state, "time"), unlocked);
    }

    private static string? Text(JsonElement source, string name) => source.ValueKind == JsonValueKind.Object
        && source.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static int? Number(JsonElement source, string name) => source.ValueKind == JsonValueKind.Object
        && source.TryGetProperty(name, out var value) && value.TryGetInt32(out var number) ? number : null;
    private static double? Decimal(JsonElement source, string name) => source.ValueKind == JsonValueKind.Object
        && source.TryGetProperty(name, out var value) && value.TryGetDouble(out var number) ? number : null;
    private static bool ValidSlot(int slot) => slot is >= 1 and <= SlotCount;

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
            Directory.CreateDirectory(directory);
            foreach (var path in Enumerable.Range(1, SlotCount).Select(ExistingPath).Where(path => path is not null).Cast<string>().Distinct())
                File.Copy(path, path + ".before-cloud.json", overwrite: true);
        }
        finally { saveLock.Release(); }
    }

    public async Task ClearAsync()
    {
        await saveLock.WaitAsync();
        try
        {
            foreach (var path in new[] { LegacyPath, LegacyPath + ".tmp", LegacyPath + ".before-cloud.json" }.Concat(Enumerable.Range(1, SlotCount).SelectMany(slot =>
                new[] { SlotPath(slot), SlotPath(slot) + ".tmp", SlotPath(slot) + ".before-cloud.json" })))
                if (File.Exists(path)) File.Delete(path);
            if (Directory.Exists(directory))
            {
                foreach (var path in Directory.EnumerateFiles(directory, "offline-run.json.corrupt-*.json")) File.Delete(path);
                foreach (var path in Directory.EnumerateFiles(directory, "offline-run-slot-*.json.corrupt-*.json")) File.Delete(path);
            }
        }
        finally { saveLock.Release(); }
    }

    public Task<IReadOnlyList<RankingRow>?> GetRankingsAsync(string difficulty, string mode, string heroClass = "all", string patch = RankingRules.CurrentPatch) =>
        Task.FromResult<IReadOnlyList<RankingRow>?>(null);
}
