namespace Path_of_Boredom.ServiceDefaults;

public sealed record ScoreSubmission(string Difficulty, string Mode, long Score, string HeroClass = "knight");
public sealed record RankingRow(int Rank, string Player, long Score, DateTimeOffset? AchievedAt, bool IsCurrentUser, string? HeroClass = null);

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
        && IsMode(value.Mode) && IsClass(value.HeroClass) && value.Score is >= 0 and <= 9_007_199_254_740_991L;
}
