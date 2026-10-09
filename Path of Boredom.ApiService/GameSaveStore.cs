using System.Text.Json;
using System.Text.Json.Serialization;

namespace Path_of_Boredom.ApiService;

/// <summary>Transactional per-player saves, durable across Cloud Run instances and deployments.</summary>
public sealed class GameSaveStore(FirestorePersistence persistence)
{
    public async Task<GameSave?> LoadAsync(string ownerId, CancellationToken cancellationToken) =>
        FirestorePersistence.Read<GameSave>(await persistence.Save(ownerId).GetSnapshotAsync(cancellationToken));

    public Task<GameSave> SaveAsync(string ownerId, string playerName, JsonElement state, int version,
        CancellationToken cancellationToken, long? expectedRevision = null, long issuedAt = long.MaxValue) =>
        persistence.Database.RunTransactionAsync(async transaction =>
        {
            await persistence.EnsureActiveAsync(transaction, ownerId, issuedAt, cancellationToken);
            var reference = persistence.Save(ownerId);
            var previous = FirestorePersistence.Read<GameSave>(await transaction.GetSnapshotAsync(reference, cancellationToken));
            if (expectedRevision is not null && expectedRevision != (previous?.Revision ?? 0))
                throw new SaveConflictException(previous);
            var unlocked = previous?.EndlessUnlocked == true || Completed(previous?.State) || Completed(state);
            var save = new GameSave(version, DateTimeOffset.UtcNow, state.Clone(), unlocked, playerName)
            {
                Revision = checked((previous?.Revision ?? 0) + 1)
            };
            transaction.Set(reference, FirestorePersistence.Write(save));
            return save;
        }, cancellationToken: cancellationToken);

    private static bool Completed(JsonElement? state) => state is { ValueKind: JsonValueKind.Object } value
        && value.TryGetProperty("campaignComplete", out var completed)
        && completed.ValueKind == JsonValueKind.Number && completed.TryGetInt32(out var number) && number == 1;
}

public sealed record GameSave(int Version, DateTimeOffset SavedAt, JsonElement State, bool EndlessUnlocked = false, string? WindowsUser = null)
{
    public long Revision { get; init; }
    [JsonIgnore]
    public bool RecoveredFromCorruptSave { get; init; }
}
