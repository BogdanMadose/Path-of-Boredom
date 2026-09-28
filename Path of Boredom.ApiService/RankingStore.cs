using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Path_of_Boredom.ServiceDefaults;

namespace Path_of_Boredom.ApiService;

/// <summary>
/// Persistence and query logic for the leaderboard system. Like <see cref="GameSaveStore"/>, this
/// is a plain JSON-file-per-player store (one file per player under App_Data/saves/rankings/) with
/// no database — this class does its own locking, migration, and ranking computation by hand.
/// </summary>
public sealed class RankingStore(IWebHostEnvironment environment, IConfiguration configuration)
{
    /// <summary>Rankings live in a "rankings" subfolder alongside the save files, under the same configurable Saves:Directory root.</summary>
    private readonly string directory = Path.Combine(Path.GetFullPath(configuration["Saves:Directory"]
        ?? Path.Combine(environment.ContentRootPath, "App_Data", "saves")), "rankings");

    /// <summary>
    /// A single process-wide lock, same rationale as GameSaveStore's gate: simplicity over
    /// per-player granularity, since ranking reads/writes are infrequent relative to gameplay.
    /// </summary>
    private readonly SemaphoreSlim gate = new(1, 1);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>Ensures a player has a ranking profile file on disk, without submitting any score. Called once per page load from Home.razor.</summary>
    public async Task RegisterAsync(string owner, string name, CancellationToken cancellationToken) =>
        await UpdateAsync(owner, name, null, cancellationToken);

    /// <summary>
    /// Creates or updates a player's ranking profile. If <paramref name="submission"/> is non-null,
    /// checks whether it beats the player's existing best score for that exact
    /// patch/difficulty/mode/class combination and updates it if so — scores can only ever go up
    /// per board, never down or get overwritten by a worse run.
    /// </summary>
    public async Task UpdateAsync(string owner, string name, ScoreSubmission? submission, CancellationToken cancellationToken)
    {
        await gate.WaitAsync(cancellationToken);
        string? temporary = null;
        try
        {
            Directory.CreateDirectory(directory);
            // Same hash-the-owner-id-for-a-filename approach as GameSaveStore, for the same reasons
            // (safe file names, doesn't visibly expose SIDs/usernames in the rankings folder).
            var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(owner)));
            var path = Path.Combine(directory, $"{key}.json");
            var profile = File.Exists(path)
                ? JsonSerializer.Deserialize<RankingProfile>(await File.ReadAllTextAsync(path, cancellationToken), JsonOptions)
                    ?? throw new InvalidDataException("Invalid ranking profile.")
                : new RankingProfile(name, new());
            // Track whether anything actually needs writing, so a plain "register" call that finds
            // nothing new to persist doesn't cause a needless disk write every single page load.
            var changed = !File.Exists(path) || profile.Player != name;
            // Old profiles may have "board" keys from before per-patch/per-class boards existed —
            // migrate them forward every time a profile is touched (cheap, and keeps the format
            // consistent without needing a one-off migration script).
            changed |= MigrateClassBests(profile);
            profile = profile with { Player = name };
            if (submission is not null)
            {
                var board = $"{submission.Patch}:{submission.Difficulty}:{submission.Mode}:{submission.HeroClass}";
                if (!profile.Bests.TryGetValue(board, out var best) || submission.Score > best.Score)
                {
                    profile.Bests[board] = new(submission.Score, DateTimeOffset.UtcNow, submission.HeroClass, submission.Build);
                    changed = true;
                }
            }
            if (!changed) return;
            // Same write-to-temp-then-rename pattern as GameSaveStore, for the same crash-safety reasons.
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

    /// <summary>
    /// Builds a ranked leaderboard for a given difficulty/mode/patch, either for one specific class
    /// or (when <paramref name="heroClass"/> is "all"/null) as three separate class-specific boards
    /// concatenated together. Every profile file on disk is read and re-migrated on every call —
    /// there's no in-memory cache, which is a deliberate simplicity tradeoff acceptable for a
    /// small player base; it would need revisiting if the player count grew significantly.
    /// </summary>
    public async Task<IReadOnlyList<RankingRow>> ReadAsync(string owner, string difficulty, string mode, string? heroClass, string patch, CancellationToken cancellationToken)
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
            // "all" produces three separate ranked lists (one per class) rather than one combined
            // list — this matches how the rankings page actually presents them (separate tables per class).
            string[] classes = heroClass is null or "all" ? ["knight", "ranger", "warden"] : [heroClass];
            foreach (var classKey in classes)
            {
                // A player with no recorded best for this exact board is still included, ranked at
                // score 0 — this is what makes every registered player show up on every board even
                // before they've ever played that particular combination.
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
                    // Standard "competition ranking" (1224 style): ties share the same rank number,
                    // and the position after a tie skips ahead by however many entries tied, rather
                    // than every row getting a strictly sequential rank.
                    if (score != previous) rank = position;
                    rows.Add(new(rank, entry.Player, score, entry.Best?.AchievedAt, entry.Key == current, classKey, entry.Best?.Build));
                    previous = score;
                }
            }
            return rows;
        }
        finally { gate.Release(); }
    }

    /// <summary>
    /// Rewrites any old-style ranking board keys (from before per-patch/per-class boards existed) into
    /// the current "{patch}:{difficulty}:{mode}:{class}" key shape, tagging migrated entries as
    /// belonging to "pre004" so they land on the separate legacy leaderboard rather than being
    /// silently merged into current-patch rankings. Returns true if anything was actually migrated,
    /// so callers know whether the profile needs to be re-saved.
    /// </summary>
    private static bool MigrateClassBests(RankingProfile profile)
    {
        var changed = false;
        foreach (var (key, best) in profile.Bests.ToArray())
        {
            var parts = key.Split(':');
            // Only touch keys that look like the old 2-or-3-part shape (difficulty:mode or
            // difficulty:mode:class) — anything already in the current 4-part shape is left alone.
            if (parts.Length is not (2 or 3) || !RankingRules.IsDifficulty(parts[0]) || !RankingRules.IsMode(parts[1])) continue;
            var heroClass = parts.Length == 3 && RankingRules.IsClass(parts[2]) ? parts[2]
                : RankingRules.IsClass(best.HeroClass) ? best.HeroClass : "knight";
            var classKey = $"pre004:{parts[0]}:{parts[1]}:{heroClass}";
            if (!profile.Bests.TryGetValue(classKey, out var existing) || best.Score > existing.Score)
                profile.Bests[classKey] = best with { HeroClass = heroClass };
            profile.Bests.Remove(key);
            changed = true;
        }
        return changed;
    }
}

/// <summary>The on-disk shape of one player's ranking profile: their display name plus a dictionary of best scores keyed by board ("{patch}:{difficulty}:{mode}:{class}").</summary>
public sealed record RankingProfile(string Player, Dictionary<string, RankingBest> Bests);

/// <summary>One player's best recorded score for a single leaderboard board, including when it was achieved and (optionally) the build snapshot that earned it.</summary>
public sealed record RankingBest(long Score, DateTimeOffset AchievedAt, string HeroClass = "knight", RankingBuild? Build = null);