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
            profile = profile with { Player = name };
            if (submission is not null)
            {
                var board = $"{submission.Difficulty}:{submission.Mode}";
                if (!profile.Bests.TryGetValue(board, out var best) || submission.Score > best.Score)
                {
                    profile.Bests[board] = new(submission.Score, DateTimeOffset.UtcNow, submission.HeroClass);
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

    public async Task<IReadOnlyList<RankingRow>> ReadAsync(string owner, string difficulty, string mode, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (!Directory.Exists(directory)) return [];
            var current = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(owner)));
            var entries = new List<(string Key, string Name, RankingBest? Best)>();
            foreach (var path in Directory.EnumerateFiles(directory, "*.json"))
            {
                var profile = JsonSerializer.Deserialize<RankingProfile>(await File.ReadAllTextAsync(path, cancellationToken), JsonOptions)
                    ?? throw new InvalidDataException("Invalid ranking profile.");
                profile.Bests.TryGetValue($"{difficulty}:{mode}", out var best);
                entries.Add((Path.GetFileNameWithoutExtension(path), profile.Player, best));
            }
            var rows = new List<RankingRow>();
            long previous = -1;
            var rank = 0;
            foreach (var entry in entries.OrderByDescending(entry => entry.Best?.Score ?? 0)
                .ThenBy(entry => entry.Best?.AchievedAt ?? DateTimeOffset.MaxValue)
                .ThenBy(entry => entry.Key, StringComparer.Ordinal))
            {
                var score = entry.Best?.Score ?? 0;
                if (score != previous) rank = rows.Count + 1;
                rows.Add(new(rank, entry.Name, score, entry.Best?.AchievedAt, entry.Key == current, entry.Best?.HeroClass));
                previous = score;
            }
            return rows;
        }
        finally { gate.Release(); }
    }
}

public sealed record RankingProfile(string Player, Dictionary<string, RankingBest> Bests);
public sealed record RankingBest(long Score, DateTimeOffset AchievedAt, string HeroClass = "knight");
