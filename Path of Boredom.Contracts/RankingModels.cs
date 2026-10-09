namespace Path_of_Boredom.ServiceDefaults;

/// <summary>
/// The payload the client (JS via <c>Home.razor</c>'s <c>SubmitScore</c> bridge) sends to the
/// API whenever a run ends or hits a scoring milestone, to be considered for the leaderboard.
/// This is validated end-to-end by <see cref="RankingRules.IsValid"/> before it's ever persisted.
/// </summary>
/// <param name="Difficulty">One of "hard" / "nightmare" / "inferno". See <see cref="RankingRules.IsDifficulty"/>.</param>
/// <param name="Mode">One of "campaign" / "endless" / "ascended". See <see cref="RankingRules.IsMode"/>.</param>
/// <param name="Score">The run's final score (enemies slain / kill score). Capped at <c>Number.MAX_SAFE_INTEGER</c> so it round-trips safely through JS's JSON number type.</param>
/// <param name="HeroClass">One of "knight" / "ranger" / "warden". Defaults to "knight" for older clients that predate class selection.</param>
/// <param name="Build">Optional snapshot of the build (tree/forge/card/mastery upgrades and skill loadout) used for this run, shown alongside the rank on the leaderboard.</param>
/// <param name="Patch">Which patch produced this run — "004" for current, "pre004" for runs from before class-specific trees existed. Lets the rankings page separate boards so old and new runs aren't compared unfairly.</param>
public sealed record ScoreSubmission(string Difficulty, string Mode, long Score, string HeroClass = "knight", RankingBuild? Build = null, string Patch = "pre004");

/// <summary>
/// A single row as rendered on the rankings leaderboard table.
/// </summary>
/// <param name="Rank">1-based position on the leaderboard.</param>
/// <param name="Player">Display name of the player (Windows username, domain stripped).</param>
/// <param name="Score">The score that earned this rank.</param>
/// <param name="AchievedAt">When the score was recorded, if known.</param>
/// <param name="IsCurrentUser">True if this row belongs to the viewer, so the UI can highlight it.</param>
/// <param name="HeroClass">Which class the run used, for display.</param>
/// <param name="Build">The build snapshot for this run, if one was submitted alongside the score.</param>
public sealed record RankingRow(int Rank, string Player, long Score, DateTimeOffset? AchievedAt, bool IsCurrentUser, string? HeroClass = null, RankingBuild? Build = null);

/// <summary>
/// A snapshot of "what the character was built like" at the time a score was submitted —
/// shown next to a leaderboard entry so other players can see how a top run was put together.
/// </summary>
/// <param name="Level">Character level at submission time.</param>
/// <param name="Upgrades">Every upgrade the character has taken, across all categories (tree/forge/card/mastery).</param>
/// <param name="ManualSkill">The skill currently bound to the manual-cast slot (Q).</param>
/// <param name="AutoSkills">The (up to 2) skills bound to auto-cast slots.</param>
/// <param name="Equipment">Gear and trade-offs at submission time; absent on older records.</param>
public sealed record RankingBuild(long Level, IReadOnlyList<RankingUpgrade> Upgrades, string ManualSkill, IReadOnlyList<string> AutoSkills, RankingEquipment? Equipment = null);

/// <summary>Equipped gear ratings and styles, separate from forge ranks.</summary>
public sealed record RankingEquipment(string Weapon, long WeaponRating, string WeaponStyle, string Armor, int ArmorRating, string ArmorStyle);

/// <summary>
/// A single upgrade entry within a <see cref="RankingBuild"/> — one row of "this skill tree node
/// / forge upgrade / level-up card / mastery training is at rank N".
/// </summary>
/// <param name="Category">One of "tree" / "forge" / "card" / "mastery". See <see cref="RankingRules.UpgradeCategory"/> for display names.</param>
/// <param name="Name">The upgrade's identifying name/key (e.g. a skill tree node id or forge upgrade name).</param>
/// <param name="Rank">How many times this upgrade has been taken/leveled.</param>
public sealed record RankingUpgrade(string Category, string Name, long Rank);

