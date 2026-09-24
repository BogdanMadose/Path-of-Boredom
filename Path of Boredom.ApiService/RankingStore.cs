using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.ApiService;

public sealed class RankingStore(IWebHostEnvironment environment, IConfiguration configuration)
{
    private readonly string directory = Path.Combine(Path.GetFullPath(configuration["Saves:Directory"]
        ?? Path.Combine(environment.ContentRootPath, "App_Data", "saves")), "rankings");
    private readonly SemaphoreSlim gate = new(1, 1);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task RegisterAsync(string owner, string name, CancellationToken cancellationToken) =>
        await UpdateAsync(owner, name, null, cancellationToken);

    public async Task UpdateAsync(string owner, string name, ScoreSubmission? submission, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        string? temporary = null;
        try
        {
            Directory.CreateDirectory(directory);
            var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(owner)));
            var path = Path.Combine(directory, $"{key}.json");
            var profile = File.Exists(path)
                ? JsonSerializer.Deserialize<RankingProfile>(await File.ReadAllTextAsync(path, cancellationToken), JsonOptions)
                    ?? throw new InvalidDataException("Invalid ranking profile.")
                : new RankingProfile(name, new());
            var changed = !File.Exists(path) || profile.Player != name;
            changed |= MigrateClassBests(profile);
            profile = profile with { Player = name };
            if (submission is not null)
            {
                var board = $"{submission.Difficulty}:{submission.Mode}:{submission.HeroClass}";
                if (!profile.Bests.TryGetValue(board, out var best) || submission.Score > best.Score)
                {
                    profile.Bests[board] = new(submission.Score, DateTimeOffset.UtcNow, submission.HeroClass, submission.Build);
                    changed = true;
                }
            }
            if (!changed) return;
            temporary = Path.Combine(directory, $"{Guid.NewGuid():N}.tmp");
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(profile, JsonOptions), cancellationToken);
            File.Move(temporary, path, overwrite: true);
        }
        finally
        {
            if (temporary is not null && File.Exists(temporary)) File.Delete(temporary);
            gate.Release();
        }
    }

    public async Task<IReadOnlyList<RankingRow>> ReadAsync(string owner, string difficulty, string mode, string? heroClass, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (!Directory.Exists(directory)) return [];
            var current = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(owner)));
            var profiles = new List<(string Key, RankingProfile Profile)>();
            foreach (var path in Directory.EnumerateFiles(directory, "*.json"))
            {
                var profile = JsonSerializer.Deserialize<RankingProfile>(await File.ReadAllTextAsync(path, cancellationToken), JsonOptions)
                    ?? throw new InvalidDataException("Invalid ranking profile.");
                MigrateClassBests(profile);
                profiles.Add((Path.GetFileNameWithoutExtension(path), profile));
            }
            var rows = new List<RankingRow>();
            string[] classes = heroClass is null or "all" ? ["knight", "ranger", "warden"] : [heroClass];
            foreach (var classKey in classes)
            {
                var entries = profiles.Select(entry => (entry.Key, entry.Profile.Player,
                    Best: entry.Profile.Bests.GetValueOrDefault($"{difficulty}:{mode}:{classKey}")))
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
        finally { gate.Release(); }
    }

    private static bool MigrateClassBests(RankingProfile profile)
    {
        var changed = false;
        foreach (var (key, best) in profile.Bests.ToArray())
        {
            var parts = key.Split(':');
            if (parts.Length != 2 || !RankingRules.IsDifficulty(parts[0]) || !RankingRules.IsMode(parts[1])) continue;
            var heroClass = RankingRules.IsClass(best.HeroClass) ? best.HeroClass : "knight";
            var classKey = $"{key}:{heroClass}";
            if (!profile.Bests.TryGetValue(classKey, out var existing) || best.Score > existing.Score)
                profile.Bests[classKey] = best with { HeroClass = heroClass };
            profile.Bests.Remove(key);
            changed = true;
        }
        return changed;
    }
}

public sealed record RankingProfile(string Player, Dictionary<string, RankingBest> Bests);
public sealed record RankingBest(long Score, DateTimeOffset AchievedAt, string HeroClass = "knight", RankingBuild? Build = null);
