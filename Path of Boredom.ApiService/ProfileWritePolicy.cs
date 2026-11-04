using System.Text.Json;

using System.Text;

namespace Path_of_Boredom.ApiService;

internal static class ProfileWritePolicy
{
    public static bool HasValidAchievements(JsonElement profile)
    {
        if (!profile.TryGetProperty("achievements", out var achievements)) return true;
        if (achievements.ValueKind != JsonValueKind.Object) return false;
        var names = new HashSet<string>(StringComparer.Ordinal);
        foreach (var achievement in achievements.EnumerateObject())
        {
            if (names.Count >= 128 || achievement.Name.Length is < 1 or > 64
                || achievement.Name.Any(c => !(c is >= 'a' and <= 'z' or >= '0' and <= '9' or '_'))
                || !names.Add(achievement.Name) || !IsUnlocked(achievement.Value)) return false;
        }
        return true;
    }

    public static string MergeAchievements(JsonElement stored, JsonElement incoming)
    {
        if (!stored.TryGetProperty("achievements", out var unlocked) || unlocked.ValueKind != JsonValueKind.Object)
            return incoming.GetRawText();

        var names = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var achievement in unlocked.EnumerateObject())
            if (IsUnlocked(achievement.Value)) names.Add(achievement.Name);
        if (incoming.TryGetProperty("achievements", out var proposed) && proposed.ValueKind == JsonValueKind.Object)
            foreach (var achievement in proposed.EnumerateObject())
                if (IsUnlocked(achievement.Value)) names.Add(achievement.Name);

        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            foreach (var property in incoming.EnumerateObject())
                if (property.Name != "achievements") property.WriteTo(writer);
            writer.WriteStartObject("achievements");
            foreach (var name in names) writer.WriteNumber(name, 1);
            writer.WriteEndObject();
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    private static bool IsUnlocked(JsonElement value) =>
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number == 1;
}
