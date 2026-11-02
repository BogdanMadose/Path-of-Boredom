using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Path_of_Boredom.ApiService;

if (args.Length != 1) throw new ArgumentException("Pass the JSON fixture exported by wave-finales.test.mjs.");
var validate = typeof(GameSaveEndpoints).GetMethod("IsValidState", BindingFlags.NonPublic | BindingFlags.Static)
    ?? throw new InvalidOperationException("Save validator not found.");
var fixtures = JsonNode.Parse(File.ReadAllText(args[0]))!.AsArray();
foreach (var fixture in fixtures)
{
    var snapshot = fixture!.AsObject();
    Check(snapshot, true);
    var legacy = snapshot.DeepClone().AsObject();
    legacy["state"]!.AsObject().Remove("queuedEnemies");
    legacy["state"]!.AsObject().Remove("spawnTimer");
    Check(legacy, true);
    foreach (var count in new[] { -1d, 0.5, 129 })
    {
        var invalid = snapshot.DeepClone().AsObject();
        invalid["state"]!["queuedEnemies"] = count;
        Check(invalid, false);
    }
    foreach (var timer in new[] { -1d, 11 })
    {
        var invalid = snapshot.DeepClone().AsObject();
        invalid["state"]!["spawnTimer"] = timer;
        Check(invalid, false);
    }
}
Console.WriteLine($"PASS: API accepts {fixtures.Count} campaign/Endless boss-queue snapshots and legacy saves, rejects invalid queue metadata.");

void Check(JsonObject snapshot, bool expected)
{
    using var document = JsonDocument.Parse(snapshot.ToJsonString());
    var valid = (bool)validate.Invoke(null, [document.RootElement.GetProperty("state"), document.RootElement.GetProperty("version").GetInt32()])!;
    if (valid != expected) throw new InvalidOperationException($"Expected valid={expected} for wave {snapshot["state"]!["wave"]}.");
}
