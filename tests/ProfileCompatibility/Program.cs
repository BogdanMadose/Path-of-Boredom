using System.Text.Json;
using Path_of_Boredom.ApiService;

var passed = 0;
Run("legacy write retains achievements and incoming progression", () =>
{
    var stored = Profile("\"achievements\":{\"first_blood\":1},", embers: 100);
    var legacy = Profile(embers: 50, rank: 1);
    var result = Merge(stored, legacy);
    Unlocks(result, "first_blood");
    Equal(50, result.GetProperty("embers").GetInt32());
    Equal(1, result.GetProperty("camp").GetProperty("might").GetInt32());
    foreach (var property in legacy.EnumerateObject())
        Check(JsonElement.DeepEquals(property.Value, result.GetProperty(property.Name)), property.Name + " changed");
});
Run("empty achievement map cannot clear unlocks", () =>
{
    Unlocks(Merge(Profile("\"achievements\":{\"first_blood\":1},"), Profile("\"achievements\":{},")), "first_blood");
});
Run("new clients union overlapping and distinct achievements", () =>
{
    var a = Profile("\"achievements\":{\"first_blood\":1,\"chapter_1\":1},");
    var b = Profile("\"achievements\":{\"first_blood\":1,\"first_fall\":1},");
    Unlocks(Merge(a, b), "chapter_1", "first_blood", "first_fall");
    Unlocks(Merge(b, a), "chapter_1", "first_blood", "first_fall");
});
Run("transaction retry against latest snapshot retains both writers", () =>
{
    var original = Profile("\"achievements\":{},");
    var a = Profile("\"achievements\":{\"chapter_1\":1},");
    var b = Profile("\"achievements\":{\"first_fall\":1},");
    var afterA = Merge(original, a);
    var retryB = Merge(afterA, b);
    Unlocks(retryB, "chapter_1", "first_fall");
    Check(JsonElement.DeepEquals(retryB, Merge(retryB, b)), "merge is not idempotent");
    var afterLegacy = Merge(retryB, Profile(embers: 90));
    Unlocks(afterLegacy, "chapter_1", "first_fall");
    Equal(90, afterLegacy.GetProperty("embers").GetInt32());
});
Run("older profiles without achievements remain compatible", () =>
{
    var incoming = Profile();
    Check(ProfileWritePolicy.HasValidAchievements(incoming), "legacy profile rejected");
    Check(JsonElement.DeepEquals(incoming, Merge(Profile(), incoming)), "legacy shape changed");
    var modern = Profile("\"achievements\":{\"first_blood\":1},");
    Check(JsonElement.DeepEquals(modern, Merge(Profile(), modern)), "first modern write changed");
});
Run("future unlock IDs survive legacy saves", () =>
{
    Unlocks(Merge(Profile("\"achievements\":{\"future_achievement_1\":1},"), Profile()), "future_achievement_1");
});
Run("malformed payloads remain rejected", () =>
{
    foreach (var json in new[] { "null", "[]", "true", "{\"first_blood\":0}", "{\"first_blood\":true}",
        "{\"first_blood\":\"1\"}", "{\"bad-key\":1}", "{\"\":1}", "{\"first_blood\":1,\"first_blood\":1}" })
        Check(!ProfileWritePolicy.HasValidAchievements(Profile("\"achievements\":" + json + ",")), "accepted " + json);
    var tooMany = string.Join(',', Enumerable.Range(0, 129).Select(i => $"\"a_{i}\":1"));
    Check(!ProfileWritePolicy.HasValidAchievements(Profile("\"achievements\":{" + tooMany + "},")), "accepted >128 unlocks");
});
Run("all released achievement IDs survive a legacy round trip within request limit", () =>
{
    var mappingPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
        "../../../../../Path of Boredom.Maui/Resources/Raw/play-games-achievements.json"));
    using var mappings = JsonDocument.Parse(File.ReadAllText(mappingPath));
    var ids = mappings.RootElement.EnumerateObject().Select(p => p.Name).ToArray();
    var stored = Profile("\"achievements\":" + JsonSerializer.Serialize(ids.ToDictionary(id => id, _ => 1)) + ",");
    var result = Merge(stored, Profile());
    Unlocks(result, ids);
    Check(ProfileWritePolicy.HasValidAchievements(result), "merged catalogue rejected");
    Check(System.Text.Encoding.UTF8.GetByteCount(result.GetRawText()) < 8192, "catalogue exceeds profile request limit");
});
Console.WriteLine($"PASS: {passed} profile compatibility regression checks.");

void Run(string name, Action test)
{
    test();
    passed++;
    Console.WriteLine("PASS: " + name);
}
static JsonElement Profile(string extra = "", int embers = 100, int rank = 0) => Parse(
    "{" + extra + $"\"embers\":{embers},\"lifetimeEmbers\":100,\"rev\":2,\"camp\":{{\"might\":{rank}}}," +
    "\"mastery\":{\"knight\":{\"level\":3,\"xp\":12}},\"unlocked\":{\"knight\":1},\"victories\":{},\"trim\":{},\"codex\":{}}");
static JsonElement Parse(string json)
{
    using var document = JsonDocument.Parse(json);
    return document.RootElement.Clone();
}
static JsonElement Merge(JsonElement stored, JsonElement incoming) => Parse(ProfileWritePolicy.MergeAchievements(stored, incoming));
static void Unlocks(JsonElement profile, params string[] expected)
{
    var actual = profile.GetProperty("achievements").EnumerateObject().ToArray();
    Check(actual.Select(p => p.Name).Order().SequenceEqual(expected.Order()), "unexpected unlock set");
    Check(actual.All(p => p.Value.GetInt32() == 1), "invalid unlock value");
}
static void Equal(int expected, int actual) => Check(expected == actual, $"expected {expected}, got {actual}");
static void Check(bool success, string message)
{
    if (!success) throw new InvalidOperationException(message);
}
