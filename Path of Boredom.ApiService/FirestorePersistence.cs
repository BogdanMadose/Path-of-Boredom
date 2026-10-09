using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Google.Cloud.Firestore;

namespace Path_of_Boredom.ApiService;

/// <summary>Server-only Firestore access using Application Default Credentials (Cloud Run identity).</summary>
public sealed class FirestorePersistence(FirestoreDb database)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    public FirestoreDb Database => database;
    public static string Key(string subject) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(subject)));
    public DocumentReference Save(string subject) => database.Collection("saves").Document(Key(subject));
    public DocumentReference Ranking(string subject) => database.Collection("rankings").Document(Key(subject));
    public DocumentReference Account(string subject) => database.Collection("accounts").Document(Key(subject));
    public DocumentReference DisplayName(string name) => database.Collection("displayNames").Document(Key(name.ToUpperInvariant()));
    // Store the bounded game envelope as JSON, avoiding Firestore's map/number conversions.
    public static Dictionary<string, object> Write<T>(T value) => new() { ["json"] = JsonSerializer.Serialize(value, JsonOptions) };
    public static T? Read<T>(DocumentSnapshot snapshot) => snapshot.Exists
        ? JsonSerializer.Deserialize<T>(snapshot.GetValue<string>("json"), JsonOptions) : default;

    public async Task EnsureActiveAsync(Transaction transaction, string subject, long issuedAt, CancellationToken cancellationToken)
    {
        var account = await transaction.GetSnapshotAsync(Account(subject), cancellationToken);
        if (account.Exists && account.TryGetValue<long>("deletedAt", out var deletedAt) && issuedAt <= deletedAt)
            throw new AccountDeletedException();
    }

    public Task DeleteAsync(string subject, long issuedAt, CancellationToken cancellationToken) =>
        database.RunTransactionAsync(async transaction =>
        {
            await EnsureActiveAsync(transaction, subject, issuedAt, cancellationToken);
            var profile = Read<RankingProfile>(await transaction.GetSnapshotAsync(Ranking(subject), cancellationToken));
            var reservation = profile is { CustomName: true } ? DisplayName(profile.Player) : null;
            var claim = reservation is not null ? await transaction.GetSnapshotAsync(reservation, cancellationToken) : null;
            // Reading the account document in every mutation serializes saves/submissions against
            // deletion. A tombstone prevents an old token from recreating deleted data afterwards.
            if (claim is { Exists: true } && claim.GetValue<string>("owner") == Key(subject))
                transaction.Delete(reservation!);
            transaction.Delete(Save(subject));
            transaction.Delete(Ranking(subject));
            transaction.Set(Account(subject), new Dictionary<string, object>
            {
                ["deletedAt"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
            });
        }, cancellationToken: cancellationToken);
}

public sealed class AccountDeletedException : Exception;
public sealed class SaveConflictException(GameSave? current) : Exception
{
    public GameSave? Current { get; } = current;
}
