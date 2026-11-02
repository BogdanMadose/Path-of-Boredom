using Path_of_Boredom.ServiceDefaults;
using Microsoft.JSInterop;
using System.Globalization;
using System.Text;
using System.Text.Json;

namespace Path_of_Boredom.Itch;

/// <summary>Five save slots in the browser's localStorage, with the same envelope as the device saves.</summary>
public sealed class BrowserSaveStore(IJSRuntime js)
{
    private const string SavePrefix = "pob.itch.save.";
    private const string BackupSuffix = ".before-cloud";
    private const int CurrentSaveVersion = 20;
    private const int MaximumSaveBytes = 128 * 1024;
    private const int SlotCount = 5;

    private ValueTask<string?> Get(string key) => js.InvokeAsync<string?>("localStorage.getItem", key);
    private ValueTask Set(string key, string value) => js.InvokeVoidAsync("localStorage.setItem", key, value);
    private ValueTask Remove(string key) => js.InvokeVoidAsync("localStorage.removeItem", key);

    public async Task<IReadOnlyList<GameSaveSlotInfo>> GetSaveSlotsAsync()
    {
        var documents = new JsonDocument?[SlotCount];
        try
        {
            for (var slot = 1; slot <= SlotCount; slot++) documents[slot - 1] = await ReadAsync(slot);
            var unlocked = documents.Any(document => document is not null && IsEndlessUnlocked(document.RootElement));
            return documents.Select((document, index) => document is null
                ? new GameSaveSlotInfo(index + 1, false, EndlessUnlocked: unlocked)
                : Summarize(index + 1, document.RootElement, unlocked)).ToArray();
        }
        finally { foreach (var document in documents) document?.Dispose(); }
    }

    public async Task<GameSaveResult> SaveAsync(JsonElement snapshot, int slot)
    {
        if (!ValidSlot(slot) || !IsSnapshot(snapshot) || Encoding.UTF8.GetByteCount(snapshot.GetRawText()) > MaximumSaveBytes)
            return new(false, "The save is invalid. Your previous browser save is unchanged.");
        try
        {
            var unlocked = IsEndlessUnlocked(snapshot);
            for (var other = 1; other <= SlotCount && !unlocked; other++)
            {
                using var document = await ReadAsync(other);
                unlocked = document is not null && IsEndlessUnlocked(document.RootElement);
            }
            var envelope = new
            {
                version = snapshot.GetProperty("version").GetInt32(),
                state = snapshot.GetProperty("state"),
                endlessUnlocked = unlocked,
                savedAt = DateTimeOffset.UtcNow
            };
            await Set(SavePrefix + slot, JsonSerializer.Serialize(envelope));
            return new(true, $"Saved to Slot {slot} in this browser.", EndlessUnlocked: unlocked);
        }
        catch (JSException)
        { return new(false, "This browser blocked the save (storage full or disabled). Your previous save is unchanged."); }
    }

    public async Task<GameSaveResult> LoadAsync(int slot)
    {
        if (!ValidSlot(slot)) return new(false, "Choose a valid save slot.");
        try
        {
            using var document = await ReadAsync(slot);
            if (document is null) return new(false, $"Slot {slot} is empty.");
            return new(true, $"Loaded Slot {slot} from this browser.", document.RootElement.Clone(), IsEndlessUnlocked(document.RootElement));
        }
        catch (JSException) { return new(false, "Could not read browser storage. Your current run is unchanged."); }
    }

    public async Task BackupAsync()
    {
        for (var slot = 1; slot <= SlotCount; slot++)
            if (await Get(SavePrefix + slot) is { Length: > 0 } json) await Set(SavePrefix + slot + BackupSuffix, json);
    }

    public async Task ClearAsync()
    {
        for (var slot = 1; slot <= SlotCount; slot++)
        {
            await Remove(SavePrefix + slot);
            await Remove(SavePrefix + slot + BackupSuffix);
        }
    }

    private async Task<JsonDocument?> ReadAsync(int slot)
    {
        var json = await Get(SavePrefix + slot);
        if (string.IsNullOrWhiteSpace(json) || Encoding.UTF8.GetByteCount(json) > MaximumSaveBytes) return null;
        try
        {
            var document = JsonDocument.Parse(json);
            if (IsSnapshot(document.RootElement)) return document;
            document.Dispose();
        }
        catch (JsonException) { }
        return null;
    }

    private static GameSaveSlotInfo Summarize(int slot, JsonElement snapshot, bool unlocked)
    {
        var state = snapshot.GetProperty("state");
        var player = state.TryGetProperty("player", out var value) ? value : default;
        DateTimeOffset? savedAt = snapshot.TryGetProperty("savedAt", out var date) && date.ValueKind == JsonValueKind.String
            && DateTimeOffset.TryParse(date.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed) ? parsed : null;
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
                && completed.TryGetInt32(out var value) && value == 1));
}
