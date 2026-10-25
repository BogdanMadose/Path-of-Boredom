using System.Text.Json;
using System.Text.Json.Serialization;

namespace Path_of_Boredom.ApiService;

/// <summary>Transactional per-player saves, durable across Cloud Run instances and deployments.</summary>
public sealed class GameSaveStore(FirestorePersistence persistence)
{
    public const int SlotCount = 5;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<GameSave?> LoadAsync(string ownerId, int slot, CancellationToken cancellationToken)
    {
        var collection = ReadCollection(await persistence.Save(ownerId).GetSnapshotAsync(cancellationToken));
        var save = collection?.Slots.FirstOrDefault(entry => entry.Slot == slot)?.Save;
        return save is null || collection is null ? null : save with
        {
            Revision = collection.Revision,
            EndlessUnlocked = collection.EndlessUnlocked
        };
    }

    public async Task<IReadOnlyList<Path_of_Boredom.ServiceDefaults.GameSaveSlotInfo>> ListAsync(string ownerId, CancellationToken cancellationToken)
    {
        var collection = ReadCollection(await persistence.Save(ownerId).GetSnapshotAsync(cancellationToken));
        return Enumerable.Range(1, SlotCount).Select(slot =>
        {
            var entry = collection?.Slots.FirstOrDefault(item => item.Slot == slot);
            return entry is null
                ? new Path_of_Boredom.ServiceDefaults.GameSaveSlotInfo(slot, false,
                    EndlessUnlocked: collection?.EndlessUnlocked == true, Revision: collection?.Revision ?? 0)
                : Summarize(slot, entry.Save with
                {
                    Revision = collection!.Revision,
                    EndlessUnlocked = collection.EndlessUnlocked
                });
        }).ToArray();
    }

    public Task<GameSave> SaveAsync(string ownerId, string playerName, JsonElement state, int version, int slot,
        CancellationToken cancellationToken, long? expectedRevision = null, long issuedAt = long.MaxValue) =>
        persistence.Database.RunTransactionAsync(async transaction =>
        {
            await persistence.EnsureActiveAsync(transaction, ownerId, issuedAt, cancellationToken);
            var reference = persistence.Save(ownerId);
            var previous = ReadCollection(await transaction.GetSnapshotAsync(reference, cancellationToken));
            var revision = previous?.Revision ?? 0;
            if (expectedRevision is not null && expectedRevision != revision)
                throw new SaveConflictException(previous?.Slots.FirstOrDefault(entry => entry.Slot == slot)?.Save, revision);
            var existing = previous?.Slots.FirstOrDefault(entry => entry.Slot == slot);
            if (existing is null && (previous?.Slots.Count ?? 0) >= SlotCount)
                throw new SaveSlotsFullException();
            var unlocked = previous?.EndlessUnlocked == true
                || previous?.Slots.Any(entry => entry.Save.EndlessUnlocked || Completed(entry.Save.State)) == true
                || Completed(state);
            var nextRevision = checked(revision + 1);
            var save = new GameSave(version, DateTimeOffset.UtcNow, state.Clone(), unlocked, playerName)
            {
                Revision = nextRevision
            };
            var slots = previous?.Slots.Where(entry => entry.Slot != slot).ToList() ?? [];
            slots.Add(new(slot, save));
            var updated = new StoredGameSaves(nextRevision, unlocked, slots.OrderBy(entry => entry.Slot).ToList());
            transaction.Set(reference, FirestorePersistence.Write(updated));
            return save;
        }, cancellationToken: cancellationToken);

    private static StoredGameSaves? ReadCollection(Google.Cloud.Firestore.DocumentSnapshot snapshot)
    {
        if (!snapshot.Exists) return null;
        var json = snapshot.GetValue<string>("json");
        using var document = JsonDocument.Parse(json);
        if (document.RootElement.TryGetProperty("slots", out _))
            return JsonSerializer.Deserialize<StoredGameSaves>(json, JsonOptions) ?? throw new JsonException();

        // Existing players have a single GameSave document. It becomes Slot 1 on first read,
        // and the next save transparently writes it in the new collection shape.
        var legacy = JsonSerializer.Deserialize<GameSave>(json, JsonOptions);
        return legacy is null ? null : new StoredGameSaves(legacy.Revision, legacy.EndlessUnlocked, [new(1, legacy)]);
    }

    private static Path_of_Boredom.ServiceDefaults.GameSaveSlotInfo Summarize(int slot, GameSave save)
    {
        var state = save.State;
        var player = state.ValueKind == JsonValueKind.Object && state.TryGetProperty("player", out var playerData)
            ? playerData : default;
        return new(slot, true, save.SavedAt,
            Text(state, "heroClass"), Text(state, "difficulty"), Text(state, "mode"),
            Number(state, "wave"), Number(player, "level"), Decimal(state, "time"), save.EndlessUnlocked, save.Revision);
    }

    private static string? Text(JsonElement source, string property) =>
        source.ValueKind == JsonValueKind.Object && source.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() : null;

    private static int? Number(JsonElement source, string property) =>
        source.ValueKind == JsonValueKind.Object && source.TryGetProperty(property, out var value) && value.TryGetInt32(out var number)
            ? number : null;

    private static double? Decimal(JsonElement source, string property) =>
        source.ValueKind == JsonValueKind.Object && source.TryGetProperty(property, out var value) && value.TryGetDouble(out var number)
            ? number : null;

    private static bool Completed(JsonElement? state) => state is { ValueKind: JsonValueKind.Object } value
        && value.TryGetProperty("campaignComplete", out var completed)
        && completed.ValueKind == JsonValueKind.Number && completed.TryGetInt32(out var number) && number == 1;
}

public sealed record StoredSaveSlot(int Slot, GameSave Save);
public sealed record StoredGameSaves(long Revision, bool EndlessUnlocked, List<StoredSaveSlot> Slots);

public sealed record GameSave(int Version, DateTimeOffset SavedAt, JsonElement State, bool EndlessUnlocked = false, string? WindowsUser = null)
{
    public long Revision { get; init; }
    [JsonIgnore]
    public bool RecoveredFromCorruptSave { get; init; }
}

public sealed class SaveSlotsFullException : Exception { }
