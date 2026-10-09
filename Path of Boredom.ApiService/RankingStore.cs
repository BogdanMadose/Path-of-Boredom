using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.ApiService;

/// <summary>Durable ranking profiles; concurrent submissions can only increase a board's best.</summary>
public sealed class RankingStore(FirestorePersistence persistence)
{
    public static string DefaultDisplayName(string owner) => $"Ember-{FirestorePersistence.Key(owner)[..6]}";

    public async Task<string> GetDisplayNameAsync(string owner, CancellationToken cancellationToken)
    {
        var profile = FirestorePersistence.Read<RankingProfile>(await persistence.Ranking(owner).GetSnapshotAsync(cancellationToken));
        return profile is { CustomName: true } ? profile.Player : DefaultDisplayName(owner);
    }

    public Task SetDisplayNameAsync(string owner, string name, CancellationToken cancellationToken, long issuedAt) =>
        persistence.Database.RunTransactionAsync(async transaction =>
        {
            await persistence.EnsureActiveAsync(transaction, owner, issuedAt, cancellationToken);
            var reference = persistence.Ranking(owner);
            var profile = FirestorePersistence.Read<RankingProfile>(await transaction.GetSnapshotAsync(reference, cancellationToken))
                ?? new RankingProfile(DefaultDisplayName(owner), new());
            transaction.Set(reference, FirestorePersistence.Write(profile with { Player = name, CustomName = true }));
        }, cancellationToken: cancellationToken);

    public Task RegisterAsync(string owner, string name, CancellationToken cancellationToken, long issuedAt = long.MaxValue) =>
        UpdateAsync(owner, name, null, cancellationToken, issuedAt);

    public Task UpdateAsync(string owner, string name, ScoreSubmission? submission, CancellationToken cancellationToken,
        long issuedAt = long.MaxValue) => persistence.Database.RunTransactionAsync(async transaction =>
    {
        await persistence.EnsureActiveAsync(transaction, owner, issuedAt, cancellationToken);
        var reference = persistence.Ranking(owner);
        var profile = FirestorePersistence.Read<RankingProfile>(await transaction.GetSnapshotAsync(reference, cancellationToken))
            ?? new RankingProfile(name, new());
        MigrateClassBests(profile);
        if (!profile.CustomName) profile = profile with { Player = name };
        if (submission is not null)
        {
            var board = $"{submission.Patch}:{submission.Difficulty}:{submission.Mode}:{submission.HeroClass}";
            if (!profile.Bests.TryGetValue(board, out var best) || submission.Score > best.Score)
                profile.Bests[board] = new(submission.Score, DateTimeOffset.UtcNow, submission.HeroClass, submission.Build);
        }
        transaction.Set(reference, FirestorePersistence.Write(profile));
    }, cancellationToken: cancellationToken);

    public async Task<IReadOnlyList<RankingRow>> ReadAsync(string owner, string difficulty, string mode,
        string? heroClass, string patch, CancellationToken cancellationToken)
    {
        // Small-test deployment: preserve existing all-player boards. Switch to indexed per-board
        // documents/pagination before a public launch; each read currently costs one read per profile.
        var snapshot = await persistence.Database.Collection("rankings").GetSnapshotAsync(cancellationToken);
        var profiles = snapshot.Documents.Select(document => (Key: document.Id,
            Profile: FirestorePersistence.Read<RankingProfile>(document)!)).ToList();
        foreach (var entry in profiles) MigrateClassBests(entry.Profile);
        var current = FirestorePersistence.Key(owner);
        var rows = new List<RankingRow>();
        string[] classes = heroClass is null or "all" ? ["knight", "ranger", "warden"] : [heroClass];
        foreach (var classKey in classes)
        {
            var entries = profiles.Select(entry => (entry.Key, entry.Profile.Player,
                Best: entry.Profile.Bests.GetValueOrDefault($"{patch}:{difficulty}:{mode}:{classKey}")))
                .OrderByDescending(entry => entry.Best?.Score ?? 0)
                .ThenBy(entry => entry.Best?.AchievedAt ?? DateTimeOffset.MaxValue)
                .ThenBy(entry => entry.Key, StringComparer.Ordinal);
            long previous = -1;
            var rank = 0;
            var position = 0;
            foreach (var entry in entries)
            {
                position++;
                var score = entry.Best?.Score ?? 0;
                if (score != previous) rank = position;
                rows.Add(new(rank, entry.Player, score, entry.Best?.AchievedAt, entry.Key == current, classKey, entry.Best?.Build));
                previous = score;
            }
        }
        return rows;
    }

    private static void MigrateClassBests(RankingProfile profile)
    {
        foreach (var (key, best) in profile.Bests.ToArray())
        {
            var parts = key.Split(':');
            if (parts.Length is not (2 or 3) || !RankingRules.IsDifficulty(parts[0]) || !RankingRules.IsMode(parts[1])) continue;
            var heroClass = parts.Length == 3 && RankingRules.IsClass(parts[2]) ? parts[2]
                : RankingRules.IsClass(best.HeroClass) ? best.HeroClass : "knight";
            var classKey = $"pre004:{parts[0]}:{parts[1]}:{heroClass}";
            if (!profile.Bests.TryGetValue(classKey, out var existing) || best.Score > existing.Score)
                profile.Bests[classKey] = best with { HeroClass = heroClass };
            profile.Bests.Remove(key);
        }
    }
}

public sealed record RankingProfile(string Player, Dictionary<string, RankingBest> Bests, bool CustomName = false);
public sealed record RankingBest(long Score, DateTimeOffset AchievedAt, string HeroClass = "knight", RankingBuild? Build = null);