/// <summary>
/// Central validation and display-name rules for the ranking system. This is the server-side
/// (and effectively client-side, since <c>arpg-ranking.js</c> mirrors the same shape) gatekeeper
/// that decides whether a submitted score/build is even worth writing to storage — it exists so
/// a malformed or malicious client can't corrupt the leaderboard with garbage data, absurd ranks,
/// or oversized payloads.
/// </summary>
public static class RankingRules
{
    /// <summary>The patch identifier used by the desktop game.</summary>
    public const string CurrentPatch = "004";

    /// <summary>The initial mobile ranking board, separate from development patch scores.</summary>
    public const string MobileRelease = "release";

    /// <summary>True if <paramref name="value"/> is a recognized release or historical patch tag.</summary>
    public static bool IsPatch(string? value) => value is MobileRelease or "005" or "004" or "pre004";

    /// <summary>Human-readable label for a patch tag, used as a section heading on the rankings page.</summary>
    public static string PatchName(string value) => value == MobileRelease ? "Initial release" : value == CurrentPatch ? "Patch 004 — fresh runs" : value == "005" ? "Development archive" : "Pre-004 / inherited runs";

    /// <summary>True if <paramref name="value"/> is one of the three supported difficulties.</summary>
    public static bool IsDifficulty(string? value) => value is "hard" or "nightmare" or "inferno";

    /// <summary>True if <paramref name="value"/> is one of the three supported game modes.</summary>
    public static bool IsMode(string? value) => value is "campaign" or "endless" or "ascended";

    /// <summary>True if <paramref name="value"/> is one of the three playable classes.</summary>
    public static bool IsClass(string? value) => value is "knight" or "ranger" or "warden";

    /// <summary>Maps a class key to its display name shown on the rankings page and setup dialog.</summary>
    public static string ClassName(string? value) => value switch
    {
        "knight" => "Ember Knight",
        "ranger" => "Dawn Ranger",
        "warden" => "Iron Warden",
        _ => "—"
    };

    /// <summary>
    /// The single entry point for "is this score submission acceptable to persist". Checks the
    /// patch/difficulty/mode/class tags are recognized, the score is within a safe numeric range
    /// for JS interop, and — if a build snapshot was included — delegates to <see cref="IsValidBuild"/>
    /// for the more involved checks on upgrade counts and ranks.
    /// </summary>
    public static bool IsValid(ScoreSubmission value) => IsPatch(value.Patch) && IsDifficulty(value.Difficulty)
        && IsMode(value.Mode) && IsClass(value.HeroClass) && value.Score is >= 0 and <= 9_007_199_254_740_991L
        && (value.Build is null || IsValidBuild(value.Build));

    /// <summary>Human-readable label for a difficulty key, including the short blurb shown in the setup dialog.</summary>
    public static string DifficultyName(string value) => value switch
    {
        "hard" => "Hard — easiest / recommended start",
        "nightmare" => "Nightmare — tougher enemies, less healing",
        "inferno" => "Inferno — hardest / least forgiving",
        _ => value
    };

    public static string WeaponStyleName(string value) => value switch
    {
        "balanced" => "Balanced — normal damage and recovery",
        "heavy" => "Heavy edge — +20% damage; -15% cooldown recovery",
        "swift" => "Quick edge — -15% damage; +20% cooldown recovery",
        _ => "Unknown style"
    };

    public static string ArmorStyleName(string value) => value switch
    {
        "balanced" => "Balanced — normal armor and movement",
        "plated" => "Heavy plates — +8 armor; -12% movement speed",
        "light" => "Light weave — -8 armor; +12% movement speed",
        _ => "Unknown style"
    };

    /// <summary>Human-readable label for an upgrade category key, used as a grouping heading in the build display.</summary>
    public static string UpgradeCategory(string value) => value switch
    {
        "tree" => "Skill trees",
        "forge" => "Forge upgrades",
        "card" => "Level-up cards",
        "mastery" => "Post-forge training",
        _ => value
    };

