namespace Path_of_Boredom.ServiceDefaults;

public sealed record ScoreSubmission(string Difficulty, string Mode, long Score, string HeroClass = "knight", RankingBuild? Build = null);
public sealed record RankingRow(int Rank, string Player, long Score, DateTimeOffset? AchievedAt, bool IsCurrentUser, string? HeroClass = null, RankingBuild? Build = null);
public sealed record RankingBuild(long Level, IReadOnlyList<RankingUpgrade> Upgrades, string ManualSkill, IReadOnlyList<string> AutoSkills);
public sealed record RankingUpgrade(string Category, string Name, long Rank);

public static class RankingRules
{
    public static bool IsDifficulty(string? value) => value is "hard" or "nightmare" or "inferno";
    public static bool IsMode(string? value) => value is "campaign" or "endless" or "ascended";
    public static bool IsClass(string? value) => value is "knight" or "ranger" or "warden";
    public static string ClassName(string? value) => value switch
    {
        "knight" => "Ember Knight",
        "ranger" => "Dawn Ranger",
        "warden" => "Iron Warden",
        _ => "—"
    };
    public static bool IsValid(ScoreSubmission value) => IsDifficulty(value.Difficulty)
        && IsMode(value.Mode) && IsClass(value.HeroClass) && value.Score is >= 0 and <= 9_007_199_254_740_991L
        && (value.Build is null || IsValidBuild(value.Build));

    public static string DifficultyName(string value) => value switch
    {
        "hard" => "Hard — easiest / recommended start",
        "nightmare" => "Nightmare — tougher enemies, less healing",
        "inferno" => "Inferno — hardest / least forgiving",
        _ => value
    };

    public static string UpgradeCategory(string value) => value switch
    {
        "tree" => "Skill trees",
        "forge" => "Forge upgrades",
        "card" => "Level-up cards",
        "mastery" => "Post-forge training",
        _ => value
    };

    private static bool IsValidBuild(RankingBuild build)
    {
        if (build.Level is < 1 or > 9_007_199_254_740_991L
            || build.Upgrades is null || build.Upgrades.Count > 55
            || !ValidLabel(build.ManualSkill) || build.AutoSkills is null || build.AutoSkills.Count > 2
            || build.AutoSkills.Any(skill => !ValidLabel(skill))
            || build.AutoSkills.Distinct(StringComparer.Ordinal).Count() != build.AutoSkills.Count
            || build.AutoSkills.Contains(build.ManualSkill)) return false;

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
            if (upgrade.Category == "tree")
            {
                if (upgrade.Rank > 3) return false;
                treePoints += upgrade.Rank;
            }
            if (upgrade.Category == "forge" && upgrade.Rank > 50) return false;
            if (upgrade.Category == "card") cards += upgrade.Rank;
            if (upgrade.Category == "mastery") training += upgrade.Rank;
        }
        return treePoints <= Math.Min(32, build.Level / 2) && cards <= build.Level - 1
            && training <= 9_007_199_254_740_991L
            && build.Upgrades.Count(upgrade => upgrade.Category == "tree") <= 24
            && build.Upgrades.Count(upgrade => upgrade.Category == "forge") <= 10
            && build.Upgrades.Count(upgrade => upgrade.Category == "card") <= 14
            && build.Upgrades.Count(upgrade => upgrade.Category == "mastery") <= 7;
    }

    private static bool ValidLabel(string? value) => !string.IsNullOrWhiteSpace(value)
        && value.Length <= 100 && !value.Any(char.IsControl);
}
