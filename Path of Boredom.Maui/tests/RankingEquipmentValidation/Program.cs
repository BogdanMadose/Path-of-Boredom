using System.Text.Json;
using Path_of_Boredom.ServiceDefaults;

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var equipment = new RankingEquipment("Emberforged blade", 72, "heavy", "Watchkeeper's mail", 20, "light");
var build = new RankingBuild(12, [], "None", ["Cinder relay"], equipment);
var submission = new ScoreSubmission("hard", "endless", 100, "knight", build, "release");
Check(RankingRules.IsValid(submission), "Equipment ranking should be valid.");
var restored = JsonSerializer.Deserialize<ScoreSubmission>(JsonSerializer.Serialize(submission, json), json)!;
Check(restored.Build?.Equipment == equipment, "Equipment must survive the persisted JSON round trip.");
Check(RankingRules.IsValid(restored), "Round-tripped ranking should remain valid.");

var legacy = JsonSerializer.Deserialize<RankingBuild>("{\"level\":12,\"upgrades\":[],\"manualSkill\":\"None\",\"autoSkills\":[\"Cinder relay\"]}", json)!;
Check(legacy.Equipment is null && RankingRules.IsValid(submission with { Build = legacy }), "Older records must remain valid without invented equipment.");
foreach (var invalid in new[]
{
    equipment with { Weapon = "" },
    equipment with { Armor = new string('x', 101) },
    equipment with { Weapon = "blade\nforged" },
    equipment with { WeaponRating = -1 },
    equipment with { WeaponRating = 9_007_199_254_740_992L },
    equipment with { ArmorRating = -1 },
    equipment with { ArmorRating = 41 },
    equipment with { WeaponStyle = "plated" },
    equipment with { ArmorStyle = "heavy" },
    equipment with { WeaponStyle = null! }
})
    Check(!RankingRules.IsValid(submission with { Build = build with { Equipment = invalid } }), "Invalid equipment must be rejected.");

foreach (var weapon in new[] { "balanced", "heavy", "swift" })
    foreach (var armor in new[] { "balanced", "plated", "light" })
        Check(RankingRules.IsValid(submission with { Build = build with { Equipment = equipment with { WeaponStyle = weapon, ArmorStyle = armor, WeaponRating = 0, ArmorRating = 40 } } }), "Every valid style combination must be accepted.");
Check(RankingRules.WeaponStyleName("heavy").Contains("-15%"), "Weapon drawback must be visible.");
Check(RankingRules.ArmorStyleName("light").Contains("-8 armor"), "Armor drawback must be visible.");

if (args.Length > 0)
{
    var fixtures = JsonSerializer.Deserialize<ScoreSubmission[]>(File.ReadAllText(args[0]), json)!;
    Check(fixtures.Length == 27 && fixtures.All(RankingRules.IsValid), "All real client equipment ranking payloads must pass server rules.");
    Check(fixtures.All(fixture => JsonSerializer.Deserialize<ScoreSubmission>(JsonSerializer.Serialize(fixture, json), json)?.Build?.Equipment == fixture.Build?.Equipment), "Client equipment must survive server persistence serialization.");
}
Console.WriteLine("PASS: ranking equipment validation, JSON persistence, legacy compatibility, invalid fields, style labels and real client payloads");