    /// <summary>
    /// Deep-validates a <see cref="RankingBuild"/> snapshot. This exists to stop a tampered client
    /// from submitting an impossible build (e.g. 500 skill tree points on a level 2 character) that
    /// would otherwise sit on the leaderboard looking legitimate. The caps here (max upgrade counts,
    /// max ranks per category, tree points bounded by character level) are meant to loosely mirror
    /// what's actually achievable in <c>arpg-skills.js</c> / <c>arpg-cards.js</c> — if those game
    /// rules change (e.g. more skill points become obtainable), these caps need to be revisited too,
    /// otherwise legitimate high-level builds will start getting rejected.
    /// </summary>
    private static bool IsValidBuild(RankingBuild build)
    {
        // Basic shape checks: sane level, not too many entries, manual/auto skill names look like
        // real labels, and the manual skill isn't also duplicated into an auto slot.
        if (build.Level is < 1 or > 9_007_199_254_740_991L
            || build.Upgrades is null || build.Upgrades.Count > 91
            || !ValidLabel(build.ManualSkill) || build.AutoSkills is null || build.AutoSkills.Count > 4
            || build.AutoSkills.Any(skill => !ValidLabel(skill))
            || build.AutoSkills.Distinct(StringComparer.Ordinal).Count() != build.AutoSkills.Count
            || build.AutoSkills.Contains(build.ManualSkill)
            || build.Equipment is { } equipment && (!ValidLabel(equipment.Weapon) || !ValidLabel(equipment.Armor)
                || equipment.WeaponRating is < 0 or > 9_007_199_254_740_991L || equipment.ArmorRating is < 0 or > 40
                || equipment.WeaponStyle is not ("balanced" or "heavy" or "swift")
                || equipment.ArmorStyle is not ("balanced" or "plated" or "light"))) return false;

        // Walk every upgrade entry once, rejecting duplicates and out-of-range ranks per category,
        // while accumulating totals (tree points / cards / training) to sanity-check against level below.
        var names = new HashSet<(string Category, string Name)>();
        long treePoints = 0;
        long cards = 0;
        long training = 0;
        foreach (var upgrade in build.Upgrades)
        {
            if (upgrade is null || !ValidLabel(upgrade.Name)
                || upgrade.Category is not ("tree" or "forge" or "card" or "mastery")
                || upgrade.Rank is < 1 or > 9_007_199_254_740_991L
                || !names.Add((upgrade.Category, upgrade.Name))) return false;
            // Skill tree nodes cap at rank 3 (matches TREE_NODES in arpg-skills.js).
            if (upgrade.Category == "tree")
            {
                if (upgrade.Rank > 3) return false;
                treePoints += upgrade.Rank;
            }
            // Forge upgrades cap at rank 50 — an arbitrarily high but still bounded ceiling.
            if (upgrade.Category == "forge" && upgrade.Rank > 50) return false;
            if (upgrade.Category == "card") cards += upgrade.Rank;
            if (upgrade.Category == "mastery") training += upgrade.Rank;
        }
        // Final aggregate sanity checks: total tree points can't exceed what the level could have
        // earned (one point per 2 levels, capped at 32), and per-category entry counts stay within
        // what's actually purchasable (matches the "one upgrade point per five levels, up to 12" rule
        // plus per-category node counts in arpg-skills.js / arpg-cards.js).
        return treePoints <= Math.Min(32, build.Level / 2) && cards <= build.Level - 1
            && training <= 9_007_199_254_740_991L
            && build.Upgrades.Count(upgrade => upgrade.Category == "tree") <= 48
            && build.Upgrades.Count(upgrade => upgrade.Category == "forge") <= 16
            && build.Upgrades.Count(upgrade => upgrade.Category == "card") <= 20
            && build.Upgrades.Count(upgrade => upgrade.Category == "mastery") <= 7;
    }

    /// <summary>
    /// Guards against garbage strings being stored as labels: rejects null/empty/whitespace-only
    /// values, anything absurdly long (over 100 chars), and control characters that could otherwise
    /// break rendering or storage formatting.
    /// </summary>
    private static bool ValidLabel(string? value) => !string.IsNullOrWhiteSpace(value)
        && value.Length <= 100 && !value.Any(char.IsControl);
}
